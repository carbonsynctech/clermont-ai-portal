"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowUp, Loader2, Wand2, Paintbrush } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useStepTrigger, StepTriggerButton, StepTriggerOutput } from "@/components/projects/step-trigger";
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
import type { DocumentColors } from "./document-template";
import type { Version, StyleGuide } from "@repo/db";

// ─── Props ────────────────────────────────────────────────────────────────────

interface StyleEditStepProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  stage5Status: string;
  stage7Status: string;
  styledVersion: Version | undefined;
  latestStyleGuide: StyleGuide | null;
  coverImageUrl?: string;
  colors?: DocumentColors;
  onRunningChange?: (running: boolean) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StyleEditStep({
  projectId,
  projectTitle,
  companyName,
  dealType,
  stage5Status,
  stage7Status,
  styledVersion,
  latestStyleGuide,
  coverImageUrl,
  colors,
  onRunningChange,
}: StyleEditStepProps) {
  const canRun = stage5Status === "completed";
  const isCompleted = stage7Status === "completed";

  const trigger = useStepTrigger(projectId, 7, stage7Status, canRun && !!latestStyleGuide);

  useEffect(() => {
    onRunningChange?.(trigger.isRunning);
  }, [trigger.isRunning, onRunningChange]);

  // ── sessionStorage keys ─────────────────────────────────────────────────
  const chatKey = `style-edit-chat-${projectId}`;
  const contentKey = `style-edit-content-${projectId}`;
  const versionKey = `style-edit-version-${projectId}`;

  const prevVersionIdRef = useRef(styledVersion?.id);

  // ── Document display state ──────────────────────────────────────────────
  const [displayContent, setDisplayContent] = useState<string>(() => {
    try {
      const savedVer = sessionStorage.getItem(versionKey);
      const savedContent = sessionStorage.getItem(contentKey);
      if (savedVer === (styledVersion?.id ?? "") && savedContent !== null) {
        return savedContent;
      }
    } catch { /* ignore */ }
    return styledVersion?.content ?? "";
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(contentKey, displayContent);
      sessionStorage.setItem(versionKey, styledVersion?.id ?? "");
    } catch { /* ignore */ }
  }, [displayContent, contentKey, versionKey, styledVersion?.id]);

  // ── Chat state ──────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const savedVer = sessionStorage.getItem(versionKey);
      const raw = sessionStorage.getItem(chatKey);
      if (savedVer === (styledVersion?.id ?? "") && raw) {
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

  // Reset on new version
  useEffect(() => {
    if (prevVersionIdRef.current === styledVersion?.id) return;
    prevVersionIdRef.current = styledVersion?.id;
    try {
      sessionStorage.removeItem(chatKey);
      sessionStorage.removeItem(contentKey);
    } catch { /* ignore */ }
    setDisplayContent(styledVersion?.content ?? "");
    setMessages([]);
  }, [styledVersion?.id, styledVersion?.content, chatKey, contentKey]);

  // ── Chat I/O ────────────────────────────────────────────────────────────
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { status: jobStatus, partialOutput } = useJobStatus(activeJobId);
  const isGenerating = isDispatching || activeJobId !== null;

  // Stream tokens
  useEffect(() => {
    if (!partialOutput || !activeJobId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeJobId ? { ...m, content: partialOutput, isStreaming: true } : m,
      ),
    );
  }, [partialOutput, activeJobId]);

  // Finalise
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

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const text = inputRef.current?.value.trim() ?? "";
    if (!text || isGenerating) return;

    if (inputRef.current) inputRef.current.value = "";

    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: "user", content: text };
    const placeholderId = crypto.randomUUID();
    const placeholder: ChatMsg = {
      id: placeholderId,
      role: "assistant",
      content: "",
      isLoading: true,
    };
    setMessages((prev) => [...prev, userMsg, placeholder]);
    setIsDispatching(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/style-edit/fix`, {
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

  // ── Pre-completion: show trigger ────────────────────────────────────────
  if (!isCompleted || !styledVersion) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-4">
        {latestStyleGuide ? (
          <>
            <div className="space-y-2">
              <h3 className="font-medium text-base mb-1">Style Guide</h3>
              <div className="flex items-center justify-between text-base">
                <span className="truncate text-foreground">
                  {latestStyleGuide.originalFilename}
                </span>
                <span className="text-muted-foreground shrink-0 ml-2">Ready</span>
              </div>
            </div>
            <StepTriggerButton
              trigger={trigger}
              label="Apply Style Guide & Edit"
              disabled={!canRun}
              disabledReason="Complete Step 5 to run this step."
            />
            <StepTriggerOutput trigger={trigger} />
          </>
        ) : (
          <p className="text-base text-muted-foreground">
            Upload a style guide in Step 6 before running this step.
          </p>
        )}
      </div>
    );
  }

  // ── Post-completion: two-column layout ──────────────────────────────────
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">
      {/* Left – styled document preview */}
      <div className="rounded-xl border bg-card p-4 space-y-3 min-w-0">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <Paintbrush className="size-4 text-primary" />
            <h3 className="font-medium text-base text-foreground">Styled V2 Preview</h3>
          </div>
          <span className="text-sm text-muted-foreground">
            {styledVersion.wordCount?.toLocaleString() ?? "?"} words
          </span>
        </div>

        <StyledDocumentPreview
          content={displayContent}
          projectTitle={projectTitle}
          companyName={companyName}
          dealType={dealType}
          coverImageUrl={coverImageUrl}
          colors={colors}
        />
      </div>

      {/* Right – chat panel (sticky) */}
      <div className="sticky top-4">
        <div className="rounded-xl border bg-card flex flex-col max-h-[calc(100vh-6rem)] min-h-[400px] overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
            <Wand2 className="size-4 text-primary" />
            <h3 className="font-medium text-sm text-foreground">Refine Style</h3>
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
                <div className="flex flex-col items-center justify-center h-full py-12 gap-3 text-center">
                  <div className="rounded-full bg-primary/10 dark:bg-primary/20 p-3">
                    <Wand2 className="size-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Refine the styled document
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                      Describe changes you'd like — tone adjustments, section rewrites, or
                      formatting tweaks. Changes are highlighted in{" "}
                      <mark className="bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary-foreground rounded-sm px-0.5 not-italic">
                        violet
                      </mark>
                      .
                    </p>
                  </div>
                  <div className="grid gap-1.5 w-full max-w-[280px] text-left">
                    {[
                      "Make the executive summary more concise",
                      "The risk section needs a stronger warning tone",
                      "Add more transitional sentences between sections",
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
                        <AssistantContent
                          content={msg.content}
                          isStreaming={msg.isStreaming}
                        />
                        {!msg.isStreaming && !msg.isLoading && !msg.isError && msg.content && (
                          <CopyButton
                            text={parseFixResponse(msg.content)?.replacement ?? msg.content}
                          />
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
                placeholder="Describe what to change… (Enter to send)"
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
