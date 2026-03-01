"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MarkdownVersionPanel } from "@/components/projects/markdown-version-panel";
import type { FactCheckFinding, FactCheckSource, Version } from "@repo/db";

function computeWordDiff(textA: string, textB: string) {
  const wordsA = new Set(textA.split(/\s+/).filter(Boolean));
  const wordsB = new Set(textB.split(/\s+/).filter(Boolean));

  const removedTokens = textA.split(/(\s+)/);
  const addedTokens = textB.split(/(\s+)/);

  return { wordsA, wordsB, removedTokens, addedTokens };
}

function renderDiffTokens(tokens: string[], oppositeWordSet: Set<string>, mode: "removed" | "added") {
  return tokens.map((token, index) => {
    if (/\s+/.test(token)) {
      return <span key={`${mode}-space-${index}`}>{token}</span>;
    }

    if (oppositeWordSet.has(token)) {
      return <span key={`${mode}-same-${index}`}>{token}</span>;
    }

    if (mode === "removed") {
      return (
        <mark
          key={`${mode}-diff-${index}`}
          className="rounded px-0.5 bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300 line-through"
        >
          {token}
        </mark>
      );
    }

    return (
      <mark
        key={`${mode}-diff-${index}`}
        className="rounded px-0.5 bg-green-100 text-green-800 dark:bg-green-950/30 dark:text-green-300"
      >
        {token}
      </mark>
    );
  });
}

function formatSourceLabel(source: FactCheckSource) {
  if (source.documentName && typeof source.pageNumber === "number") {
    return `${source.documentName} · p.${source.pageNumber}`;
  }

  if (source.documentName) {
    return source.documentName;
  }

  if (typeof source.pageNumber === "number") {
    return `Page ${source.pageNumber}`;
  }

  return "Source unavailable";
}

interface FactCheckReviewStepProps {
  projectId: string;
  factCheckFindings: FactCheckFinding[];
  sourceVersion?: Version;
  factCheckedVersion: Version;
}

export function FactCheckReviewStep({
  projectId,
  factCheckFindings,
  sourceVersion,
  factCheckedVersion,
}: FactCheckReviewStepProps) {
  const router = useRouter();
  const findingIds = useMemo(
    () => factCheckFindings.map((finding) => finding.id),
    [factCheckFindings],
  );
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>(findingIds);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const issueCount = factCheckFindings.length;
  const acceptedCount = selectedFindingIds.length;

  const selectedSet = useMemo(() => new Set(selectedFindingIds), [selectedFindingIds]);

  const wordDiff = useMemo(() => {
    if (!sourceVersion) {
      return null;
    }
    return computeWordDiff(sourceVersion.content, factCheckedVersion.content);
  }, [sourceVersion, factCheckedVersion.content]);

  function toggleFinding(findingId: string) {
    setSelectedFindingIds((current) =>
      current.includes(findingId)
        ? current.filter((item) => item !== findingId)
        : [...current, findingId],
    );
  }

  async function handleStartOver() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/fact-check/restart`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to restart fact-check");
      }

      if (typeof window !== "undefined") {
        sessionStorage.removeItem(`job-${projectId}-8`);
        sessionStorage.removeItem(`output-${projectId}-8`);
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restart fact-check");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <MarkdownVersionPanel
          title="Fact-Checked Content (Text)"
          content={factCheckedVersion.content}
          wordCount={factCheckedVersion.wordCount ?? undefined}
        />

        {wordDiff && issueCount > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Full Document Changes</h4>
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Original (Step 5 Synthesis)</p>
                  <ScrollArea className="h-[260px] rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {renderDiffTokens(wordDiff.removedTokens, wordDiff.wordsB, "removed")}
                  </ScrollArea>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Corrected (Step 8)</p>
                  <ScrollArea className="h-[260px] rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {renderDiffTokens(wordDiff.addedTokens, wordDiff.wordsA, "added")}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 h-fit space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h3 className="font-medium text-base">Fact-Check Results</h3>
          </div>
          <Badge variant="outline">{issueCount} issues</Badge>
        </div>

        {issueCount === 0 ? (
          <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/20 dark:text-green-300">
            Content verified — no issues found.
          </div>
        ) : (
          <ScrollArea className="h-[420px] pr-3">
            <div className="space-y-2">
              {factCheckFindings.map((finding) => {
                const selected = selectedSet.has(finding.id);
                const hasSources = Array.isArray(finding.sources) && finding.sources.length > 0;
                return (
                  <button
                    key={finding.id}
                    type="button"
                    onClick={() => toggleFinding(finding.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleFinding(finding.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5"
                      />
                      <div className="space-y-2">
                        <p className="text-sm leading-relaxed text-foreground/90">{finding.issue}</p>
                        <div className="rounded-md border bg-background/60 p-2 space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground">Sources</p>
                          {hasSources ? (
                            <ul className="space-y-1">
                              {finding.sources?.map((source, index) => (
                                <li key={`${finding.id}-source-${index}`} className="text-xs text-foreground/80">
                                  {formatSourceLabel(source)}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-muted-foreground">Source unavailable</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-sm text-muted-foreground">
            {acceptedCount} of {issueCount} corrections accepted
          </p>
          <Button onClick={() => void handleStartOver()} disabled={isSubmitting}>
            {isSubmitting ? "Restarting…" : "Start Over"}
          </Button>
        </div>
      </div>
    </div>
  );
}
