"use client";

import { Label } from "@/components/ui/label";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

const AUDIENCES = [
  "LP Committee",
  "Investment Committee",
  "Management Team",
  "Board of Directors",
  "External Advisors",
  "Regulatory Body",
  "Other",
];

interface Step2Data {
  keyQuestion: string;
  targetAudience: string;
}

interface BriefStep2Props {
  data: Step2Data;
  onChange: (data: Step2Data) => void;
}

export function BriefStep2({ data, onChange }: BriefStep2Props) {
  function update(field: keyof Step2Data, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="keyQuestion">Key Question to Answer *</Label>
        <textarea
          id="keyQuestion"
          rows={4}
          placeholder="What is the core question this memo should answer? e.g. Should we invest $50M in Acme Corp at a $500M valuation?"
          value={data.keyQuestion}
          onChange={(e) => update("keyQuestion", e.target.value)}
          className="flex min-h-[96px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label>Target Audience *</Label>
        <Combobox
          items={AUDIENCES}
          value={data.targetAudience}
          onValueChange={(val) => update("targetAudience", val ?? "")}
        >
          <ComboboxInput placeholder="Select audience…" className="w-full" />
          <ComboboxContent>
            <ComboboxEmpty>No audiences found.</ComboboxEmpty>
            <ComboboxList>
              {(item) => (
                <ComboboxItem key={item} value={item}>
                  {item}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
    </div>
  );
}
