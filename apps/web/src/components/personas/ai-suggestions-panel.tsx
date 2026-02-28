"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StepTriggerOutput, useStepTrigger } from "@/components/projects/step-trigger";
import { PersonaCardV2 } from "./persona-card-v2";
import { PersonaDrawer } from "./persona-drawer";
import type { Persona } from "@repo/db";

interface AISuggestionsPanelProps {
  projectId: string;
  stage1Done: boolean;
  stage2Status: string;
  projectPersonas: Persona[];
  selectedIds: string[];
  onSelect: (persona: Persona) => void;
  selectedCount: number;
  maxCount: number;
}

export function AISuggestionsPanel({
  projectId,
  stage1Done,
  stage2Status,
  projectPersonas,
  selectedIds,
  onSelect,
  selectedCount,
  maxCount,
}: AISuggestionsPanelProps) {
  const router = useRouter();
  const trigger = useStepTrigger(projectId, 2, stage2Status);
  const hasAutoDispatched = useRef(false);
  const [showCustomPrompt, setShowCustomPrompt] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);

  // Auto-dispatch on first mount if conditions met
  useEffect(() => {
    if (
      !hasAutoDispatched.current &&
      stage1Done &&
      stage2Status === "pending" &&
      projectPersonas.length === 0
    ) {
      hasAutoDispatched.current = true;
      void trigger.handleRun();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh page when generation completes to show new personas
  useEffect(() => {
    if (!trigger.isRunning && hasAutoDispatched.current && projectPersonas.length === 0) {
      router.refresh();
    }
  }, [trigger.isRunning, projectPersonas.length, router]);

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h3 className="font-medium text-base">AI-Tailored Suggestions</h3>
          {stage1Done && stage2Status === "pending" && projectPersonas.length === 0 && (
            <span className="text-sm text-muted-foreground">(generating…)</span>
          )}
        </div>

        {projectPersonas.length > 0 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-sm gap-1.5"
              disabled={trigger.isRunning}
              onClick={() => {
                hasAutoDispatched.current = true;
                void trigger.handleRun();
              }}
            >
              <RefreshCw className="size-3" />
              Generate More
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-sm"
              onClick={() => setShowCustomPrompt((v) => !v)}
            >
              + Add Prompt
            </Button>
          </div>
        )}
      </div>

      {showCustomPrompt && (
        <div className="space-y-2">
          <Textarea
            placeholder="Guide the AI — e.g. 'Focus on ESG and sustainability experts'"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            rows={2}
            className="text-sm"
          />
          <p className="text-sm text-muted-foreground">
            Note: custom prompts are not yet wired into the generation — this will be supported in a future update.
          </p>
        </div>
      )}

      {!stage1Done && (
        <p className="text-sm text-muted-foreground">Complete Step 1 to generate tailored personas.</p>
      )}

      <StepTriggerOutput trigger={trigger} />

      {projectPersonas.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {projectPersonas.map((persona) => (
            <PersonaCardV2
              key={persona.id}
              persona={persona}
              isSelected={selectedIds.includes(persona.id)}
              onSelect={() => onSelect(persona)}
              onView={() => setDrawerPersona(persona)}
              disableSelect={selectedCount >= maxCount && !selectedIds.includes(persona.id)}
            />
          ))}
        </div>
      )}

      <PersonaDrawer
        persona={drawerPersona}
        isSelected={drawerPersona ? selectedIds.includes(drawerPersona.id) : false}
        onSelect={() => { if (drawerPersona) onSelect(drawerPersona); }}
        onClose={() => setDrawerPersona(null)}
      />
    </div>
  );
}
