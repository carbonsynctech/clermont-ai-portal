"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VersionViewer } from "./version-viewer";
import { VersionDiff } from "./version-diff";
import type { Version } from "@repo/db";

const VERSION_TYPE_LABELS: Record<string, string> = {
  persona_draft: "Persona Draft",
  synthesis: "Synthesis",
  styled: "Styled",
  fact_checked: "Fact-Checked",
  final_styled: "Final Styled",
  human_reviewed: "Human Reviewed",
  red_report: "Red Report",
  final: "Final",
  exported_html: "Exported HTML",
};

interface VersionsPanelProps {
  versions: Version[];
}

export function VersionsPanel({ versions }: VersionsPanelProps) {
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [diffIds, setDiffIds] = useState<[string, string] | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<string | null>(null);

  if (versions.length === 0) return null;

  const viewingVersion = versions.find((v) => v.id === viewingId);
  const diffVersions =
    diffIds
      ? [versions.find((v) => v.id === diffIds[0]), versions.find((v) => v.id === diffIds[1])]
      : [undefined, undefined];

  function handleCompareSelect(id: string) {
    if (!compareA) {
      setCompareA(id);
    } else if (compareA === id) {
      setCompareA(null);
    } else {
      setDiffIds([compareA, id]);
      setCompareMode(false);
      setCompareA(null);
    }
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">Versions ({versions.length})</p>
          {versions.length >= 2 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => {
                setCompareMode((v) => !v);
                setCompareA(null);
              }}
            >
              {compareMode ? "Cancel compare" : "Compare"}
            </Button>
          )}
        </div>

        {compareMode && (
          <p className="text-xs text-muted-foreground">
            {compareA ? "Now select the second version to compare." : "Select the first version to compare."}
          </p>
        )}

        <div className="space-y-1">
          {versions.map((v) => (
            <div
              key={v.id}
              className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs transition-colors ${
                compareA === v.id ? "border-primary bg-primary/5" : "border-border"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0 capitalize">
                  {VERSION_TYPE_LABELS[v.versionType] ?? v.versionType}
                </Badge>
                <span className="truncate text-foreground">{v.internalLabel}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                {v.wordCount != null && (
                  <span className="text-muted-foreground">{v.wordCount.toLocaleString()}w</span>
                )}
                {compareMode ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleCompareSelect(v.id)}
                  >
                    {compareA === v.id ? "✓ Selected" : "Select"}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setViewingId(v.id)}
                  >
                    View
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* View modal */}
      <Dialog open={viewingId !== null} onOpenChange={(open: boolean) => { if (!open) setViewingId(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-sm">{viewingVersion?.internalLabel}</DialogTitle>
          </DialogHeader>
          {viewingVersion && <VersionViewer version={viewingVersion} />}
        </DialogContent>
      </Dialog>

      {/* Diff modal */}
      <Dialog open={diffIds !== null} onOpenChange={(open: boolean) => { if (!open) setDiffIds(null); }}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Version Comparison</DialogTitle>
          </DialogHeader>
          {diffVersions[0] && diffVersions[1] && (
            <VersionDiff versionA={diffVersions[0]} versionB={diffVersions[1]} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
