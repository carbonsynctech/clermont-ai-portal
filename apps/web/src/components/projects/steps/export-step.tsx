"use client";

import { FileOutput, Code2, FileDown, FileText, FileCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StyledDocumentPreview } from "./styled-document-preview";
import type { Version } from "@repo/db";

interface ExportStepProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  finalVersion?: Version;
  stage12Status: string;
}

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

  if (!finalVersion) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <p className="text-sm text-muted-foreground">No final document found to export.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border bg-card p-4">
        <StyledDocumentPreview
          content={finalVersion.content}
          projectTitle={projectTitle}
          companyName={companyName}
          dealType={dealType}
          coverImageUrl={coverImageUrl}
        />
      </div>

      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 h-fit space-y-3">
        <div className="flex items-center gap-2">
          <FileOutput className="size-4 text-primary" />
          <h3 className="font-medium text-base">Export Ready — V7</h3>
        </div>
        <Badge variant="outline">
          {finalVersion.wordCount?.toLocaleString() ?? "?"} words
        </Badge>

        {!canExport && (
          <p className="text-xs text-muted-foreground">Complete Step 12 to enable export.</p>
        )}

        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Export
          </p>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" asChild disabled={!canExport}>
              <a
                href={`/api/projects/${projectId}/export?format=html`}
                download
                aria-disabled={!canExport}
              >
                <Code2 className="size-4" />
                Generate HTML
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild disabled={!canExport}>
              <a href={`/api/projects/${projectId}/export`} download aria-disabled={!canExport}>
                <FileDown className="size-4" />
                Generate PDF
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild disabled={!canExport}>
              <a
                href={`/api/projects/${projectId}/export?format=docx`}
                download
                aria-disabled={!canExport}
              >
                <FileText className="size-4" />
                Generate DOCX
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild disabled={!canExport}>
              <a
                href={`/api/projects/${projectId}/export?format=md`}
                download
                aria-disabled={!canExport}
              >
                <FileCode className="size-4" />
                Generate Markdown
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
