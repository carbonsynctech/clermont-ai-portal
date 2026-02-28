"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Library } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonaCardV2 } from "./persona-card-v2";
import { PersonaDrawer } from "./persona-drawer";
import type { Persona } from "@repo/db";

const TAGS = ["All", "Technology", "Finance", "Healthcare", "Strategy", "Legal", "Operations", "Other"] as const;

interface PersonaLibraryPanelProps {
  projectId: string;
  selectedIds: string[];
  onSelect: (persona: Persona) => void;
  selectedCount: number;
  maxCount: number;
}

export function PersonaLibraryPanel({
  projectId,
  selectedIds,
  onSelect,
  selectedCount,
  maxCount,
}: PersonaLibraryPanelProps) {
  const [q, setQ] = useState("");
  const [activeTag, setActiveTag] = useState<string>("All");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawerPersona, setDrawerPersona] = useState<Persona | null>(null);

  const fetchPersonas = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        excludeProjectId: projectId,
        limit: "30",
      });
      if (q) params.set("q", q);
      if (activeTag !== "All") params.set("tag", activeTag);

      const res = await fetch(`/api/personas?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as Persona[];
        setPersonas(data);
      }
    } finally {
      setLoading(false);
    }
  }, [projectId, q, activeTag]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => void fetchPersonas(), 400);
    return () => clearTimeout(timer);
  }, [fetchPersonas]);

  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Library className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-base">Persona Library</h3>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search personas by name or expertise…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-8 text-sm"
        />
      </div>

      <Tabs value={activeTag} onValueChange={setActiveTag}>
        <TabsList className="flex-wrap h-auto gap-1 bg-transparent p-0">
          {TAGS.map((tag) => (
            <TabsTrigger
              key={tag}
              value={tag}
              className="rounded-lg border text-sm h-8 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary"
            >
              {tag}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : personas.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {q || activeTag !== "All"
            ? "No personas match your search."
            : "The library is empty — generate personas above to populate it."}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {personas.map((persona) => (
            <PersonaCardV2
              key={persona.id}
              persona={persona}
              isSelected={selectedIds.includes(persona.id)}
              onSelect={() => onSelect(persona)}
              onView={() => setDrawerPersona(persona)}
              disableSelect={selectedCount >= maxCount && !selectedIds.includes(persona.id)}
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
