"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { emitProjectSaved } from "@/lib/project-save-events";

interface InlineEditorProps {
  projectId: string;
  initialContent: string;
  versionLabel: string;
}

function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

export function InlineEditor({ projectId, initialContent, versionLabel }: InlineEditorProps) {
  const router = useRouter();
  const [content, setContent] = useState<string>(initialContent);
  const [isApproving, setIsApproving] = useState(false);
  const [isDraftSaving, setIsDraftSaving] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef(initialContent);
  const failedContentRef = useRef<string | null>(null);

  const wordCount = countWords(content);
  const originalWordCount = countWords(initialContent);
  const wordDiff = wordCount - originalWordCount;

  useEffect(() => {
    setContent(initialContent);
    lastSavedContentRef.current = initialContent;
  }, [initialContent]);

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
    if (isApproving || isDraftSaving) {
      return;
    }

    if (content === lastSavedContentRef.current) {
      return;
    }

    if (content === failedContentRef.current) {
      return;
    }

    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }

    saveDebounceRef.current = setTimeout(() => {
      void saveDraft(content);
    }, 800);

    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [content, isApproving, isDraftSaving]);

  async function handleApprove() {
    setIsApproving(true);
    try {
      if (content !== lastSavedContentRef.current) {
        await saveDraft(content);
      }

      const res = await fetch(`/api/projects/${projectId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save review");
      }
      router.refresh();
    } catch (err) {
      console.error("Review save error:", err);
      alert(err instanceof Error ? err.message : "Failed to save review. Please try again.");
    } finally {
      setIsApproving(false);
    }
  }

  function handleReset() {
    setContent(initialContent);
    failedContentRef.current = null;
    setDraftSaveError(null);
  }

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

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[500px] font-mono"
        disabled={isApproving}
        spellCheck
      />

      {draftSaveError && <p className="text-sm text-destructive">{draftSaveError}</p>}

      <div className="flex items-center gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={isApproving || content === initialContent}
        >
          Reset to Original
        </Button>
        <Button size="sm" onClick={handleApprove} disabled={isApproving || content.trim() === ""}>
          {isApproving ? "Saving…" : "Save & Approve"}
        </Button>
      </div>
    </div>
  );
}
