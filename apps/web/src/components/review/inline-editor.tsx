"use client";

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { emitProjectSaved } from "@/lib/project-save-events";

export interface InlineEditorHandle {
  approve: () => Promise<void>;
  reset: () => void;
}

interface InlineEditorProps {
  projectId: string;
  initialContent: string;
  versionLabel: string;
  compareContent?: string;
  /** When true, hides the internal action buttons (Reset / Save & Approve). */
  hideActions?: boolean;
  /** Called whenever the dirty state changes (content differs from initialContent). */
  onContentChange?: (isDirty: boolean) => void;
  /** Called after a successful approve (in addition to router.refresh()). */
  onApproveSuccess?: () => void;
}

function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

export const InlineEditor = forwardRef<InlineEditorHandle, InlineEditorProps>(
  function InlineEditor(
    { projectId, initialContent, versionLabel, compareContent, hideActions, onContentChange, onApproveSuccess },
    ref,
  ) {
    const router = useRouter();
    const [content, setContent] = useState<string>(initialContent);
    const [reviewNotes, setReviewNotes] = useState("");
    const [isApproving, setIsApproving] = useState(false);
    const [isDraftSaving, setIsDraftSaving] = useState(false);
    const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isApprovingRef = useRef(false);
    const lastSavedContentRef = useRef(initialContent);
    const failedContentRef = useRef<string | null>(null);
    const leftScrollRef = useRef<HTMLDivElement | null>(null);
    const rightTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const rightOverlayRef = useRef<HTMLDivElement | null>(null);
    const isSyncingScrollRef = useRef(false);

    const wordCount = countWords(content);
    const originalWordCount = countWords(initialContent);
    const wordDiff = wordCount - originalWordCount;

    useEffect(() => {
      setContent(initialContent);
      lastSavedContentRef.current = initialContent;
      setReviewNotes("");
    }, [initialContent]);

    // Notify parent when dirty state changes
    useEffect(() => {
      onContentChange?.(content !== initialContent);
    }, [content, initialContent, onContentChange]);

    async function saveDraft(nextContent: string) {
      setIsDraftSaving(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/review/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: nextContent }),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to save draft");
        }

        const data = (await res.json()) as { savedAt?: unknown };
        lastSavedContentRef.current = nextContent;
        failedContentRef.current = null;
        setDraftSaveError(null);

        if (typeof data.savedAt === "string") {
          emitProjectSaved({ projectId, savedAt: data.savedAt });
        }
      } catch (err) {
        failedContentRef.current = nextContent;
        setDraftSaveError(err instanceof Error ? err.message : "Failed to save draft");
      } finally {
        setIsDraftSaving(false);
      }
    }

    useEffect(() => {
      if (isApprovingRef.current || isDraftSaving) return;
      if (content === lastSavedContentRef.current) return;
      if (content === failedContentRef.current) return;

      if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);

      saveDebounceRef.current = setTimeout(() => {
        void saveDraft(content);
      }, 800);

      return () => {
        if (saveDebounceRef.current) {
          clearTimeout(saveDebounceRef.current);
          saveDebounceRef.current = null;
        }
      };
    }, [content, isDraftSaving]);

    async function handleApprove() {
      // Cancel any pending debounce first
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
      setIsApproving(true);
      isApprovingRef.current = true;
      try {
        if (content !== lastSavedContentRef.current) {
          await saveDraft(content);
        }

        const res = await fetch(`/api/projects/${projectId}/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content, reviewNotes }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Failed to save review");
        }
        router.refresh();
        onApproveSuccess?.();
      } catch (err) {
        console.error("Review save error:", err);
        alert(err instanceof Error ? err.message : "Failed to save review. Please try again.");
      } finally {
        setIsApproving(false);
        isApprovingRef.current = false;
      }
    }

    function handleReset() {
      setContent(initialContent);
      setReviewNotes("");
      failedContentRef.current = null;
      setDraftSaveError(null);
    }

    function syncScroll(from: "left" | "right") {
      if (isSyncingScrollRef.current) return;

      const leftEl = leftScrollRef.current;
      const rightEl = rightTextareaRef.current;
      const rightOverlayEl = rightOverlayRef.current;
      if (!leftEl || !rightEl) return;

      isSyncingScrollRef.current = true;

      if (from === "left") {
        rightEl.scrollTop = leftEl.scrollTop;
        if (rightOverlayEl) {
          rightOverlayEl.scrollTop = leftEl.scrollTop;
        }
      } else {
        leftEl.scrollTop = rightEl.scrollTop;
        if (rightOverlayEl) {
          rightOverlayEl.scrollTop = rightEl.scrollTop;
        }
      }

      requestAnimationFrame(() => {
        isSyncingScrollRef.current = false;
      });
    }

    const reviewTextClass = "text-sm leading-relaxed font-sans";

    const originalWordSet = new Set(
      (compareContent ?? "")
        .split(/\s+/)
        .map((word) => word.trim().toLowerCase())
        .filter(Boolean),
    );

    const editedTokens = content.split(/(\s+)/);

    function isChangedToken(token: string) {
      if (!token.trim()) return false;
      return !originalWordSet.has(token.toLowerCase());
    }

    useImperativeHandle(ref, () => ({
      approve: handleApprove,
      reset: handleReset,
    }));

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{versionLabel}</p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {wordCount.toLocaleString()} words
            </Badge>
            {wordDiff !== 0 && (
              <Badge
                variant={wordDiff > 0 ? "default" : "secondary"}
                className="text-xs"
              >
                {wordDiff > 0 ? "+" : ""}
                {wordDiff} words edited
              </Badge>
            )}
          </div>
        </div>

        {compareContent ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="w-full min-w-0 rounded-md border">
                <div className="border-b px-3 py-2 text-xs text-muted-foreground">Original (Final Styled V4)</div>
                <ScrollArea className="h-[500px]">
                  <div
                    ref={leftScrollRef}
                    onScroll={() => syncScroll("left")}
                    className="h-[500px] overflow-y-auto px-3 py-2"
                  >
                    <p className={`whitespace-pre-wrap break-words ${reviewTextClass}`}>
                      {compareContent ?? ""}
                    </p>
                  </div>
                </ScrollArea>
              </div>

              <div className="w-full min-w-0 rounded-md border">
                <div className="border-b px-3 py-2 text-xs text-muted-foreground">Edited (Human Review)</div>
                <div className="relative h-[500px]">
                  <div
                    ref={rightOverlayRef}
                    className="absolute inset-0 overflow-y-auto px-3 py-2 pointer-events-none"
                    aria-hidden="true"
                  >
                    <p className={`whitespace-pre-wrap break-words text-transparent ${reviewTextClass}`}>
                      {editedTokens.map((token, index) =>
                        isChangedToken(token) ? (
                          <mark key={`token-${index}`} className="rounded bg-purple-200/70 text-transparent px-0.5">
                            {token}
                          </mark>
                        ) : (
                          <span key={`token-${index}`}>{token}</span>
                        ),
                      )}
                    </p>
                  </div>

                  <Textarea
                    ref={rightTextareaRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onScroll={() => syncScroll("right")}
                    className={`h-[500px] min-h-[500px] resize-none border-0 rounded-none bg-transparent relative z-10 ${reviewTextClass}`}
                    disabled={isApproving}
                    spellCheck
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Review Notes</p>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add review notes or comments…"
                className="min-h-[80px]"
                disabled={isApproving}
              />
            </div>
          </div>
        ) : (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={`min-h-[500px] ${reviewTextClass}`}
            disabled={isApproving}
            spellCheck
          />
        )}

        {draftSaveError && <p className="text-sm text-destructive">{draftSaveError}</p>}

        {!hideActions && (
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isApproving || content === initialContent}
            >
              Reset to Original
            </Button>
            <Button size="sm" onClick={() => void handleApprove()} disabled={isApproving || content.trim() === ""}>
              {isApproving ? "Saving…" : "Save & Approve"}
            </Button>
          </div>
        )}
      </div>
    );
  },
);
