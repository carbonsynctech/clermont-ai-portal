"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, MoreHorizontal, Pencil, Trash2, AlertCircle } from "lucide-react";
import { parseCritiques } from "@repo/lib";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
  onConfirm?: () => void;
  isConfirming?: boolean;
  isCompleted?: boolean;
}

export interface CritiqueItem {
  id: number;
  title: string;
  detail: string;
  isCustom?: boolean;
}

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
  onConfirm,
  isConfirming,
  isCompleted,
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
  const onSelectedCritiquesChangeRef = useRef(onSelectedCritiquesChange);
  const onDraftChangeRef = useRef(onDraftChange);

  useEffect(() => {
    onSelectedCritiquesChangeRef.current = onSelectedCritiquesChange;
  }, [onSelectedCritiquesChange]);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  const allSelected = critiques.length > 0 && selectedIds.length === critiques.length;

  function stripNumericPrefix(value: string) {
    return value.replace(/^\s*\d+[\).:\-\s]+/, "").trim();
  }

  function toggleCritique(id: number) {
    if (isCompleted) return;
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
    if (isCompleted) return;
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

    onSelectedCritiquesChangeRef.current?.(selectedCritiques);
    onDraftChangeRef.current?.({
      critiques,
      selectedIds,
      selectedCritiques,
    });
  }, [critiques, selectedIds]);

  return (
    <div className="space-y-4">
      {/* Header with count and select all */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Select critiques to integrate</p>
        <div className="flex items-center gap-2">
          <Badge variant={selectedIds.length > 0 ? "default" : "outline"}>
            {selectedIds.length} / {critiques.length} selected
          </Badge>
          {critiques.length > 0 && !isCompleted && (
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
          )}
        </div>
      </div>

      {/* Critique cards grid */}
      {critiques.length === 0 ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No structured critiques were generated. You can add custom critiques below, or confirm with none selected to skip Step 12.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {critiques.map((critique) => {
            const selected = selectedIds.includes(critique.id);
            const expanded = expandedIds.includes(critique.id);

            return (
              <div
                key={critique.id}
                role="button"
                tabIndex={0}
                onClick={() => toggleCritique(critique.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCritique(critique.id); } }}
                className={cn(
                  "rounded-xl border bg-card p-4 space-y-3 transition-colors cursor-pointer select-none",
                  selected ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30 hover:bg-muted/30",
                  isCompleted && "opacity-75 cursor-default"
                )}
              >
                <div className="space-y-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-semibold leading-snug">
                      {stripNumericPrefix(critique.title)}
                    </p>
                    <div className="flex items-center gap-1">
                      {critique.isCustom && (
                        <Badge variant="outline" className="h-5 px-1.5 text-[10px] shrink-0">
                          Custom
                        </Badge>
                      )}
                      {!isCompleted && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()}>
                            <DropdownMenuItem
                              onSelect={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                startEditCritique(critique.id);
                              }}
                            >
                              <Pencil className="size-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                deleteCritique(critique.id);
                              }}
                            >
                              <Trash2 className="size-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
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
                  <>
                    <p className={cn(
                      "text-sm text-muted-foreground/70 leading-relaxed",
                      expanded ? "" : "line-clamp-2"
                    )}>
                      {critique.detail}
                    </p>

                    {critique.detail.length > 100 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-sm w-full"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpanded(critique.id);
                        }}
                      >
                        {expanded ? (
                          <>
                            <ChevronUp className="h-3 w-3 mr-1" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-3 w-3 mr-1" />
                            Read more
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / generate custom critiques */}
      {!isCompleted && (
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCustomPanelOpen((open) => !open)}>
              + Custom Critique
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
                  {isGenerating ? "Generating..." : "Generate with AI"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addWrittenCustomCritique}
                  disabled={isGenerating || !customTitle.trim() || !customDescription.trim()}
                >
                  Add as Written
                </Button>
              </div>
            </div>
          )}

          {generationError && <p className="text-sm text-destructive">{generationError}</p>}
        </div>
      )}

      {/* Confirm Selection button */}
      {onConfirm && !isCompleted && (
        <Button
          className="w-full"
          disabled={isConfirming}
          onClick={onConfirm}
        >
          {isConfirming ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Confirming...
            </>
          ) : selectedIds.length === 0 ? (
            "Continue Without Critiques (Skip Step 12)"
          ) : (
            `Confirm ${selectedIds.length} Critique${selectedIds.length === 1 ? "" : "s"} & Continue to Step 12`
          )}
        </Button>
      )}
    </div>
  );
}
