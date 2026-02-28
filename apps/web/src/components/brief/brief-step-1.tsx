"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";

const SECTORS = [
  "Technology",
  "Healthcare",
  "Finance",
  "Real Estate",
  "Energy",
  "Consumer",
  "Industrials",
  "Media & Telecom",
  "Other",
];

const DEAL_TYPES = [
  "Series A",
  "Series B",
  "Series C",
  "Growth Equity",
  "PE Buyout",
  "Venture Debt",
  "M&A",
  "IPO",
  "Other",
];

interface Step1Data {
  companyName: string;
  sector: string;
  dealType: string;
  dealSizeUsd: string;
}

interface BriefStep1Props {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
}

export function BriefStep1({ data, onChange }: BriefStep1Props) {
  function update(field: keyof Step1Data, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="companyName">Company Name *</Label>
        <Input
          id="companyName"
          placeholder="e.g. Acme Corp"
          value={data.companyName}
          onChange={(e) => update("companyName", e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Sector *</Label>
        <Combobox
          items={SECTORS}
          value={data.sector}
          onValueChange={(val) => update("sector", val ?? "")}
        >
          <ComboboxInput placeholder="Select sector…" className="w-full" />
          <ComboboxContent>
            <ComboboxEmpty>No sectors found.</ComboboxEmpty>
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

      <div className="space-y-2">
        <Label>Deal Type *</Label>
        <Combobox
          items={DEAL_TYPES}
          value={data.dealType}
          onValueChange={(val) => update("dealType", val ?? "")}
        >
          <ComboboxInput placeholder="Select deal type…" className="w-full" />
          <ComboboxContent>
            <ComboboxEmpty>No deal types found.</ComboboxEmpty>
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

      <div className="space-y-2">
        <Label htmlFor="dealSizeUsd">Deal Size (USD) <span className="text-muted-foreground text-xs">optional</span></Label>
        <Input
          id="dealSizeUsd"
          type="number"
          placeholder="e.g. 50000000"
          value={data.dealSizeUsd}
          onChange={(e) => update("dealSizeUsd", e.target.value)}
        />
      </div>
    </div>
  );
}
