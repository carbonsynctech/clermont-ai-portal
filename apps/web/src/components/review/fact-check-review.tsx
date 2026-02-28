"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StyledDocumentPreview } from "@/components/projects/steps/styled-document-preview";
import type { Version } from "@repo/db";

interface FactCheckReviewStepProps {
  projectId: string;
  projectTitle: string;
  companyName?: string;
  dealType?: string;
  coverImageUrl?: string;
  factCheckIssues: string[];
  factCheckedVersion: Version;
}

export function FactCheckReviewStep({
  projectId,
  projectTitle,
  companyName,
  dealType,
  coverImageUrl,
  factCheckIssues,
  factCheckedVersion,
}: FactCheckReviewStepProps) {
  const router = useRouter();
  const [selectedIssues, setSelectedIssues] = useState<string[]>(factCheckIssues);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const issueCount = factCheckIssues.length;
  const acceptedCount = selectedIssues.length;

  const selectedSet = useMemo(() => new Set(selectedIssues), [selectedIssues]);

  function toggleIssue(issue: string) {
    setSelectedIssues((current) =>
      current.includes(issue) ? current.filter((item) => item !== issue) : [...current, issue],
    );
  }

  async function handleApprove() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/fact-check/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issuesApproved: selectedIssues }),
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
      <div className="rounded-xl border bg-card p-4">
        <StyledDocumentPreview
          content={factCheckedVersion.content}
          projectTitle={projectTitle}
          companyName={companyName}
          dealType={dealType}
          coverImageUrl={coverImageUrl}
        />
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
              {factCheckIssues.map((issue) => {
                const selected = selectedSet.has(issue);
                return (
                  <button
                    key={issue}
                    type="button"
                    onClick={() => toggleIssue(issue)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selected}
                        onCheckedChange={() => toggleIssue(issue)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5"
                      />
                      <p className="text-sm leading-relaxed text-foreground/90">{issue}</p>
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
