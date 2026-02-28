"use client";

import { useRef, useState } from "react";
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
}

export function CustomPersonaPanel({
  projectId,
  selectedIds,
  onSelect,
  selectedCount,
  maxCount,
}: CustomPersonaPanelProps) {
  const [name, setName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [context, setContext] = useState("");
  const [showLinkedin, setShowLinkedin] = useState(false);
  const [isDispatching, setIsDispatching] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [generatedPersonas, setGeneratedPersonas] = useState<Persona[]>([]);
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);
  const outputRef = useRef<HTMLPreElement | null>(null);

  const { status, job, isPolling, elapsedSeconds, partialOutput } = useJobStatus(jobId);

  // When job completes, fetch the new persona
  const [prevStatus, setPrevStatus] = useState(status);
  if (status !== prevStatus) {
    setPrevStatus(status);
    if (status === "completed" && job?.result) {
      const result = job.result as { personaId?: string };
      if (result.personaId) {
        const personaId = result.personaId;
        void fetch(`/api/personas/${personaId}`)
          .then((r) => r.json())
          .then((p: Persona) => {
            setGeneratedPersonas((prev) => [p, ...prev]);
            setJobId(null);
            setName("");
            setLinkedinUrl("");
            setContext("");
          });
      }
    }
  }

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
        <h3 className="font-medium text-sm">Customize a Persona</h3>
      </div>

      <div className="space-y-3">
        <Input
          placeholder="Person name (e.g. Ray Dalio) or LinkedIn URL"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          onClick={() => setShowLinkedin((v) => !v)}
        >
          {showLinkedin ? "Hide LinkedIn URL" : "+ Add LinkedIn URL"}
        </button>

        {showLinkedin && (
          <Input
            placeholder="LinkedIn profile URL (optional)"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
        )}

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

      <StepTriggerOutput trigger={trigger} />

      {generatedPersonas.length > 0 && (
        <div className="grid grid-cols-2 gap-3 pt-2">
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
        isSelected={drawerPersona ? selectedIds.includes(drawerPersona.id) : false}
        onSelect={() => { if (drawerPersona) onSelect(drawerPersona); }}
        onClose={() => setDrawerPersona(null)}
      />
    </div>
  );
}
