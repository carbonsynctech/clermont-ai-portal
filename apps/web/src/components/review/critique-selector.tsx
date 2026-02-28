"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseCritiques } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface CritiqueSelectorProps {
  projectId: string;
  redReport: string;
}

export function CritiqueSelector({ projectId, redReport }: CritiqueSelectorProps) {
  const router = useRouter();
  const critiques = parseCritiques(redReport);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function toggleCritique(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  async function handleConfirm() {
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);

    const selectedCritiques = critiques
      .filter((c) => selectedIds.includes(c.id))
      .map((c) => `${c.title}\n${c.detail}`);

    try {
      const res = await fetch(`/api/projects/${projectId}/critiques/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCritiques }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to confirm critiques");
      }
      router.refresh();
    } catch (err) {
      console.error("Critique confirm error:", err);
      alert(err instanceof Error ? err.message : "Failed to confirm. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Full red report */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Full report</p>
        <div className="rounded-md border bg-muted/40 p-3 max-h-64 overflow-y-auto">
          <pre className="text-xs whitespace-pre-wrap font-mono">{redReport}</pre>
        </div>
      </div>

      {/* Critique selection */}
      <div>
        <p className="text-xs font-medium mb-2">Select critiques to address</p>
        {critiques.length === 0 ? (
          <p className="text-xs text-muted-foreground">No structured critiques found in the report.</p>
        ) : (
          <div className="space-y-2">
            {critiques.map((critique) => (
              <div
                key={critique.id}
                className={`rounded-md border p-3 cursor-pointer transition-colors ${
                  selectedIds.includes(critique.id)
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/40"
                }`}
                onClick={() => toggleCritique(critique.id)}
              >
                <div className="flex items-start gap-2">
                  <Checkbox
                    checked={selectedIds.includes(critique.id)}
                    onCheckedChange={() => toggleCritique(critique.id)}
                    className="mt-0.5 shrink-0"
                  />
                  <div className="space-y-1">
                    <p className="text-xs font-medium">
                      {critique.id}. {critique.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{critique.detail}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">
          {selectedIds.length} of {critiques.length} selected
        </span>
        <Button
          size="sm"
          onClick={handleConfirm}
          disabled={selectedIds.length === 0 || isSubmitting}
        >
          {isSubmitting
            ? "Confirming…"
            : `Confirm Selection (${selectedIds.length} selected)`}
        </Button>
      </div>
    </div>
  );
}
