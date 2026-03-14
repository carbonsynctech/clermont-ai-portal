"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check } from "lucide-react";
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

interface VersionViewerProps {
  version: Version;
}

export function VersionViewer({ version }: VersionViewerProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(version.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-3">
      {/* Meta */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-sm capitalize">
            {VERSION_TYPE_LABELS[version.version_type] ?? version.version_type}
          </Badge>
          <Badge variant="outline" className="text-sm">
            Step {version.produced_by_step}
          </Badge>
          {version.word_count != null && (
            <span className="text-sm text-muted-foreground">
              {version.word_count.toLocaleString()} words
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-8 px-3 text-sm gap-1.5" onClick={() => void handleCopy()}>
          {copied ? (
            <>
              <Check className="h-4 w-4 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </Button>
      </div>

      <div className="text-sm text-muted-foreground" suppressHydrationWarning>
        {version.internal_label} · {new Date(version.created_at).toLocaleString()}
      </div>

      {/* Content */}
      <ScrollArea className="h-[60vh] rounded-md border">
        <pre className="p-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans">
          {version.content}
        </pre>
      </ScrollArea>
    </div>
  );
}
