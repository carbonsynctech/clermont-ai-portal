"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Upload, CheckCircle2, X, Files } from "lucide-react";
import type { SourceMaterial } from "@repo/db";

interface MaterialUploadProps {
  projectId: string;
  materials: SourceMaterial[];
}

export function MaterialUpload({ projectId, materials }: MaterialUploadProps) {
  const router = useRouter();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [ndaAcknowledged, setNdaAcknowledged] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);

  const canUpload = selectedFiles.length > 0 && ndaAcknowledged;
  const hasMaterials = materials.length > 0;

  async function handleUpload() {
    const selectedFile = selectedFiles[0];
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // 1. Get a signed upload URL from the API
      const urlRes = await fetch(`/api/projects/${projectId}/materials/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type || "application/octet-stream",
        }),
      });

      if (!urlRes.ok) {
        const body = (await urlRes.json()) as { error?: string };
        setUploadError(body.error ?? "Failed to get upload URL");
        return;
      }

      const { signedUrl, token, storagePath } = (await urlRes.json()) as {
        signedUrl: string;
        token: string;
        storagePath: string;
      };

      // 2. Upload file directly to Supabase Storage (bypasses Vercel 4.5 MB limit)
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          "Content-Type": selectedFile.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: selectedFile,
      });

      if (!uploadRes.ok) {
        setUploadError("Failed to upload file to storage. Please try again.");
        return;
      }

      // 3. Register the material metadata with the API (small JSON payload)
      const res = await fetch(`/api/projects/${projectId}/materials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          originalFilename: selectedFile.name,
          mimeType: selectedFile.type || "application/octet-stream",
          fileSizeBytes: selectedFile.size,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setUploadError(body.error ?? "Upload failed");
        return;
      }

      setLastUploaded(selectedFile.name);
      setSelectedFiles([]);
      setNdaAcknowledged(false);
      router.refresh();
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFinalize() {
    setIsFinalizing(true);
    setUploadError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/materials/finalize`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setUploadError(body.error ?? "Failed to finalize");
        return;
      }

      router.push(`/projects/${projectId}?step=4`);
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setIsFinalizing(false);
    }
  }

  async function handlePrimaryAction() {
    if (hasMaterials) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    await handleFinalize();
  }

  return (
    <div className="space-y-5">
      {/* Uploaded materials panel */}
      {materials.length > 0 && (
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Files className="size-4 text-muted-foreground" />
            <h3 className="font-medium text-base">Uploaded materials</h3>
          </div>
          {materials.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="truncate">{m.originalFilename}</span>
              </div>
              {m.chunkCount > 0 && (
                <span className="text-muted-foreground shrink-0 ml-2">{m.chunkCount} chunks</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add source material panel */}
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="size-4 text-muted-foreground" />
          <h3 className="font-medium text-base">Add source material</h3>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <label className="text-sm text-muted-foreground">File (PDF, DOCX, TXT, CSV)</label>
            <span className="text-xs text-muted-foreground/60">Max 20 MB per file</span>
          </div>
          <FileUpload
            className="w-full"
            value={selectedFiles}
            onValueChange={(files) => {
              setSelectedFiles(files);
              if (files.length > 0) {
                setNdaAcknowledged(true);
              }
            }}
            onFileReject={(_, message) => setUploadError(message)}
            accept=".pdf,.txt,.docx,.doc,.csv"
            maxFiles={1}
            maxSize={20 * 1024 * 1024}
          >
            <FileUploadDropzone>
              <div className="flex flex-col items-center gap-1 text-center">
                <div className="flex items-center justify-center rounded-full border p-2.5">
                  <Upload className="size-5 text-muted-foreground" />
                </div>
                <p className="font-medium text-sm">Drag & drop file here</p>
                <p className="text-muted-foreground text-xs">
                  PDF, DOCX, TXT, or CSV — up to 20 MB
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
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
            checked={ndaAcknowledged}
            onChange={(e) => setNdaAcknowledged(e.target.checked)}
          />
          <span className="text-sm text-muted-foreground leading-snug">
            I confirm this material is covered by appropriate NDA and I am authorised to upload it.
          </span>
        </label>

        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        {lastUploaded && (
          <p className="text-sm text-green-600">Uploaded: {lastUploaded}</p>
        )}

        <Button
          size="sm"
          className="w-full"
          disabled={!canUpload || isUploading}
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
              Upload File
            </>
          )}
        </Button>
      </div>

      {/* Sticky bar */}
      <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 backdrop-blur px-5 py-3.5 shadow-lg">
        <div className="flex items-center gap-3">
          <Files className="size-4 text-muted-foreground" />
          <span className="text-base text-muted-foreground">
            {materials.length} source material{materials.length === 1 ? "" : "s"} uploaded
          </span>
          {materials.length > 0 && (
            <Badge variant="secondary" className="text-sm h-5 px-1.5">
              Ready for Step 4
            </Badge>
          )}
        </div>

        <Button
          variant="default"
          className="shrink-0"
          disabled={hasMaterials ? isUploading : isFinalizing || isUploading}
          onClick={() => void handlePrimaryAction()}
        >
          {isFinalizing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            "Save and continue to Step 4"
          )}
        </Button>
      </div>
    </div>
  );
}
