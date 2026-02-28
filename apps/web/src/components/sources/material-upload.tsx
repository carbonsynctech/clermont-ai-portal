"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import type { SourceMaterial } from "@repo/db";

const MATERIAL_TYPES = [
  { value: "financial_report", label: "Financial Report" },
  { value: "business_model", label: "Business Model" },
  { value: "cv_biography", label: "CV / Biography" },
  { value: "market_research", label: "Market Research" },
  { value: "legal_document", label: "Legal Document" },
  { value: "other", label: "Other" },
] as const;

type MaterialType = (typeof MATERIAL_TYPES)[number]["value"];

interface MaterialUploadProps {
  projectId: string;
  materials: SourceMaterial[];
}

export function MaterialUpload({ projectId, materials }: MaterialUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [materialType, setMaterialType] = useState<MaterialType | "">("");
  const [ndaAcknowledged, setNdaAcknowledged] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploaded, setLastUploaded] = useState<string | null>(null);

  const canUpload = selectedFile !== null && materialType !== "" && ndaAcknowledged;

  async function handleUpload() {
    if (!selectedFile || !materialType) return;

    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("materialType", materialType);
    formData.append("ndaAcknowledged", "true");

    try {
      const res = await fetch(`/api/projects/${projectId}/materials`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setUploadError(body.error ?? "Upload failed");
        return;
      }

      setLastUploaded(selectedFile.name);
      setSelectedFile(null);
      setMaterialType("");
      setNdaAcknowledged(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleFinalize() {
    setIsFinalizing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/materials/finalize`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setUploadError(body.error ?? "Failed to finalize");
        return;
      }

      router.refresh();
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setIsFinalizing(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Uploaded materials list */}
      {materials.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Uploaded materials</p>
          {materials.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="truncate">{m.originalFilename}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="text-[10px] h-4 px-1 capitalize">
                  {m.materialType.replace("_", " ")}
                </Badge>
                {m.chunkCount > 0 && (
                  <span className="text-muted-foreground">{m.chunkCount} chunks</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload form */}
      <div className="space-y-3 rounded-md border p-3">
        <p className="text-xs font-medium">Add source material</p>

        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">File (PDF, TXT, DOCX)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx"
            className="block w-full text-xs text-muted-foreground file:mr-3 file:py-1 file:px-2 file:rounded file:border file:border-border file:text-xs file:bg-muted file:text-foreground hover:file:bg-muted/80 cursor-pointer"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Material type</label>
          <select
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            value={materialType}
            onChange={(e) => setMaterialType(e.target.value as MaterialType | "")}
          >
            <option value="">Select type…</option>
            {MATERIAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            checked={ndaAcknowledged}
            onChange={(e) => setNdaAcknowledged(e.target.checked)}
          />
          <span className="text-xs text-muted-foreground leading-snug">
            I confirm this material is covered by appropriate NDA and I am authorised to upload it.
          </span>
        </label>

        {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
        {lastUploaded && (
          <p className="text-xs text-green-600">Uploaded: {lastUploaded}</p>
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

      {/* Finalize button */}
      {materials.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={isFinalizing}
          onClick={() => void handleFinalize()}
        >
          {isFinalizing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Finalizing…
            </>
          ) : (
            "Done Uploading – Proceed to Step 4"
          )}
        </Button>
      )}
    </div>
  );
}
