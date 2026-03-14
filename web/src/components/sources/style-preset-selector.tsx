"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STYLE_PRESETS, type StylePreset } from "@/components/projects/steps/document-template";

interface StylePresetSelectorProps {
  projectId: string;
  selectedPresetId: string | null;
  onSelect?: (preset: StylePreset) => void;
}

export function StylePresetSelector({
  projectId,
  selectedPresetId,
  onSelect,
}: StylePresetSelectorProps) {
  const router = useRouter();
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(selectedPresetId);
  const [error, setError] = useState<string | null>(null);

  // Derive the displayed selection: local optimistic state takes priority
  const activePresetId = localSelectedId ?? selectedPresetId;

  async function handleSelect(preset: StylePreset) {
    // Optimistic: instantly select + notify parent
    setLocalSelectedId(preset.id);
    setError(null);
    onSelect?.(preset);

    try {
      const res = await fetch(`/api/projects/${projectId}/style-guide/preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId: preset.id }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Failed to save style");
        setLocalSelectedId(selectedPresetId); // revert
        return;
      }

      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLocalSelectedId(selectedPresetId); // revert
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {STYLE_PRESETS.map((preset) => {
          const isSelected = activePresetId === preset.id;

          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => void handleSelect(preset)}
              className={cn(
                "relative flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-2"
                  : "border-border hover:border-primary/40 hover:bg-muted/40",
              )}
            >
              {/* Color swatch row */}
              <div className="flex items-center gap-1.5">
                {[
                  preset.colors.primary,
                  preset.colors.secondary,
                  preset.colors.accent,
                  preset.colors.neutral,
                  preset.colors.muted,
                  preset.colors.surface,
                ].map((hex) => (
                  <div
                    key={hex}
                    className="w-5 h-5 rounded-md border border-black/10 shadow-sm"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </div>

              {/* Name + description */}
              <div>
                <p className="text-sm font-medium text-foreground">{preset.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{preset.description}</p>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-full p-0.5">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
