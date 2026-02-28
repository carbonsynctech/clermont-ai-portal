"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
        <Label htmlFor="sector">Sector *</Label>
        <select
          id="sector"
          value={data.sector}
          onChange={(e) => update("sector", e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Select sector…</option>
          {SECTORS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dealType">Deal Type *</Label>
        <select
          id="dealType"
          value={data.dealType}
          onChange={(e) => update("dealType", e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Select deal type…</option>
          {DEAL_TYPES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
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
