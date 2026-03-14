"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { Persona } from "@repo/db";

interface PersonaCardProps {
  persona: Persona;
  isSelected: boolean;
  onToggle: () => void;
  disableToggle: boolean;
}

export function PersonaCard({ persona, isSelected, onToggle, disableToggle }: PersonaCardProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  return (
    <Card
      className={`cursor-pointer transition-colors ${
        isSelected ? "border-primary ring-1 ring-primary" : "border-border"
      }`}
      onClick={() => {
        if (!disableToggle || isSelected) onToggle();
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm leading-snug">{persona.name}</CardTitle>
          {isSelected && (
            <Badge className="shrink-0 h-5 px-1.5 text-[10px]">
              <Check className="h-3 w-3 mr-0.5" />
              Selected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground line-clamp-3">{persona.description}</p>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setShowPrompt((v) => !v);
          }}
        >
          {showPrompt ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Hide system prompt
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              View system prompt
            </>
          )}
        </Button>
        {showPrompt && (
          <div className="rounded-md bg-muted/50 p-2 text-xs text-foreground leading-relaxed max-h-32 overflow-y-auto whitespace-pre-wrap">
            {persona.system_prompt}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
