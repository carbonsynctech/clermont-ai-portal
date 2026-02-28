"use client";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Version } from "@repo/db";

interface VersionDiffProps {
  versionA: Version;
  versionB: Version;
}

function computeWordDiff(textA: string, textB: string) {
  const wordsA = new Set(textA.split(/\s+/).filter(Boolean));
  const wordsB = new Set(textB.split(/\s+/).filter(Boolean));

  const highlightRemoved = textA
    .split(/(\s+)/)
    .map((token, i) => {
      if (/\s+/.test(token)) return token;
      if (!wordsB.has(token)) {
        return `<mark class="bg-red-100 text-red-800 rounded px-0.5">${token}</mark>`;
      }
      return token;
    })
    .join("");

  const highlightAdded = textB
    .split(/(\s+)/)
    .map((token) => {
      if (/\s+/.test(token)) return token;
      if (!wordsA.has(token)) {
        return `<mark class="bg-green-100 text-green-800 rounded px-0.5">${token}</mark>`;
      }
      return token;
    })
    .join("");

  return { highlightRemoved, highlightAdded };
}

export function VersionDiff({ versionA, versionB }: VersionDiffProps) {
  const { highlightRemoved, highlightAdded } = computeWordDiff(
    versionA.content,
    versionB.content
  );

  return (
    <div className="grid grid-cols-2 gap-4 min-h-[50vh]">
      {/* Left: A with removed words highlighted */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {versionA.internalLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Step {versionA.producedByStep}
          </span>
        </div>
        <ScrollArea className="h-[55vh] rounded-md border">
          <div
            className="p-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans"
            dangerouslySetInnerHTML={{ __html: highlightRemoved }}
          />
        </ScrollArea>
      </div>

      {/* Right: B with added words highlighted */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {versionB.internalLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Step {versionB.producedByStep}
          </span>
        </div>
        <ScrollArea className="h-[55vh] rounded-md border">
          <div
            className="p-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans"
            dangerouslySetInnerHTML={{ __html: highlightAdded }}
          />
        </ScrollArea>
      </div>
    </div>
  );
}
