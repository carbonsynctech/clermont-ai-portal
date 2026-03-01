"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  const findingMap = useMemo(
    () => new Map(factCheckFindings.map((finding) => [finding.id, finding])),
    [factCheckFindings],
  );

  const selectedIssues = useMemo(
    () => selectedFindingIds.map((id) => findingMap.get(id)?.issue).filter((issue): issue is string => Boolean(issue)),
    [findingMap, selectedFindingIds],
  );

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

  async function handleApprove() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/fact-check/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issuesApproved: selectedIssues,
          findingIds: selectedFindingIds,
        }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Failed to approve fact-check");
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve fact-check");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-medium text-base">Fact-Checked Content (Text)</h3>
          <Badge variant="outline">{factCheckedVersion.wordCount?.toLocaleString() ?? "?"} words</Badge>
        </div>

        <ScrollArea className="h-[420px] rounded-lg border p-4">
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-foreground
              [&_h1]:scroll-m-20 [&_h1]:text-2xl [&_h1]:font-extrabold [&_h1]:tracking-tight
              [&_h2]:scroll-m-20 [&_h2]:border-b [&_h2]:pb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:first:mt-0
              [&_h3]:scroll-m-20 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:tracking-tight
              [&_h4]:scroll-m-20 [&_h4]:text-base [&_h4]:font-semibold [&_h4]:tracking-tight
              [&_p]:leading-7 [&_p:not(:first-child)]:mt-4
              [&_ul]:my-4 [&_ul]:ml-6 [&_ul]:list-disc [&_ul>li]:mt-1
              [&_ol]:my-4 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol>li]:mt-1
              [&_blockquote]:mt-4 [&_blockquote]:border-l-2 [&_blockquote]:pl-6 [&_blockquote]:italic
              [&_strong]:font-semibold
              [&_table]:w-full [&_table]:my-4 [&_tr]:m-0 [&_tr]:border-t [&_tr]:p-0 [&_tr:nth-child(even)]:bg-muted
              [&_th]:border [&_th]:px-4 [&_th]:py-2 [&_th]:text-left [&_th]:font-bold
              [&_td]:border [&_td]:px-4 [&_td]:py-2 [&_td]:text-left
              [&_hr]:my-4 [&_hr]:border [&_hr]:border-muted-foreground/20"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
              {factCheckedVersion.content}
            </ReactMarkdown>
          </div>
        </ScrollArea>

        {wordDiff && issueCount > 0 && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="font-medium text-sm">Full Document Changes</h4>
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Original (Step 7)</p>
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
          <Button onClick={() => void handleApprove()} disabled={isSubmitting}>
            {isSubmitting ? "Approving…" : "Approve & Continue →"}
          </Button>
        </div>
      </div>
    </div>
  );
}
