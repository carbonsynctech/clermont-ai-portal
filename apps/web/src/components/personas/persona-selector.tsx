"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { PersonaCard } from "./persona-card";
import type { Persona } from "@repo/db";

interface PersonaSelectorProps {
  projectId: string;
  personas: Persona[];
}

const REQUIRED_COUNT = 5;

export function PersonaSelector({ projectId, personas }: PersonaSelectorProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function togglePersona(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= REQUIRED_COUNT) return prev;
      return [...prev, id];
    });
  }

  async function handleConfirm() {
    if (selectedIds.length !== REQUIRED_COUNT) return;
    setIsConfirming(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/personas/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaIds: selectedIds }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to confirm personas");
        return;
      }

      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Select 5 expert personas</p>
        <Badge variant={selectedIds.length === REQUIRED_COUNT ? "default" : "outline"}>
          {selectedIds.length} / {REQUIRED_COUNT} selected
        </Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {personas.map((persona) => (
          <PersonaCard
            key={persona.id}
            persona={persona}
            isSelected={selectedIds.includes(persona.id)}
            onToggle={() => togglePersona(persona.id)}
            disableToggle={
              selectedIds.length >= REQUIRED_COUNT && !selectedIds.includes(persona.id)
            }
          />
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <Button
        className="w-full"
        disabled={selectedIds.length !== REQUIRED_COUNT || isConfirming}
        onClick={() => void handleConfirm()}
      >
        {isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Confirming…
          </>
        ) : (
          "Confirm Selection"
        )}
      </Button>
    </div>
  );
}
