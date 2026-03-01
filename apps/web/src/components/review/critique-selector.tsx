"use client";

import { useEffect, useState } from "react";
import { MoreHorizontal, Pencil, Sparkles, Trash2 } from "lucide-react";
import { parseCritiques } from "@repo/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CritiqueSelectorProps {
  projectId: string;
  redReport: string;
  step10Markdown: string;
  initialCritiques?: CritiqueItem[];
  initialSelectedIds?: number[];
  onSelectedCritiquesChange?: (selectedCritiques: string[]) => void;
  onDraftChange?: (draft: {
    critiques: CritiqueItem[];
    selectedIds: number[];
    selectedCritiques: string[];
  }) => void;
}

export interface CritiqueItem {
  id: number;
  title: string;
  detail: string;
  isCustom?: boolean;
}

const RANDOM_CRITIQUE_ANGLES = [
  "Revenue quality and forecast reliability",
  "Competitive moat durability",
  "Customer concentration and churn dynamics",
  "Execution and hiring risk",
  "Unit economics under downside assumptions",
  "Valuation, return path, and exit realism",
] as const;

const ASK_AI_PROMPT_MAX_LENGTH = 20000;
const ASK_AI_PROMPT_TARGET_LENGTH = 19000;

export function CritiqueSelector({
  projectId,
  redReport,
  step10Markdown,
  initialCritiques,
  initialSelectedIds,
  onSelectedCritiquesChange,
  onDraftChange,
}: CritiqueSelectorProps) {
  const parsedCritiques = parseCritiques(redReport);
  const [critiques, setCritiques] = useState<CritiqueItem[]>(() => {
    if (!initialCritiques || initialCritiques.length === 0) {
      return parsedCritiques;
    }

    return initialCritiques;
  });
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    if (!initialSelectedIds || initialSelectedIds.length === 0) {
      return [];
    }

    const validIds = new Set((initialCritiques ?? parsedCritiques).map((item) => item.id));
    return initialSelectedIds.filter((id) => validIds.has(id));
  });
  const [expandedIds, setExpandedIds] = useState<number[]>([]);
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const allSelected = critiques.length > 0 && selectedIds.length === critiques.length;

  function stripNumericPrefix(value: string) {
    return value.replace(/^\s*\d+[\).:\-\s]+/, "").trim();
  }

  function toggleCritique(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  }

  function toggleExpanded(id: number) {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : critiques.map((item) => item.id));
  }

  function getNextCritiqueId() {
    return critiques.length === 0 ? 1 : Math.max(...critiques.map((item) => item.id)) + 1;
  }

  function addCritique(item: Omit<CritiqueItem, "id">) {
    const nextId = getNextCritiqueId();
    setCritiques((prev) => [...prev, { ...item, id: nextId }]);
    setSelectedIds((prev) => [...prev, nextId]);
  }

  function parseGeneratedCritique(text: string): { title: string; detail: string } {
    const trimmed = text.trim();
    const titleMatch = trimmed.match(/(?:^|\n)TITLE:\s*(.+)/i);
    const descriptionMatch = trimmed.match(/(?:^|\n)DESCRIPTION:\s*([\s\S]+)/i);

    if (titleMatch?.[1] && descriptionMatch?.[1]) {
      return {
        title: stripNumericPrefix(titleMatch[1]) || "Generated critique",
        detail: descriptionMatch[1].trim(),
      };
    }

    const [firstLine, ...rest] = trimmed.split("\n");
    return {
      title: stripNumericPrefix(firstLine || "Generated critique") || "Generated critique",
      detail: rest.join("\n").trim() || "No additional details generated.",
    };
  }

  function buildPromptWithMemo(baseSections: string[], memoText: string) {
    const base = baseSections.join("\n\n");
    const staticLength = `${base}\n\nMemo content:\n\n`.length;
    const availableMemoChars = Math.max(0, ASK_AI_PROMPT_TARGET_LENGTH - staticLength);
    const memoExcerpt = memoText.slice(0, availableMemoChars);
    return `${base}\n\nMemo content:\n\n${memoExcerpt}`.slice(0, ASK_AI_PROMPT_MAX_LENGTH);
  }

  async function pollJobUntilComplete(jobId: string): Promise<string> {
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch generation status");
      }

      const job = (await res.json()) as {
        status?: "pending" | "running" | "completed" | "failed";
        partialOutput?: string;
        error?: string | null;
      };

      if (job.status === "failed") {
        throw new Error(job.error || "Critique generation failed");
      }

      if (job.status === "completed") {
        const output = job.partialOutput?.trim();
        if (!output) throw new Error("Generation returned empty output");
        return output;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    throw new Error("Critique generation timed out");
  }

  async function generateCritique(prompt: string) {
    setGenerationError(null);
    setIsGenerating(true);

    try {
      const dispatchRes = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, projectId }),
      });

      if (!dispatchRes.ok) {
        const data = (await dispatchRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Failed to start critique generation");
      }

      const dispatchData = (await dispatchRes.json()) as { jobId?: string };
      if (!dispatchData.jobId) throw new Error("Missing generation job ID");

      const output = await pollJobUntilComplete(dispatchData.jobId);
      const parsed = parseGeneratedCritique(output);
      addCritique({ title: parsed.title, detail: parsed.detail, isCustom: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to generate critique";
      setGenerationError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function generateRandomCritique() {
    const angle =
      RANDOM_CRITIQUE_ANGLES[Math.floor(Math.random() * RANDOM_CRITIQUE_ANGLES.length)] ??
      RANDOM_CRITIQUE_ANGLES[0];
    const prompt = buildPromptWithMemo([
      "Create ONE devil's-advocate critique for the investment memo below.",
      `Focus area: ${angle}`,
      "The critique must be grounded in this memo content and must be long and specific (at least 180 words).",
      "Return ONLY in this exact format:",
      "TITLE: <short title without numbering>",
      "DESCRIPTION: <detailed critique paragraph(s), concrete and actionable>",
    ], step10Markdown);

    await generateCritique(prompt);
  }

  function addWrittenCustomCritique() {
    const title = stripNumericPrefix(customTitle.trim());
    const detail = customDescription.trim();
    if (!title || !detail) return;

    addCritique({ title, detail, isCustom: true });
    setCustomTitle("");
    setCustomDescription("");
    setGenerationError(null);
  }

  async function generateCustomCritique() {
    const requestedTitle = stripNumericPrefix(customTitle.trim());
    const requestedDescription = customDescription.trim();

    const prompt = buildPromptWithMemo([
      "Create ONE devil's-advocate critique for the investment memo below.",
      requestedTitle ? `Preferred title/theme: ${requestedTitle}` : "",
      requestedDescription ? `User guidance for the critique: ${requestedDescription}` : "",
      "The output must be grounded in the memo and substantially detailed (at least 220 words).",
      "Return ONLY in this exact format:",
      "TITLE: <short title without numbering>",
      "DESCRIPTION: <detailed critique paragraph(s), concrete and actionable>",
    ]
      .filter((section): section is string => Boolean(section)), step10Markdown);

    await generateCritique(prompt);
  }

  function startEditCritique(id: number) {
    const current = critiques.find((critique) => critique.id === id);
    if (!current) return;

    setEditingId(id);
    setEditTitle(current.title);
    setEditDetail(current.detail);
  }

  function saveEditCritique() {
    if (editingId === null) return;

    const title = stripNumericPrefix(editTitle.trim());
    const detail = editDetail.trim();
    if (!title || !detail) return;

    setCritiques((prev) =>
      prev.map((critique) =>
        critique.id === editingId ? { ...critique, title, detail, isCustom: true } : critique,
      ),
    );
    setEditingId(null);
    setEditTitle("");
    setEditDetail("");
  }

  function cancelEditCritique() {
    setEditingId(null);
    setEditTitle("");
    setEditDetail("");
  }

  function deleteCritique(id: number) {
    setCritiques((prev) => prev.filter((critique) => critique.id !== id));
    setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    setExpandedIds((prev) => prev.filter((expandedId) => expandedId !== id));
    if (editingId === id) {
      cancelEditCritique();
    }
  }

  useEffect(() => {
    const selectedCritiques = critiques
      .filter((critique) => selectedIds.includes(critique.id))
      .map((critique) => `${stripNumericPrefix(critique.title)}\n${critique.detail}`);

    onSelectedCritiquesChange?.(selectedCritiques);
    onDraftChange?.({
      critiques,
      selectedIds,
      selectedCritiques,
    });
  }, [critiques, onDraftChange, onSelectedCritiquesChange, selectedIds]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-base">Devil&apos;s Advocate Report</h3>
          <Badge variant="outline">
            {selectedIds.length} selected / {critiques.length} total
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={toggleAll} disabled={critiques.length === 0}>
          {allSelected ? "Deselect All" : "Select All"}
        </Button>
      </div>

      {critiques.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No structured critiques were generated. You can add custom critiques, or continue with none selected to skip Step 12.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {critiques.map((critique) => {
            const selected = selectedIds.includes(critique.id);
            const expanded = expandedIds.includes(critique.id);

            return (
              <div
                key={critique.id}
                onClick={() => toggleCritique(critique.id)}
                className={`rounded-xl border p-4 cursor-pointer transition-colors space-y-3 ${
                  selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={selected}
                      onCheckedChange={() => toggleCritique(critique.id)}
                      onClick={(event) => event.stopPropagation()}
                    />
                    <p className="text-sm font-medium truncate">{stripNumericPrefix(critique.title)}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    {critique.isCustom && <Badge variant="destructive">Custom</Badge>}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(event) => {
                            event.stopPropagation();
                            startEditCritique(critique.id);
                          }}
                        >
                          <Pencil className="size-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteCritique(critique.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {editingId === critique.id ? (
                  <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
                    <Input
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      placeholder="Critique title"
                    />
                    <Textarea
                      value={editDetail}
                      onChange={(event) => setEditDetail(event.target.value)}
                      className="min-h-[96px]"
                      placeholder="Critique details"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={saveEditCritique}
                        disabled={!editTitle.trim() || !editDetail.trim()}
                      >
                        Save
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={cancelEditCritique}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExpanded(critique.id);
                    }}
                    className={`w-full text-left text-sm text-muted-foreground ${
                      expanded ? "" : "line-clamp-3"
                    }`}
                  >
                    {critique.detail}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="space-y-2 rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void generateRandomCritique()}
            disabled={isGenerating}
          >
            <Sparkles className="size-4" />
            {isGenerating ? "Generating…" : "Generate Random Critique"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCustomPanelOpen((open) => !open)}>
            + Generate Custom Critique
          </Button>
        </div>

        {customPanelOpen && (
          <div className="space-y-2">
            <Input
              value={customTitle}
              onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="Write custom critique title"
            />
            <Textarea
              value={customDescription}
              onChange={(event) => setCustomDescription(event.target.value)}
              className="min-h-[100px]"
              placeholder="Write custom critique description"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => void generateCustomCritique()}
                disabled={isGenerating || (!customTitle.trim() && !customDescription.trim())}
              >
                {isGenerating ? "Generating…" : "Generate"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={addWrittenCustomCritique}
                disabled={isGenerating || !customTitle.trim() || !customDescription.trim()}
              >
                Add Written Critique
              </Button>
            </div>
          </div>
        )}

        {generationError && <p className="text-sm text-destructive">{generationError}</p>}
      </div>
    </div>
  );
}
