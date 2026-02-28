"use client";

import { useEffect, useRef, useState } from "react";
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
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [context, setContext] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [generatedPersonas, setGeneratedPersonas] = useState<Persona[]>([]);
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);

  const { status, job, isPolling, elapsedSeconds, partialOutput } = useJobStatus(jobId);

  // When job completes, fetch the new persona, show card, and notify parent
  useEffect(() => {
    if (status !== "completed" || !job?.result) return;
    const result = job.result as { personaId?: string };
    if (!result.personaId) return;
    const personaId = result.personaId;
    fetch(`/api/personas/${personaId}`)
      .then(async (r) => {
        if (!r.ok) return;
        const p = (await r.json()) as Persona;
        setGeneratedPersonas((prev) => [p, ...prev]);
        onPersonaGenerated(p);
        setJobId(null);
        setName("");
        setLinkedinUrl("");
        setContext("");
      })
      .catch(() => { /* ignore fetch errors — user can try again */ });
  }, [status, job?.result, onPersonaGenerated]);

  const isRunning = isDispatching || isPolling;

  const phase = ((): StepTriggerState["phase"] => {
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
    partialOutput,
    outputRef,
    handleRun: async () => {},
    handleReset: () => { setJobId(null); setDispatchError(null); },
  };

  async function handleGenerate() {
    if (!name.trim()) return;
    setIsDispatching(true);
    setDispatchError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/personas/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...(linkedinUrl.trim() ? { linkedinUrl: linkedinUrl.trim() } : {}),
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
        <div className="grid grid-cols-2 gap-3">
          <Input
            placeholder="Person name (e.g. Ray Dalio)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="relative">
            <Input
              placeholder="LinkedIn profile URL (optional)"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              className="pr-8"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 size-4 fill-muted-foreground/40 pointer-events-none"
            >
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </div>
        </div>

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

      {/* Streaming output — collapses automatically when job clears */}
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
