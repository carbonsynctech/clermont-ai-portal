"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import type { StyleGuide } from "@repo/db";

interface StyleGuideUploadProps {
  projectId: string;
  existingStyleGuide: StyleGuide | null;
}

export function StyleGuideUpload({ projectId, existingStyleGuide }: StyleGuideUploadProps) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!selectedFile) return;
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch(`/api/projects/${projectId}/style-guide`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Upload failed");
        return;
      }

      setSelectedFile(null);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  if (existingStyleGuide) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="text-foreground truncate">
          Style guide: {existingStyleGuide.originalFilename}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Upload your style guide (PDF or TXT)</p>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept=".pdf,.txt,.docx"
          className="block flex-1 text-xs text-muted-foreground file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-border file:text-xs file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        />
        <Button
          size="sm"
          disabled={!selectedFile || isUploading}
          onClick={() => void handleUpload()}
          className="shrink-0"
        >
          {isUploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
