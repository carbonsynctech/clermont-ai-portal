"use client";

import { useEffect } from "react";
import { Brain } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { StepTriggerButton, StepTriggerOutput, useStepTrigger } from "@/components/projects/step-trigger";
import { MarkdownVersionPanel } from "../markdown-version-panel";
import type { Version } from "@repo/db";

interface IntegrateCritiquesStepProps {
  projectId: string;
  finalVersion?: Version;
  stage11Status: string;
  stage12Status: string;
  onRunningChange?: (running: boolean) => void;
}

export function IntegrateCritiquesStep({
  projectId,
  finalVersion,
  stage11Status,
  stage12Status,
  onRunningChange,
}: IntegrateCritiquesStepProps) {
  const canRun = stage11Status === "completed";
  const trigger = useStepTrigger(projectId, 12, stage12Status, canRun);

  useEffect(() => {
    onRunningChange?.(trigger.isRunning);
  }, [onRunningChange, trigger.isRunning]);

  if (!finalVersion) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <StepTriggerButton
          trigger={trigger}
          label="Integrate Critiques with Extended Thinking"
          disabled={!canRun}
          disabledReason="Complete Step 11 to run this step."
        />
        <StepTriggerOutput trigger={trigger} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <MarkdownVersionPanel
        title="Integrated Critiques — Final V6"
        content={finalVersion.content}
        wordCount={finalVersion.wordCount ?? undefined}
      />

      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 h-fit space-y-3">
        <div className="flex items-center gap-2">
          <Brain className="size-4 text-primary" />
          <h3 className="font-medium text-base">Critiques Integrated — Final V6</h3>
        </div>
        <Badge variant="outline">{finalVersion.wordCount?.toLocaleString() ?? "?"} words</Badge>
        <StepTriggerButton
          trigger={trigger}
          label="Re-run Critique Integration"
          disabled={!canRun}
          disabledReason="Complete Step 11 to run this step."
        />
        <StepTriggerOutput trigger={trigger} />
      </div>
    </div>
  );
}
