"use client";

import { Label } from "@/components/ui/label";

interface Step3Data {
  toneInstructions: string;
  additionalContext: string;
}

interface AllData {
  companyName: string;
  sector: string;
  dealType: string;
  dealSizeUsd: string;
  keyQuestion: string;
  targetAudience: string;
  toneInstructions: string;
  additionalContext: string;
}

interface BriefStep3Props {
  data: Step3Data;
  allData: AllData;
  onChange: (data: Step3Data) => void;
}

export function BriefStep3({ data, allData, onChange }: BriefStep3Props) {
  function update(field: keyof Step3Data, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="toneInstructions">
            Tone Instructions <span className="text-muted-foreground text-xs">optional</span>
          </Label>
          <textarea
            id="toneInstructions"
            rows={3}
            placeholder="e.g. Formal and analytical. Avoid jargon. Use bullet points for key risks."
            value={data.toneInstructions}
            onChange={(e) => update("toneInstructions", e.target.value)}
            className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="additionalContext">
            Additional Context <span className="text-muted-foreground text-xs">optional</span>
          </Label>
          <textarea
            id="additionalContext"
            rows={3}
            placeholder="Any other context the AI should know about this deal or company…"
            value={data.additionalContext}
            onChange={(e) => update("additionalContext", e.target.value)}
            className="flex min-h-[72px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
        <p className="font-medium text-foreground text-xs uppercase tracking-wider">Review</p>
        <dl className="space-y-1">
          {(
            [
              ["Company", allData.companyName],
              ["Sector", allData.sector],
              ["Deal Type", allData.dealType],
              ...(allData.dealSizeUsd
                ? [["Deal Size", `$${Number(allData.dealSizeUsd).toLocaleString()}`]]
                : []),
              ["Audience", allData.targetAudience],
              ["Key Question", allData.keyQuestion],
            ] as [string, string][]
          ).map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="text-muted-foreground shrink-0 w-24">{label}:</dt>
              <dd className="text-foreground truncate">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
