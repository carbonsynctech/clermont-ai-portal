"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CustomPersonaPanel } from "@/components/personas/custom-persona-panel";
import { PersonaLibraryPanel } from "@/components/personas/persona-library-panel";
import { AISuggestionsPanel } from "@/components/personas/ai-suggestions-panel";
import type { Persona } from "@repo/db";

const REQUIRED_COUNT = 5;

interface SelectPersonasStepProps {
  projectId: string;
  stage1Status: string;
  stage2Status: string;
  projectPersonas: Persona[];
}

export function SelectPersonasStep({
  projectId,
  stage1Status,
  stage2Status,
  projectPersonas,
}: SelectPersonasStepProps) {
  const router = useRouter();
  const stage1Done = stage1Status === "completed";

  const alreadySelected = projectPersonas
    .filter((p) => p.isSelected)
    .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))
    .map((p) => p.id);

  const [selectedIds, setSelectedIds] = useState<string[]>(alreadySelected);
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>(
    projectPersonas.filter((p) => alreadySelected.includes(p.id))
  );

  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  function handleSelect(persona: Persona) {
    setSelectedIds((prev) => {
      if (prev.includes(persona.id)) {
        setSelectedPersonas((ps) => ps.filter((p) => p.id !== persona.id));
        return prev.filter((id) => id !== persona.id);
      }
      if (prev.length >= REQUIRED_COUNT) return prev;
      setSelectedPersonas((ps) => [...ps, persona]);
      return [...prev, persona.id];
    });
  }

  async function handleConfirm() {
    if (selectedIds.length !== REQUIRED_COUNT) return;
    setIsConfirming(true);
    setConfirmError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/personas/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaIds: selectedIds }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setConfirmError(body.error ?? "Failed to confirm");
        return;
      }

      router.push(`/projects/${projectId}?step=3`);
    } catch {
      setConfirmError("Network error. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  }

  const isConfirmed = stage2Status === "completed";

  return (
    <div className="space-y-5">
      {isConfirmed ? (
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="size-4" />
            <h3 className="font-medium text-base">5 personas confirmed for this project</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {projectPersonas
              .filter((p) => p.isSelected)
              .sort((a, b) => (a.selectionOrder ?? 0) - (b.selectionOrder ?? 0))
              .map((p, i) => (
                <div key={p.id} className="flex items-center gap-2 text-base">
                  <Badge variant="outline" className="text-sm h-5 px-1.5 shrink-0">{i + 1}</Badge>
                  <span>{p.name}</span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <>
          <CustomPersonaPanel
            projectId={projectId}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            selectedCount={selectedIds.length}
            maxCount={REQUIRED_COUNT}
          />

          <PersonaLibraryPanel
            projectId={projectId}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            selectedCount={selectedIds.length}
            maxCount={REQUIRED_COUNT}
          />

          <AISuggestionsPanel
            projectId={projectId}
            stage1Done={stage1Done}
            stage2Status={stage2Status}
            projectPersonas={projectPersonas}
            selectedIds={selectedIds}
            onSelect={handleSelect}
            selectedCount={selectedIds.length}
            maxCount={REQUIRED_COUNT}
          />

          {/* Sticky confirmation bar */}
          <div className="sticky bottom-4 flex items-center justify-between gap-4 rounded-xl border bg-card/95 backdrop-blur px-5 py-3.5 shadow-lg">
            <div className="flex items-center gap-3">
              <Users className="size-4 text-muted-foreground" />
              <span className="text-base text-muted-foreground">
                {selectedIds.length} / {REQUIRED_COUNT} personas selected
              </span>
              {selectedIds.length > 0 && (
                <div className="flex flex-wrap gap-1 max-w-sm">
                  {selectedPersonas.slice(0, 3).map((p) => (
                    <Badge key={p.id} variant="secondary" className="text-sm h-5 max-w-[120px] truncate px-1.5">
                      {p.name.split(" (")[0]}
                    </Badge>
                  ))}
                  {selectedPersonas.length > 3 && (
                    <Badge variant="outline" className="text-sm h-5 px-1.5">
                      +{selectedPersonas.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {confirmError && (
                <p className="text-sm text-destructive">{confirmError}</p>
              )}
              <Button
                disabled={selectedIds.length !== REQUIRED_COUNT || isConfirming || !stage1Done}
                onClick={() => void handleConfirm()}
                className="shrink-0"
              >
                {isConfirming ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Confirming…</>
                ) : (
                  `Confirm & Continue to Step 3`
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
