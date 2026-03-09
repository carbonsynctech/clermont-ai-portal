"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StepTriggerOutput } from "@/components/projects/step-trigger";
import { useJobStatus } from "@/hooks/use-job-status";
import type { StepTriggerState } from "@/components/projects/step-trigger";
import type { Persona } from "@repo/db";
import { PersonaCardV2 } from "./persona-card-v2";
import { PersonaDrawer } from "./persona-drawer";

interface CustomPersonaPanelProps {
  projectId: string;
  selectedIds: string[];
  onSelect: (persona: Persona) => void;
  selectedCount: number;
  maxCount: number;
  onPersonaGenerated: (persona: Persona) => void;
}

export function CustomPersonaPanel({
  projectId,
  selectedIds,
  onSelect,
  selectedCount,
  maxCount,
  onPersonaGenerated,
}: CustomPersonaPanelProps) {
  const [name, setName] = useState("");
  const [context, setContext] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [generatedPersonas, setGeneratedPersonas] = useState<Persona[]>([]);
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);
  const [outputDismissed, setOutputDismissed] = useState(false);
  const outputRef = useRef<HTMLPreElement | null>(null);
  const handledResultRef = useRef<string | null>(null);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onPersonaGeneratedRef = useRef(onPersonaGenerated);
  onPersonaGeneratedRef.current = onPersonaGenerated;

  const { status, job, isPolling, elapsedSeconds, partialOutput } = useJobStatus(jobId);

  // When job completes, fetch the new persona, auto-select it, and hide output
  useEffect(() => {
    if (status !== "completed" || !job?.result) return;
    const result = job.result as { personaId?: string };
    if (!result.personaId) return;
    // Prevent re-processing the same result
    if (handledResultRef.current === result.personaId) return;
    handledResultRef.current = result.personaId;

    const personaId = result.personaId;
    fetch(`/api/personas/${personaId}`)
      .then(async (r) => {
        if (!r.ok) return;
        const p = (await r.json()) as Persona;
        setGeneratedPersonas((prev) => [p, ...prev]);
        onPersonaGeneratedRef.current(p);
        onSelectRef.current(p);
        setJobId(null);
        setOutputDismissed(true);
        setName("");
        setContext("");
      })
      .catch(() => { /* ignore fetch errors — user can try again */ });
  }, [status, job?.result]);

  const isRunning = isDispatching || isPolling;

  const phase = ((): StepTriggerState["phase"] => {
    if (outputDismissed) return null;
    if (isDispatching) return "dispatching";
    if (isPolling && !partialOutput) return "waiting";
    if (isPolling && partialOutput) return "streaming";
    if (!isPolling && partialOutput && status === "completed") return "done";
    return null;
  })();

  const trigger: StepTriggerState = {
    isRunning,
    isDispatching,
    phase,
    showError: dispatchError ?? (status === "failed" ? "Generation failed. Please try again." : null),
    elapsedSeconds,
    partialOutput: outputDismissed ? "" : partialOutput,
    outputRef,
    handleRun: async () => {},
    handleReset: () => { setJobId(null); setDispatchError(null); setOutputDismissed(true); },
  };

  async function handleGenerate() {
    if (!name.trim()) return;
    setIsDispatching(true);
    setDispatchError(null);
    setOutputDismissed(false);
    handledResultRef.current = null;

    try {
      const res = await fetch(`/api/projects/${projectId}/personas/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(context.trim() ? { context: context.trim() } : {}),
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setDispatchError(body.error ?? "Failed to start generation");
        return;
      }

      const data = (await res.json()) as { jobId?: string };
      if (data.jobId) setJobId(data.jobId);
    } catch {
      setDispatchError("Network error");
    } finally {
      setIsDispatching(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <UserPlus className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-base">Customize a Persona</h3>
      </div>

      <div className="space-y-3">
        <Input
          placeholder="Person name (e.g. Ray Dalio)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Textarea
          placeholder="Additional context (optional) — e.g. 'Focus on ESG lens'"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={2}
          className="text-sm"
        />

        <Button
          size="sm"
          disabled={!name.trim() || isRunning}
          onClick={() => void handleGenerate()}
        >
          Generate Persona
        </Button>
      </div>

      {/* Streaming output — hides automatically when persona is fetched */}
      <StepTriggerOutput trigger={trigger} />

      {/* Generated persona cards */}
      {generatedPersonas.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {generatedPersonas.map((p) => (
            <PersonaCardV2
              key={p.id}
              persona={p}
              isSelected={selectedIds.includes(p.id)}
              onSelect={() => onSelect(p)}
              onView={() => setDrawerPersona(p)}
              disableSelect={selectedCount >= maxCount && !selectedIds.includes(p.id)}
            />
          ))}
        </div>
      )}

      <PersonaDrawer
        persona={drawerPersona}
        onClose={() => setDrawerPersona(null)}
      />
    </div>
  );
}
