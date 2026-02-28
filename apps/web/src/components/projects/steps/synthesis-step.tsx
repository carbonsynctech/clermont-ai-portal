"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowUp, Loader2, Wand2, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StepTrigger } from "@/components/projects/step-trigger";
import { useJobStatus } from "@/hooks/use-job-status";
import { cn } from "@/lib/utils";
import type { Version } from "@repo/db";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
  isStreaming?: boolean;
  isError?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Render assistant content, converting <mark> tags to violet highlights. */
function AssistantContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  if (!content) {
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <Loader2 className="size-3.5 animate-spin" />
        Thinking…
      </span>
    );
  }

  // While streaming, show raw text (marks may be incomplete)
  if (isStreaming || !content.includes("<mark>")) {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>;
  }

  // Parse completed <mark>...</mark> spans
  const parts = content.split(/(<mark>[\s\S]*?<\/mark>)/g);
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        if (part.startsWith("<mark>") && part.endsWith("</mark>")) {
          return (
            <mark
              key={i}
              className="bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 rounded-sm px-0.5 not-italic"
            >
              {part.slice(6, -7)}
            </mark>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    // Strip <mark> tags for plain-text copy
    const plain = text.replace(/<\/?mark>/g, "");
    await navigator.clipboard.writeText(plain);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={() => void handleCopy()}
      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy replacement"}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SynthesisStepProps {
  projectId: string;
  stage4Status: string;
  stage5Status: string;
  synthesisVersion: Version | undefined;
}

export function SynthesisStep({
  projectId,
  stage4Status,
  stage5Status,
  synthesisVersion,
}: SynthesisStepProps) {
  const canRun = stage4Status === "completed";
  const isCompleted = stage5Status === "completed";

  // ── Chat state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isDispatching, setIsDispatching] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
      setActiveJobId(null);
    }
  }, [jobStatus, activeJobId]);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    setInput(el.value);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isGenerating) return;

    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

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
          <h3 className="font-medium text-base text-foreground">Synthesis</h3>
          <p className="text-base text-muted-foreground">
            Claude synthesises all 5 persona drafts into a single unified document using extended
            thinking. This becomes Version 1 of the memo.
          </p>
          <StepTrigger
            projectId={projectId}
            stepNumber={5}
            label="Synthesise Drafts"
            currentStatus={stage5Status}
            disabled={!canRun}
            disabledReason="Complete Step 4 to run this step."
            autoRun={canRun}
          />
        </div>
      </div>
    );
  }

  // ── Completed: two-column layout ─────────────────────────────────────────
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">

      {/* Left – synthesis document */}
      <div className="rounded-xl border bg-card p-6 space-y-4 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-base text-foreground">Synthesis V1</h3>
          <span className="text-sm text-muted-foreground">
            {synthesisVersion.wordCount?.toLocaleString() ?? "?"} words
          </span>
        </div>

        <div
          className="prose prose-sm dark:prose-invert max-w-none text-foreground
            [&_h1]:scroll-m-20 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight
            [&_h2]:scroll-m-20 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:first:mt-0
            [&_h3]:scroll-m-20 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight
            [&_h4]:scroll-m-20 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:tracking-tight
            [&_p]:leading-7 [&_p:not(:first-child)]:mt-4
            [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul>li]:mt-1
            [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol>li]:mt-1
            [&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-6 [&_blockquote]:italic
            [&_strong]:font-semibold
            [&_table]:w-full [&_table]:my-4 [&_tr]:m-0 [&_tr]:border-t [&_tr]:p-0 [&_tr:nth-child(even)]:bg-muted
            [&_th]:border [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold
            [&_td]:border [&_td]:px-4 [&_td]:py-2 [&_td]:text-left
            [&_hr]:my-4 [&_hr]:border [&_hr]:border-muted-foreground/20"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {synthesisVersion.content}
          </ReactMarkdown>
        </div>
      </div>

      {/* Right – chat panel (sticky) */}
      <div className="sticky top-4">
        <div className="rounded-xl border bg-card flex flex-col h-[600px] overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
            <Wand2 className="size-4 text-violet-500" />
            <h3 className="font-medium text-sm text-foreground">Fix an Issue</h3>
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
                  <div className="rounded-full bg-violet-100 dark:bg-violet-900/30 p-3">
                    <Wand2 className="size-5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Describe an issue to fix</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                      Paste a paragraph, describe what's wrong, and I'll suggest a replacement
                      with changes highlighted in{" "}
                      <mark className="bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200 rounded-sm px-0.5 not-italic">
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
                        onClick={() => setInput(s)}
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
                          <CopyButton text={msg.content} />
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
                ref={textareaRef}
                placeholder="Describe what to fix… (Enter to send, Shift+Enter for newline)"
                value={input}
                onChange={handleTextareaInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                rows={1}
                className="flex-1 resize-none min-h-[40px] max-h-[160px] text-sm py-2.5"
                disabled={isGenerating}
              />
              <Button
                size="icon"
                className="shrink-0 size-9 rounded-full bg-primary hover:bg-primary/90"
                onClick={() => void handleSend()}
                disabled={!input.trim() || isGenerating}
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
