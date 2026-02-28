"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
  const [content, setContent] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(`review-draft-${projectId}`) ?? initialContent;
    }
    return initialContent;
  });
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordCount = countWords(content);
  const originalWordCount = countWords(initialContent);
  const wordDiff = wordCount - originalWordCount;

  // Auto-save to localStorage every 5s
  useEffect(() => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      localStorage.setItem(`review-draft-${projectId}`, content);
    }, 5000);
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [content, projectId]);

  async function handleApprove() {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to save review");
      }
      localStorage.removeItem(`review-draft-${projectId}`);
      router.refresh();
    } catch (err) {
      console.error("Review save error:", err);
      alert(err instanceof Error ? err.message : "Failed to save review. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setContent(initialContent);
    localStorage.removeItem(`review-draft-${projectId}`);
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

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full min-h-[500px] rounded-md border border-input bg-background p-3 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={isSaving}
        spellCheck
      />

      <div className="flex items-center gap-2 justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          disabled={isSaving || content === initialContent}
        >
          Reset to Original
        </Button>
        <Button size="sm" onClick={handleApprove} disabled={isSaving || content.trim() === ""}>
          {isSaving ? "Saving…" : "Save & Approve"}
        </Button>
      </div>
    </div>
  );
}
