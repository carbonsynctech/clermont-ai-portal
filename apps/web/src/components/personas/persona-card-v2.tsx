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
      className={cn(
        "rounded-xl border bg-card p-4 space-y-3 transition-colors",
        isSelected && "border-primary bg-primary/5"
      )}
    >
      <div className="space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-snug">{persona.name}</p>
          {isSelected && (
            <Badge className="shrink-0 h-5 px-1.5 text-[10px] gap-0.5">
              <Check className="h-2.5 w-2.5" />
              Selected
            </Badge>
          )}
        </div>
        {persona.tags.length > 0 && (
          <p className="text-xs text-muted-foreground">{persona.tags.join(" · ")}</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground/70 line-clamp-2 leading-relaxed">
        {persona.description}
      </p>

      <div className="flex items-center gap-2 pt-1">
        <Button
          size="sm"
          variant={isSelected ? "default" : "outline"}
          className="h-7 text-xs flex-1"
          disabled={disableSelect && !isSelected}
          onClick={onSelect}
        >
          {isSelected ? "Deselect" : "Select"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs flex-1"
          onClick={onView}
        >
          View
        </Button>
      </div>
    </div>
  );
}
