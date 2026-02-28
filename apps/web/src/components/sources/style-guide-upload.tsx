"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";
import { Loader2, Upload, CheckCircle2, X } from "lucide-react";
import type { StyleGuide } from "@repo/db";

interface StyleGuideUploadProps {
  projectId: string;
  existingStyleGuide: StyleGuide | null;
}

export function StyleGuideUpload({ projectId, existingStyleGuide }: StyleGuideUploadProps) {
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    const selectedFile = selectedFiles[0];
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

      setSelectedFiles([]);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      {existingStyleGuide && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Uploaded style guide</p>
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="truncate">{existingStyleGuide.originalFilename}</span>
            </div>
            <span className="text-muted-foreground shrink-0">
              {existingStyleGuide.isProcessed ? "Processed" : "Ready"}
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">
          {existingStyleGuide ? "Replace style guide" : "Upload style guide"}
        </p>

        <FileUpload
          className="w-full"
          value={selectedFiles}
          onValueChange={setSelectedFiles}
          onFileReject={(_, message) => setError(message)}
          accept=".pdf,.txt,.docx"
          maxFiles={1}
        >
          <FileUploadDropzone>
            <div className="flex flex-col items-center gap-1 text-center">
              <div className="flex items-center justify-center rounded-full border p-2.5">
                <Upload className="size-5 text-muted-foreground" />
              </div>
              <p className="font-medium text-sm">Drag & drop style guide here</p>
              <p className="text-muted-foreground text-sm">
                Or click to browse (PDF, TXT, DOCX)
              </p>
            </div>
            <FileUploadTrigger asChild>
              <Button variant="outline" size="sm" className="mt-2 w-fit">
                Browse file
              </Button>
            </FileUploadTrigger>
          </FileUploadDropzone>

          <FileUploadList>
            {selectedFiles.map((file) => (
              <FileUploadItem key={file.name} value={file}>
                <FileUploadItemPreview />
                <FileUploadItemMetadata />
                <FileUploadItemDelete asChild>
                  <Button variant="ghost" size="icon" className="size-7">
                    <X className="h-4 w-4" />
                  </Button>
                </FileUploadItemDelete>
              </FileUploadItem>
            ))}
          </FileUploadList>
        </FileUpload>

        <Button
          size="sm"
          className="w-full"
          disabled={selectedFiles.length === 0 || isUploading}
          onClick={() => void handleUpload()}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5 mr-2" />
              Upload Style Guide
            </>
          )}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
