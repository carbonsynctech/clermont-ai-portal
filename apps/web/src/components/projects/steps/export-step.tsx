"use client";

import { useEffect } from "react";
import { FileOutput, Code2, FileDown, FileText, FileCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  StepTriggerButton,
  StepTriggerOutput,
  useStepTrigger,
} from "@/components/projects/step-trigger";
import { StyledDocumentPreview } from "./styled-document-preview";
import type { Version } from "@repo/db";

interface ExportStepProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  finalVersion?: Version;
  exportedHtmlVersion?: Version;
  stage12Status: string;
  stage13Status: string;
  onRunningChange?: (running: boolean) => void;
}

export function ExportStep({
  projectId,
  projectTitle,
  companyName,
  dealType,
  coverImageUrl,
  finalVersion,
  exportedHtmlVersion,
  stage12Status,
  stage13Status,
  onRunningChange,
}: ExportStepProps) {
  const canRun = stage12Status === "completed";
  const trigger = useStepTrigger(projectId, 13, stage13Status, canRun);

  useEffect(() => {
    onRunningChange?.(trigger.isRunning);
  }, [onRunningChange, trigger.isRunning]);

  if (!exportedHtmlVersion || !finalVersion) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <StepTriggerButton
          trigger={trigger}
          label={
            stage13Status === "completed"
              ? "Regenerate HTML Export"
              : "Generate HTML Export"
          }
          disabled={!canRun}
          disabledReason="Complete Step 12 to run this step."
        />
        <StepTriggerOutput trigger={trigger} />
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
        <StepTriggerButton
          trigger={trigger}
          label="Regenerate HTML Export"
          disabled={!canRun}
          disabledReason="Complete Step 12 to run this step."
        />
        <StepTriggerOutput trigger={trigger} />

        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Export
          </p>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a
                href={`/api/projects/${projectId}/export?format=html`}
                download
              >
                <Code2 className="size-4" />
                Download HTML
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a href={`/api/projects/${projectId}/export`} download>
                <FileDown className="size-4" />
                Download PDF
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a
                href={`/api/projects/${projectId}/export?format=docx`}
                download
              >
                <FileText className="size-4" />
                Download DOCX
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a
                href={`/api/projects/${projectId}/export?format=md`}
                download
              >
                <FileCode className="size-4" />
                Download Markdown
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
