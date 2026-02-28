"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Persona } from "@repo/db";

interface PersonaCardV2Props {
  persona: Persona;
  isSelected: boolean;
  onSelect: () => void;
  onView: () => void;
  disableSelect?: boolean;
}

export function PersonaCardV2({
  persona,
  isSelected,
  onSelect,
  onView,
  disableSelect = false,
}: PersonaCardV2Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!disableSelect || isSelected) onSelect(); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!disableSelect || isSelected) onSelect(); } }}
      className={cn(
        "rounded-xl border bg-card p-4 space-y-3 transition-colors cursor-pointer select-none",
        isSelected ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30 hover:bg-muted/30",
        disableSelect && !isSelected && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-base font-semibold leading-snug">{persona.name}</p>
          {isSelected && (
            <Badge className="shrink-0 h-5 w-5 p-0 flex items-center justify-center">
              <Check className="h-3 w-3" />
            </Badge>
          )}
        </div>
        {persona.tags.length > 0 && (
          <p className="text-sm text-muted-foreground">{persona.tags.join(" · ")}</p>
        )}
      </div>

      <p className="text-sm text-muted-foreground/70 line-clamp-2 leading-relaxed">
        {persona.description}
      </p>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          className="h-8 text-sm flex-1"
          disabled={disableSelect && !isSelected}
          onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
          {isSelected ? "Deselect" : "Select"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 text-sm flex-1"
          onClick={(e) => { e.stopPropagation(); onView(); }}
        >
          View
        </Button>
      </div>
    </div>
  );
}
