"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, Info, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
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

function renderPurpleDiffTokens(tokens: string[], oppositeWordSet: Set<string>, mode: "removed" | "added") {
  return tokens.map((token, index) => {
    if (/\s+/.test(token)) {
      return <span key={`purple-${mode}-space-${index}`}>{token}</span>;
    }

    if (oppositeWordSet.has(token)) {
      return <span key={`purple-${mode}-same-${index}`}>{token}</span>;
    }

    if (mode === "removed") {
      return (
        <mark
          key={`purple-${mode}-diff-${index}`}
          className="rounded px-0.5 bg-primary/20 text-primary line-through dark:bg-primary/35 dark:text-primary-foreground"
        >
          {token}
        </mark>
      );
    }

    return (
      <mark
        key={`purple-${mode}-diff-${index}`}
        className="rounded px-0.5 bg-primary/25 text-primary dark:bg-primary/40 dark:text-primary-foreground"
      >
        {token}
      </mark>
    );
  });
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function highlightAcceptedCorrections(content: string, correctedTexts: string[]): string {
  if (correctedTexts.length === 0) return content;

  let highlighted = content;
  const uniqueTexts = [...new Set(correctedTexts.filter((text) => text.trim().length > 0))]
    .sort((a, b) => b.length - a.length);

  for (const correctedText of uniqueTexts) {
    if (!highlighted.includes(correctedText)) continue;
    highlighted = highlighted.split(correctedText).join(`<mark>${escapeHtml(correctedText)}</mark>`);
  }

  return highlighted;
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
  approvedFindingIds?: string[];
  approvedIssues?: string[];
  appliedCorrections?: number;
  isStepApproved?: boolean;
  onApproveSuccess?: () => void;
}

export function FactCheckReviewStep({
  projectId,
  factCheckFindings,
  sourceVersion,
  factCheckedVersion,
  approvedFindingIds,
  approvedIssues,
  appliedCorrections,
  isStepApproved = false,
  onApproveSuccess,
}: FactCheckReviewStepProps) {
  const router = useRouter();
  const findingIds = useMemo(
    () => factCheckFindings.map((finding) => finding.id),
    [factCheckFindings],
  );
  const [selectedFindingIds, setSelectedFindingIds] = useState<string[]>(approvedFindingIds ?? findingIds);
  const [isStartingOver, setIsStartingOver] = useState(false);
  const [isApplyingCorrections, setIsApplyingCorrections] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [displayedContent, setDisplayedContent] = useState(factCheckedVersion.content);
  const [appliedDiff, setAppliedDiff] = useState<ReturnType<typeof computeWordDiff> | null>(null);
  const [lastApiOutput, setLastApiOutput] = useState<{
    appliedCorrections: number;
    issuesApproved: string[];
    findingIds: string[];
  } | null>(null);
  const [detailFindingId, setDetailFindingId] = useState<string | null>(null);
  const detailFinding = useMemo(
    () => (detailFindingId ? factCheckFindings.find((f) => f.id === detailFindingId) ?? null : null),
    [detailFindingId, factCheckFindings],
  );

  const issueCount = factCheckFindings.length;
  const acceptedCount = selectedFindingIds.length;

  const selectedSet = useMemo(() => new Set(selectedFindingIds), [selectedFindingIds]);
  const approvedIdSet = useMemo(
    () => new Set((isApproved ? (approvedFindingIds ?? selectedFindingIds) : approvedFindingIds) ?? []),
    [approvedFindingIds, isApproved, selectedFindingIds],
  );
  const approvedFindings = useMemo(
    () => factCheckFindings.filter((finding) => approvedIdSet.has(finding.id)),
    [factCheckFindings, approvedIdSet],
  );
  const inlineHighlightedContent = useMemo(() => {
    if (!isApproved && (!approvedFindingIds || approvedFindingIds.length === 0)) {
      return displayedContent;
    }
    const correctedTexts = approvedFindings
      .map((finding) => (typeof finding.correctedText === "string" ? finding.correctedText : ""))
      .filter((value) => value.trim().length > 0);
    return highlightAcceptedCorrections(displayedContent, correctedTexts);
  }, [approvedFindingIds, approvedFindings, displayedContent, isApproved]);

  useEffect(() => {
    setSelectedFindingIds(approvedFindingIds ?? findingIds);
    setDisplayedContent(factCheckedVersion.content);
    setAppliedDiff(null);
    setIsApproved(issueCount === 0 || isStepApproved);
    if (isStepApproved) {
      setLastApiOutput({
        appliedCorrections: typeof appliedCorrections === "number" ? appliedCorrections : 0,
        issuesApproved: approvedIssues ?? [],
        findingIds: approvedFindingIds ?? [],
      });
    } else {
      setLastApiOutput(null);
    }
  }, [
    appliedCorrections,
    approvedFindingIds,
    approvedIssues,
    factCheckedVersion.content,
    findingIds,
    isStepApproved,
    issueCount,
  ]);

  const wordDiff = useMemo(() => {
    if (!sourceVersion) {
      return null;
    }
    return computeWordDiff(sourceVersion.content, displayedContent);
  }, [sourceVersion, displayedContent]);

  function toggleFinding(findingId: string) {
    setSelectedFindingIds((current) =>
      current.includes(findingId)
        ? current.filter((item) => item !== findingId)
        : [...current, findingId],
    );
  }

  async function handleStartOver() {
    setIsStartingOver(true);
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
      setIsStartingOver(false);
    }
  }

  async function handleAcceptCorrections() {
    setIsApplyingCorrections(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/fact-check/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseContent: displayedContent,
          findingIds: selectedFindingIds,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        revisedContent?: unknown;
        appliedCorrections?: unknown;
      };

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to apply accepted corrections");
      }

      const revisedContent = typeof data.revisedContent === "string" ? data.revisedContent : displayedContent;
      const diff = computeWordDiff(displayedContent, revisedContent);
      const issuesApproved = factCheckFindings
        .filter((finding) => selectedFindingIds.includes(finding.id))
        .map((finding) => finding.issue);
      const appliedCount =
        typeof data.appliedCorrections === "number" ? data.appliedCorrections : issuesApproved.length;

      setDisplayedContent(revisedContent);
      setAppliedDiff(diff);
      setIsApproved(true);
      setLastApiOutput({
        appliedCorrections: appliedCount,
        issuesApproved,
        findingIds: selectedFindingIds,
      });
      onApproveSuccess?.();
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to apply accepted corrections");
    } finally {
      setIsApplyingCorrections(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <MarkdownVersionPanel
          title="Fact-Checked Content (Text)"
          content={inlineHighlightedContent}
          wordCount={countWords(displayedContent)}
        />

        {lastApiOutput && (
          <div className="rounded-xl border bg-card p-4 space-y-2">
            <h4 className="font-medium text-sm">API Output (`/fact-check/approve`)</h4>
            <pre className="rounded-md border bg-muted/30 p-3 text-xs overflow-auto whitespace-pre-wrap break-words">
{JSON.stringify(lastApiOutput, null, 2)}
            </pre>
          </div>
        )}

        {appliedDiff && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Accepted Correction Changes (Purple Highlight)</h4>
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Before applying accepted corrections</p>
                  <ScrollArea className="h-[260px] rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {renderPurpleDiffTokens(appliedDiff.removedTokens, appliedDiff.wordsB, "removed")}
                  </ScrollArea>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">After applying accepted corrections</p>
                  <ScrollArea className="h-[260px] rounded-lg border p-3 text-sm leading-relaxed whitespace-pre-wrap">
                    {renderPurpleDiffTokens(appliedDiff.addedTokens, appliedDiff.wordsA, "added")}
                  </ScrollArea>
                </div>
              </div>
            </div>
          </>
        )}

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

      <div className="rounded-xl border bg-card p-4 lg:sticky lg:top-4 lg:h-[calc(100vh-7rem)] h-fit flex flex-col gap-4">
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
          <ScrollArea className="flex-1 min-h-0 pr-3">
            <div className="space-y-2">
              {factCheckFindings.map((finding) => {
                const selected = selectedSet.has(finding.id);
                const hasSources = Array.isArray(finding.sources) && finding.sources.length > 0;
                const hasClaimData = finding.incorrectText || finding.correctedText;
                return (
                  <div
                    key={finding.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleFinding(finding.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleFinding(finding.id);
                      }
                    }}
                    className={`w-full rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-1">
                          <p className="text-sm leading-relaxed text-foreground/90">{finding.issue}</p>
                          {(hasClaimData || hasSources) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDetailFindingId(finding.id);
                              }}
                              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                              title="View claim vs fact-check details"
                            >
                              <Info className="size-3.5" />
                            </button>
                          )}
                        </div>
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
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="mt-auto space-y-2 pt-1">
          <Button
            className="w-full"
            variant={isApproved ? "secondary" : "default"}
            onClick={() => void handleAcceptCorrections()}
            disabled={
              isApproved
              || isApplyingCorrections
              || isStartingOver
              || issueCount === 0
              || acceptedCount === 0
            }
          >
            {isApplyingCorrections ? "Applying…" : isApproved ? `${acceptedCount}/${issueCount} accepted` : `Accept ${acceptedCount} Correction${acceptedCount === 1 ? "" : "s"}`}
          </Button>

          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {acceptedCount} of {issueCount} corrections selected
            </p>
            <Button variant="ghost" size="sm" onClick={() => void handleStartOver()} disabled={isStartingOver || isApplyingCorrections}>
              {isStartingOver ? "Restarting…" : "Start Over"}
            </Button>
          </div>
        </div>
      </div>

      {/* Claim vs Fact-Check Detail Dialog */}
      <Dialog open={detailFindingId !== null} onOpenChange={(open) => { if (!open) setDetailFindingId(null); }}>
        <DialogContent className="max-w-xl">
          {detailFinding && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-primary" />
                  Fact-Check Detail
                </DialogTitle>
                <DialogDescription className="text-sm">{detailFinding.issue}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Claim vs Correction comparison */}
                {(detailFinding.incorrectText || detailFinding.correctedText) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Claim (Original)</p>
                      <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-sm leading-relaxed dark:border-red-900/40 dark:bg-red-950/20">
                        {detailFinding.incorrectText || <span className="italic text-muted-foreground">Not specified</span>}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <ArrowRight className="size-3 text-green-600 dark:text-green-400 hidden sm:block" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">Fact-Checked</p>
                      </div>
                      <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 text-sm leading-relaxed dark:border-green-900/40 dark:bg-green-950/20">
                        {detailFinding.correctedText || <span className="italic text-muted-foreground">No correction provided</span>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Sources with clickable links */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
                  {Array.isArray(detailFinding.sources) && detailFinding.sources.length > 0 ? (
                    <ul className="space-y-2">
                      {detailFinding.sources.map((source, index) => (
                        <li
                          key={`detail-source-${index}`}
                          className="rounded-lg border bg-muted/30 p-3 space-y-1"
                        >
                          <p className="text-sm font-medium text-foreground">
                            {formatSourceLabel(source)}
                          </p>
                          {source.evidence && (
                            <p className="text-xs text-muted-foreground leading-relaxed italic">
                              &ldquo;{source.evidence}&rdquo;
                            </p>
                          )}
                          {source.url && (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                            >
                              <ExternalLink className="size-3" />
                              {source.url.length > 60 ? `${source.url.slice(0, 60)}…` : source.url}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground rounded-lg border bg-muted/30 p-3">
                      No sources available for this finding.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
