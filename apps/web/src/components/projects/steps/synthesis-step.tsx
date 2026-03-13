"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowUp, ArrowRight, Loader2, Wand2, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StepTrigger, useStepTrigger, StepTriggerButton, StepTriggerOutput } from "@/components/projects/step-trigger";
import { useJobStatus } from "@/hooks/use-job-status";
import { cn } from "@/lib/utils";
import {
  type ChatMsg,
  parseFixResponse,
  applyFixToDocument,
  AssistantContent,
  CopyButton,
} from "./chat-utils";
import { MarkdownVersionPanel } from "../markdown-version-panel";
import type { Version } from "@repo/db";

// ─── Main component ───────────────────────────────────────────────────────────

interface SynthesisStepProps {
  projectId: string;
  stage4Status: string;
  stage5Status: string;
  synthesisVersion: Version | undefined;
  hasNewerOpinions?: boolean;
  onContinue?: () => void;
  onRunningChange?: (running: boolean) => void;
}

export function SynthesisStep({
  projectId,
  stage4Status,
  stage5Status,
  synthesisVersion,
  hasNewerOpinions = false,
  onContinue,
  onRunningChange,
}: SynthesisStepProps) {
  const canRun = stage4Status === "completed";
  const isCompleted = stage5Status === "completed";

  // ── sessionStorage keys (stable per project) ──────────────────────────────
  const chatKey = `synthesis-chat-${projectId}`;
  const contentKey = `synthesis-content-${projectId}`;
  const versionKey = `synthesis-version-${projectId}`;

  // Track the version ID seen on mount so we can detect genuine re-generations
  const prevVersionIdRef = useRef(synthesisVersion?.id);

  // ── Document display state (survives navigation, resets on new synthesis) ─
  const [displayContent, setDisplayContent] = useState<string>(() => {
    try {
      const savedVer = sessionStorage.getItem(versionKey);
      const savedContent = sessionStorage.getItem(contentKey);
      if (savedVer === (synthesisVersion?.id ?? "") && savedContent !== null) {
        return savedContent;
      }
    } catch { /* ignore */ }
    return synthesisVersion?.content ?? "";
  });

  // Persist displayContent to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(contentKey, displayContent);
      sessionStorage.setItem(versionKey, synthesisVersion?.id ?? "");
    } catch { /* ignore */ }
  }, [displayContent, contentKey, versionKey, synthesisVersion?.id]);

  // ── Chat state (survives navigation via sessionStorage) ───────────────────
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const savedVer = sessionStorage.getItem(versionKey);
      const raw = sessionStorage.getItem(chatKey);
      if (savedVer === (synthesisVersion?.id ?? "") && raw) {
        return JSON.parse(raw) as ChatMsg[];
      }
    } catch { /* ignore */ }
    return [];
  });

  // Persist messages to sessionStorage (skip in-progress loading bubbles)
  useEffect(() => {
    const stable = messages.filter((m) => !m.isLoading && !m.isStreaming);
    try {
      sessionStorage.setItem(chatKey, JSON.stringify(stable));
    } catch { /* ignore */ }
  }, [messages, chatKey]);

  // Reset when a genuinely new synthesis version is generated (via ref, avoids race with persist effect)
  useEffect(() => {
    if (prevVersionIdRef.current === synthesisVersion?.id) return;
    prevVersionIdRef.current = synthesisVersion?.id;
    try {
      sessionStorage.removeItem(chatKey);
      sessionStorage.removeItem(contentKey);
    } catch { /* ignore */ }
    setDisplayContent(synthesisVersion?.content ?? "");
    setMessages([]);
  }, [synthesisVersion?.id, synthesisVersion?.content, chatKey, contentKey]);

  // ── Re-synthesize trigger (for when opinions are regenerated) ────────────
  const resynthTrigger = useStepTrigger(projectId, 5, stage5Status);

  useEffect(() => {
    onRunningChange?.(resynthTrigger.isRunning);
  }, [resynthTrigger.isRunning, onRunningChange]);

  // Uncontrolled ref — reading value on send avoids re-rendering ReactMarkdown on every keystroke
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { status: jobStatus, partialOutput } = useJobStatus(activeJobId);
  const isGenerating = isDispatching || activeJobId !== null;

  // Stream tokens into the active assistant bubble
  useEffect(() => {
    if (!partialOutput || !activeJobId) return;
    setMessages((prev) =>
      prev.map((m) =>
        m.id === activeJobId ? { ...m, content: partialOutput, isStreaming: true } : m,
      ),
    );
  }, [partialOutput, activeJobId]);

  // Finalise assistant bubble when job completes or fails
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
                content: jobStatus === "failed" && !m.content ? "Generation failed. Please try again." : m.content,
              }
            : m,
        ),
      );
      // Auto-apply fix to the left-side document
      if (jobStatus === "completed" && partialOutput) {
        setDisplayContent((curr) => applyFixToDocument(curr, partialOutput));
      }
      setActiveJobId(null);
    }
  }, [jobStatus, activeJobId, partialOutput]);

  // Auto-scroll to latest message
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
      const res = await fetch(`/api/projects/${projectId}/synthesis/fix`, {
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

      // Replace placeholder id with real jobId so polling updates the right bubble
      setMessages((prev) =>
        prev.map((m) => (m.id === placeholderId ? { ...m, id: data.jobId! } : m)),
      );
      setActiveJobId(data.jobId);
    } finally {
      setIsDispatching(false);
    }
  }

  // ── Not completed: show trigger ───────────────────────────────────────────
  if (!isCompleted || !synthesisVersion) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h3 className="font-medium text-base text-foreground">Write Investment Memo</h3>
          <p className="text-base text-muted-foreground">
            Claude acts as the primary author, reading persona opinions and source material directly
            to write the full investment memo in one consistent voice using extended thinking.
            This becomes Version 1 of the memo.
          </p>
          <StepTrigger
            projectId={projectId}
            stepNumber={5}
            label="Write Investment Memo"
            currentStatus={stage5Status}
            disabled={!canRun}
            disabledReason="Complete Step 4 to run this step."
            onRunningChange={onRunningChange}
          />
        </div>
      </div>
    );
  }

  // ── Completed: two-column layout ─────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

      {/* Left – synthesis document */}
      <MarkdownVersionPanel
        title="Synthesis V1"
        content={displayContent}
        wordCount={synthesisVersion.word_count ?? undefined}
      />

      {/* Right – re-synth banner + chat panel (sticky) */}
      <div className="sticky top-4 space-y-3">
        {hasNewerOpinions && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="size-4 text-amber-600 dark:text-amber-400" />
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Persona opinions have been regenerated
              </p>
            </div>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
              The current memo was written from older opinions. Re-synthesize to write a new memo based on the latest expert input.
            </p>
            <StepTriggerButton
              trigger={resynthTrigger}
              label="Re-write Investment Memo"
            />
            <StepTriggerOutput trigger={resynthTrigger} />
          </div>
        )}

        <div className="rounded-xl border bg-card flex flex-col max-h-[calc(100vh-6rem)] min-h-[400px] overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
            <Wand2 className="size-4 text-muted-foreground" />
            <h3 className="font-medium text-base text-foreground">Fix an Issue</h3>
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
                    <p className="text-sm font-medium text-foreground">Describe an issue to fix</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                      Paste a paragraph, describe what's wrong, and I'll suggest a replacement
                      with changes highlighted in{" "}
                      <mark className="bg-primary/15 text-primary dark:bg-primary/30 dark:text-primary-foreground rounded-sm px-0.5 not-italic">
                        violet
                      </mark>
                      .
                    </p>
                  </div>
                  <div className="grid gap-1.5 w-full max-w-[280px] text-left">
                    {[
                      "The opening paragraph is too technical — simplify it",
                      "Rewrite the risk section to be more concise",
                      "The conclusion feels abrupt — expand it",
                    ].map((s) => (
                      <button
                        key={s}
                        onClick={() => { if (inputRef.current) { inputRef.current.value = s; inputRef.current.focus(); } }}
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
                placeholder="Describe what to fix… (Enter to send, Shift+Enter for newline)"
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

      {/* Optional follow-up CTA */}
      {onContinue && (
        <div className="rounded-xl border bg-card px-5 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Synthesis is complete. You can keep editing this step.
          </p>
          <Button variant="outline" onClick={onContinue} className="shrink-0">
            Update Synthesis
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      )}

    </div>
  );
}
