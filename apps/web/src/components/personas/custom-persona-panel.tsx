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

  // Debug: log every status change
  useEffect(() => {
    console.log(`[custom-persona] Status changed: status=${status}, jobId=${jobId}, isPolling=${isPolling}, hasJob=${!!job}, hasResult=${!!job?.result}`);
    if (job?.result) {
      console.log("[custom-persona] job.result =", JSON.stringify(job.result));
    }
  }, [status, jobId, isPolling, job]);

  // When job completes, fetch the new persona, auto-select it, and hide output
  const completedPersonaId = status === "completed" && job?.result
    ? (job.result as { personaId?: string }).personaId ?? null
    : null;

  console.log(`[custom-persona] Render: completedPersonaId=${completedPersonaId}, handledResultRef=${handledResultRef.current}, generatedPersonas=${generatedPersonas.length}, outputDismissed=${outputDismissed}`);

  useEffect(() => {
    console.log(`[custom-persona] Completion effect: completedPersonaId=${completedPersonaId}, alreadyHandled=${handledResultRef.current === completedPersonaId}`);
    if (!completedPersonaId) {
      console.log("[custom-persona] No completedPersonaId, skipping");
      return;
    }
    if (handledResultRef.current === completedPersonaId) {
      console.log("[custom-persona] Already handled this personaId, skipping");
      return;
    }
    handledResultRef.current = completedPersonaId;
    console.log(`[custom-persona] Fetching persona: /api/personas/${completedPersonaId}`);

    void (async () => {
      try {
        const r = await fetch(`/api/personas/${completedPersonaId}`);
        console.log(`[custom-persona] Fetch persona response: status=${r.status}, ok=${r.ok}`);
        if (r.ok) {
          const p = (await r.json()) as Persona;
          console.log(`[custom-persona] Got persona: id=${p.id}, name=${p.name}`);
          setGeneratedPersonas((prev) => {
            console.log(`[custom-persona] Adding to generatedPersonas, prev count=${prev.length}`);
            return [p, ...prev];
          });
          console.log("[custom-persona] Calling onPersonaGenerated and onSelect");
          onPersonaGeneratedRef.current(p);
          onSelectRef.current(p);
        } else {
          const text = await r.text();
          console.error(`[custom-persona] Fetch persona failed: ${r.status} ${text}`);
        }
      } catch (err) {
        console.error("[custom-persona] Failed to fetch persona:", err);
      }
      // Always dismiss output and reset form
      console.log("[custom-persona] Dismissing output and resetting form");
      setJobId(null);
      setOutputDismissed(true);
      setName("");
      setContext("");
    })();
  }, [completedPersonaId]);

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
    console.log(`[custom-persona] handleGenerate: name="${name.trim()}", projectId=${projectId}`);
    setIsDispatching(true);
    setDispatchError(null);
    setOutputDismissed(false);
    handledResultRef.current = null;

    try {
      const url = `/api/projects/${projectId}/personas/generate`;
      console.log(`[custom-persona] POST ${url}`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(context.trim() ? { context: context.trim() } : {}),
        }),
      });

      console.log(`[custom-persona] Dispatch response: status=${res.status}, ok=${res.ok}`);

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        console.error(`[custom-persona] Dispatch error: ${body.error}`);
        setDispatchError(body.error ?? "Failed to start generation");
        return;
      }

      const data = (await res.json()) as { jobId?: string };
      console.log(`[custom-persona] Dispatch success: jobId=${data.jobId}`);
      if (data.jobId) setJobId(data.jobId);
    } catch (err) {
      console.error("[custom-persona] Dispatch network error:", err);
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
