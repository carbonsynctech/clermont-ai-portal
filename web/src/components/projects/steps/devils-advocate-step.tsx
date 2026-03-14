"use client";

import { useState, useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { parseCritiques } from "@repo/lib";
import { Button } from "@/components/ui/button";
import { StepTriggerOutput, useStepTrigger } from "@/components/projects/step-trigger";
import { CritiqueSelector, type CritiqueItem } from "@/components/review/critique-selector";

export interface DevilsAdvocateHandle {
  confirm: () => Promise<void>;
}

interface DevilsAdvocateStepProps {
  projectId: string;
  stage10Status: string;
  stage11Status: string;
  /** Raw AI output stored as the red_report version content */
  redReportContent: string;
  /** Memo content for AI custom critique generation */
  step10Markdown: string;
  /** Critiques extracted server-side from stage metadata */
  serverCritiques: CritiqueItem[];
  /** Selected IDs extracted server-side from stage metadata */
  serverSelectedIds: number[];
  /** Called after confirm to navigate to the next step immediately */
  onNavigate?: (step: number) => void;
  /** Reports selection count changes to the parent for the floating bar */
  onSelectionChange?: (info: { selectedCount: number; totalCount: number }) => void;
}

export const DevilsAdvocateStep = forwardRef<DevilsAdvocateHandle, DevilsAdvocateStepProps>(function DevilsAdvocateStep({
  projectId,
  stage10Status,
  stage11Status,
  redReportContent,
  step10Markdown,
  serverCritiques,
  serverSelectedIds,
  onNavigate,
  onSelectionChange,
}, ref) {
  const router = useRouter();
  const trigger = useStepTrigger(projectId, 11, stage11Status);
  const canRun = stage10Status === "completed";

  // Derive critiques from THREE sources (first non-empty wins):
  // 1. Server-extracted from stage metadata (like persona DB rows)
  // 2. Parsed from red_report version content
  // 3. Parsed from client-side streaming output (trigger.partialOutput)
  const parsedFromVersion = redReportContent ? parseCritiques(redReportContent) : [];
  const parsedFromStream = trigger.partialOutput ? parseCritiques(trigger.partialOutput) : [];

  const rawCritiques = serverCritiques.length > 0
    ? serverCritiques
    : parsedFromVersion.length > 0
      ? parsedFromVersion.map((c) => ({ id: c.id, title: c.title, detail: c.detail }))
      : parsedFromStream.map((c) => ({ id: c.id, title: c.title, detail: c.detail }));

  // Store parsed critiques in state so they persist across re-renders after trigger resets
  const [localCritiques, setLocalCritiques] = useState<CritiqueItem[]>([]);
  useEffect(() => {
    if (rawCritiques.length > 0 && localCritiques.length === 0) {
      setLocalCritiques(rawCritiques);
    }
  }, [rawCritiques, localCritiques.length]);

  // Use localCritiques if rawCritiques is empty (covers the case where
  // trigger.partialOutput gets cleared after router.refresh())
  const critiques = rawCritiques.length > 0 ? rawCritiques : localCritiques;

  const showSelector =
    stage11Status === "awaiting_human" ||
    stage11Status === "completed" ||
    critiques.length > 0;

  // Selection + draft state
  const [selectedCritiques, setSelectedCritiques] = useState<string[]>([]);
  const [draft, setDraft] = useState<{
    critiques: CritiqueItem[];
    selectedIds: number[];
    selectedCritiques: string[];
  } | null>(null);
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
    };
  }, []);

  const persistDraft = useCallback(
    (d: { critiques: CritiqueItem[]; selectedIds: number[]; selectedCritiques: string[] }) => {
      if (draftSaveTimeoutRef.current) {
        clearTimeout(draftSaveTimeoutRef.current);
      }
      draftSaveTimeoutRef.current = setTimeout(() => {
        void fetch(`/api/projects/${projectId}/critiques/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(d),
        }).catch(() => { /* silent — final save still happens on confirm */ });
      }, 1500);
    },
    [projectId],
  );

  // Report selection changes to parent for floating bar rendering
  const onSelectionChangeRef = useRef(onSelectionChange);
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange; }, [onSelectionChange]);
  useEffect(() => {
    onSelectionChangeRef.current?.({
      selectedCount: draft?.selectedIds.length ?? 0,
      totalCount: critiques.length,
    });
  }, [draft?.selectedIds.length, critiques.length]);

  // Expose confirm() to parent via ref (like InlineEditorHandle for Step 10)
  useImperativeHandle(ref, () => ({
    confirm: () => handleConfirm(),
  }));

  async function handleConfirm() {
    try {
      const res = await fetch(`/api/projects/${projectId}/critiques/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedCritiques,
          critiques: draft?.critiques ?? [],
          selectedIds: draft?.selectedIds ?? [],
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save Step 11 selection");
      }

      const data = (await res.json()) as { nextStep?: number };
      const next = data.nextStep === 13 ? 13 : 12;
      onNavigate?.(next);
      router.push(`/projects/${projectId}?step=${next}`);
      router.refresh();
    } catch (error) {
      console.error("Step 11 continue error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to continue to Step 12");
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      {/* Trigger button + streaming output (like AISuggestionsPanel) */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-base">Devil&apos;s Advocate Critiques</h3>
        <Button
          size="sm"
          disabled={!canRun || trigger.isRunning}
          onClick={() => void trigger.handleRun()}
        >
          {trigger.isRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : critiques.length > 0 ? (
            "Regenerate"
          ) : (
            "Generate Devil's Advocate Critiques"
          )}
        </Button>
      </div>

      {!canRun && (
        <p className="text-sm text-muted-foreground">Complete Step 10 to run this step.</p>
      )}

      {/* Show streaming output while running, hide when selector is visible and not running */}
      {!(showSelector && !trigger.isRunning) && (
        <StepTriggerOutput trigger={trigger} />
      )}

      {/* Critique cards — shown when critiques exist, just like persona cards */}
      {showSelector && !trigger.isRunning && (
        <>
          <p className="text-sm text-muted-foreground">
            Select the critiques you want integrated into the final document.
            Click a card to select or deselect it. You can also add custom critiques.
          </p>
          <CritiqueSelector
            key={`critiques-${critiques.length}-${stage11Status}`}
            projectId={projectId}
            redReport={redReportContent}
            step10Markdown={step10Markdown}
            initialCritiques={critiques}
            initialSelectedIds={serverSelectedIds}
            onSelectedCritiquesChange={setSelectedCritiques}
            onDraftChange={(d) => {
              setDraft(d);
              persistDraft(d);
            }}
          />
        </>
      )}
    </div>
  );
});
