"use client";

import { useState, useCallback } from "react";
import {
  FileOutput,
  Code2,
  FileDown,
  FileText,
  FileCode,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StyledDocumentPreview } from "./styled-document-preview";
import type { Version } from "@repo/db";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ExportFormat = "html" | "pdf" | "docx" | "md";

interface FormatMeta {
  label: string;
  icon: typeof Code2;
  extension: string;
}

const FORMAT_META: Record<ExportFormat, FormatMeta> = {
  html: { label: "Export HTML", icon: Code2, extension: ".html" },
  pdf: { label: "Export PDF", icon: FileDown, extension: ".pdf" },
  docx: { label: "Export DOCX", icon: FileText, extension: ".docx" },
  md: { label: "Export Markdown", icon: FileCode, extension: ".md" },
};

const FORMAT_ORDER: ExportFormat[] = ["html", "pdf", "docx", "md"];

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ExportStepProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  finalVersion?: Version;
  stage12Status: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ExportStep({
  projectId,
  projectTitle,
  companyName,
  dealType,
  coverImageUrl,
  finalVersion,
  stage12Status,
}: ExportStepProps) {
  const canExport = stage12Status === "completed";
  const [loadingFormat, setLoadingFormat] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!canExport || loadingFormat) return;

      setLoadingFormat(format);
      setError(null);

      try {
        const params = new URLSearchParams({ format });
        if (coverImageUrl) {
          params.set("coverImageUrl", coverImageUrl);
        }
        const res = await fetch(`/api/projects/${projectId}/export?${params.toString()}`);

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Export failed" })) as { error?: string };
          throw new Error(body.error ?? `Export failed (${res.status})`);
        }

        // Download the blob
        const blob = await res.blob();
        const meta = FORMAT_META[format];
        const filename = `${projectTitle || "memo"}${meta.extension}`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Export failed unexpectedly";
        setError(message);
      } finally {
        setLoadingFormat(null);
      }
    },
    [canExport, loadingFormat, projectId, projectTitle, coverImageUrl]
  );

  if (!finalVersion) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          No final document found to export.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      {/* Left: preview */}
      <div className="rounded-xl border bg-card p-4">
        <StyledDocumentPreview
          content={finalVersion.content}
          projectTitle={projectTitle}
          companyName={companyName}
          dealType={dealType}
          coverImageUrl={coverImageUrl}
        />
      </div>

      {/* Right: export panel */}
      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 h-fit space-y-3">
        <div className="flex items-center gap-2">
          <FileOutput className="size-4 text-primary" />
          <h3 className="font-medium text-base">Export Ready</h3>
        </div>

        <Badge variant="outline">
          {finalVersion.word_count?.toLocaleString() ?? "?"} words
        </Badge>

        {!canExport && (
          <p className="text-xs text-muted-foreground">
            Complete Step 12 to enable export.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2">
            <AlertCircle className="size-4 shrink-0 text-destructive mt-0.5" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Export
          </p>
          <div className="space-y-2">
            {FORMAT_ORDER.map((format) => {
              const meta = FORMAT_META[format];
              const Icon = meta.icon;
              const isLoading = loadingFormat === format;
              const isDisabled = !canExport || loadingFormat !== null;

              return (
                <Button
                  key={format}
                  variant="outline"
                  className="w-full justify-start gap-2"
                  disabled={isDisabled}
                  onClick={() => handleExport(format)}
                >
                  {isLoading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Icon className="size-4" />
                  )}
                  {isLoading ? "Generating…" : meta.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
