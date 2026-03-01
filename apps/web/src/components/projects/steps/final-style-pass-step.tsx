"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowUp, Loader2, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StepTriggerButton, StepTriggerOutput, useStepTrigger } from "@/components/projects/step-trigger";
import { StyledDocumentPreview } from "./styled-document-preview";
import { useJobStatus } from "@/hooks/use-job-status";
import { cn } from "@/lib/utils";
import {
  type ChatMsg,
  parseFixResponse,
  applyFixToDocument,
  AssistantContent,
  CopyButton,
} from "./chat-utils";
import type { Version } from "@repo/db";

// ── Props ────────────────────────────────────────────────────────────────────

interface FinalStylePassStepProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  factCheckedVersion?: Version;
  finalStyledVersion?: Version;
  stage8Status: string;
  stage9Status: string;
  onRunningChange?: (running: boolean) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function FinalStylePassStep({
  projectId,
  projectTitle,
  companyName,
  dealType,
  coverImageUrl,
  factCheckedVersion,
  finalStyledVersion,
  stage8Status,
  stage9Status,
  onRunningChange,
}: FinalStylePassStepProps) {
  void finalStyledVersion;
  const canRun = stage8Status === "completed";
  const trigger = useStepTrigger(projectId, 9, stage9Status, canRun);

  useEffect(() => {
    onRunningChange?.(trigger.isRunning);
  }, [onRunningChange, trigger.isRunning]);

  // ── sessionStorage keys ───────────────────────────────────────────────────
  const versionId = factCheckedVersion?.id ?? "";
  const chatKey = `final-style-chat-${projectId}`;
  const contentKey = `final-style-content-${projectId}`;
  const versionKey = `final-style-version-${projectId}`;
  const sourceContent = factCheckedVersion?.content ?? "";

  const prevVersionIdRef = useRef(versionId);

  // ── displayContent: live-patchable by AI fixes ────────────────────────────
  const [displayContent, setDisplayContent] = useState<string>(() => {
    if (!factCheckedVersion) return "";
    try {
      const savedVer = sessionStorage.getItem(versionKey);
      const savedContent = sessionStorage.getItem(contentKey);
      if (savedVer === versionId && savedContent !== null) {
        return savedContent;
      }
    } catch { /* ignore */ }
    return sourceContent;
  });

  useEffect(() => {
    if (!factCheckedVersion) return;
    try {
      sessionStorage.setItem(contentKey, displayContent);
      sessionStorage.setItem(versionKey, versionId);
    } catch { /* ignore */ }
  }, [displayContent, contentKey, versionKey, versionId, factCheckedVersion]);

  // ── Chat messages ─────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    if (!factCheckedVersion) return [];
    try {
      const savedVer = sessionStorage.getItem(versionKey);
      const raw = sessionStorage.getItem(chatKey);
      if (savedVer === versionId && raw) {
        return JSON.parse(raw) as ChatMsg[];
      }
    } catch { /* ignore */ }
    return [];
  });

  useEffect(() => {
    const stable = messages.filter((m) => !m.isLoading && !m.isStreaming);
    try {
      sessionStorage.setItem(chatKey, JSON.stringify(stable));
    } catch { /* ignore */ }
  }, [messages, chatKey]);

  // Reset when a new version arrives
  useEffect(() => {
    if (prevVersionIdRef.current === versionId) return;
    prevVersionIdRef.current = versionId;
    try {
      sessionStorage.removeItem(chatKey);
      sessionStorage.removeItem(contentKey);
    } catch { /* ignore */ }
    setDisplayContent(sourceContent);
    setMessages([]);
  }, [versionId, sourceContent, chatKey, contentKey]);

  // ── Job / streaming ───────────────────────────────────────────────────────
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { status: jobStatus, partialOutput } = useJobStatus(activeJobId);
  const isGenerating = isDispatching || activeJobId !== null;

  useEffect(() => {
    if (!partialOutput || !activeJobId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeJobId ? { ...m, content: partialOutput, isStreaming: true } : m,
      ),
    );
  }, [partialOutput, activeJobId]);

  useEffect(() => {
    if (!activeJobId) return;
    if (jobStatus === "completed" || jobStatus === "failed") {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === activeJobId
            ? {
                ...m,
                isStreaming: false,
                isLoading: false,
                isError: jobStatus === "failed",
                content:
                  jobStatus === "failed" && !m.content
                    ? "Generation failed. Please try again."
                    : m.content,
              }
            : m,
        ),
      );
      if (jobStatus === "completed" && partialOutput) {
        setDisplayContent((curr) => applyFixToDocument(curr, partialOutput));
      }
      setActiveJobId(null);
    }
  }, [jobStatus, activeJobId, partialOutput]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = inputRef.current?.value.trim() ?? "";
    if (!text || isGenerating) return;

    if (inputRef.current) inputRef.current.value = "";

    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: text };
    const placeholderId = crypto.randomUUID();
    const placeholder: ChatMsg = { id: placeholderId, role: "assistant", content: "", isLoading: true };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setIsDispatching(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/final-style/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

      const data = (await res.json()) as { jobId?: string; error?: string };

      if (!res.ok || !data.jobId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === placeholderId
              ? { ...m, content: data.error ?? "Failed to start job", isLoading: false, isError: true }
              : m,
          ),
        );
        return;
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === placeholderId ? { ...m, id: data.jobId! } : m)),
      );
      setActiveJobId(data.jobId);
    } finally {
      setIsDispatching(false);
    }
  }

  // ── No version yet: show trigger only ────────────────────────────────────
  if (!factCheckedVersion) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <StepTriggerButton
          trigger={trigger}
          label="Apply Final Style Pass"
          disabled={!canRun}
          disabledReason="Complete Step 8 to run this step."
        />
        <StepTriggerOutput trigger={trigger} />
      </div>
    );
  }

  // ── Two-column layout ─────────────────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

      {/* Left – final styled document */}
      <div className="rounded-xl border bg-card p-4">
        <StyledDocumentPreview
          content={displayContent}
          projectTitle={projectTitle}
          companyName={companyName}
          dealType={dealType}
          coverImageUrl={coverImageUrl}
        />
      </div>

      {/* Right – re-run card + chat panel */}
      <div className="sticky top-4 space-y-3">

        {/* Re-run info card */}
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            <h3 className="font-medium text-base">Final Style Pass V4</h3>
          </div>
          <Badge variant="outline">
              {factCheckedVersion.wordCount?.toLocaleString() ?? "?"} words
          </Badge>
          <StepTriggerButton
            trigger={trigger}
            label="Re-run Final Style Pass"
            disabled={!canRun}
            disabledReason="Complete Step 8 to run this step."
          />
          <StepTriggerOutput trigger={trigger} />
        </div>

        {/* Chat panel */}
        <div className="rounded-xl border bg-card flex flex-col max-h-[calc(100vh-20rem)] min-h-[360px] overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
            <Wand2 className="size-4 text-muted-foreground" />
            <h3 className="font-medium text-base text-foreground">Refine Style</h3>
            {isGenerating && (
              <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Generating…
              </span>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full py-8 gap-3 text-center">
                  <div className="rounded-full bg-primary/10 dark:bg-primary/20 p-3">
                    <Wand2 className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Refine with natural language</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                      Describe a change and I&apos;ll suggest a rewrite with changes highlighted in{" "}
                      <mark className="bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary-foreground rounded-sm px-0.5 not-italic">
                        violet
                      </mark>
                      .
                    </p>
                  </div>
                  <div className="grid gap-1.5 w-full max-w-[280px] text-left">
                    {[
                      "Make the conclusion more impactful",
                      "Tighten the executive summary",
                      "Improve the risk section flow",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          if (inputRef.current) {
                            inputRef.current.value = s;
                            inputRef.current.focus();
                          }
                        }}
                        className="text-xs text-left rounded-lg border px-3 py-2 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 max-w-[92%] text-sm break-words",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : msg.isError
                          ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm"
                          : "bg-muted text-foreground rounded-bl-sm",
                    )}
                  >
                    {msg.role === "user" ? (
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    ) : (
                      <>
                        <AssistantContent content={msg.content} isStreaming={msg.isStreaming} />
                        {!msg.isStreaming && !msg.isLoading && !msg.isError && msg.content && (
                          <CopyButton text={parseFixResponse(msg.content)?.replacement ?? msg.content} />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="border-t p-3 shrink-0">
            <div className="flex items-end gap-2">
              <Textarea
                ref={inputRef}
                placeholder="Describe what to refine… (Enter to send, Shift+Enter for newline)"
                defaultValue=""
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={2}
                className="flex-1 resize-none text-sm py-2.5"
                disabled={isGenerating}
              />
              <Button
                size="icon"
                className="shrink-0 size-9 rounded-full bg-primary hover:bg-primary/90"
                onClick={() => void handleSend()}
                disabled={isGenerating}
              >
                {isDispatching ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </Button>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
