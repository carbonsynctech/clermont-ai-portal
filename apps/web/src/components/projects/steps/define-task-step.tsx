"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2, FileText, Target, Users, MessageSquare,
  Sparkles, Building2, Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { StepTrigger } from "@/components/projects/step-trigger";
import { cn } from "@/lib/utils";
import {
  emitProjectSaved,
  PROJECT_SAVE_REQUEST_EVENT,
  type ProjectSaveRequestDetail,
} from "@/lib/project-save-events";
import type { ProjectBriefData } from "@repo/db";

// ─── Option lists ─────────────────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  "Investment Memorandum",
  "Strategy Playbook",
  "Policy Document",
  "Whitepaper",
  "Research Report",
  "Executive Summary",
  "Business Case",
  "Technical Specification",
  "Other",
];

const SECTORS = [
  "Technology", "Healthcare", "Finance", "Real Estate",
  "Energy", "Consumer", "Industrials", "Media & Telecom", "Education", "Other",
];

const DEAL_TYPES = [
  "Series A", "Series B", "Series C", "Growth Equity",
  "PE Buyout", "Venture Debt", "M&A", "IPO", "Secondary", "Other",
];

const STRATEGIC_FOCUSES = [
  "Market Expansion", "Cost Optimisation", "Digital Transformation",
  "Turnaround", "Portfolio Review", "Competitive Defence", "Other",
];

const TIME_HORIZONS = ["6 Months", "1 Year", "3 Years", "5+ Years"];

const POLICY_DOMAINS = [
  "HR & People", "Legal & Compliance", "Finance & Audit",
  "IT & Security", "Operations", "Health & Safety", "Other",
];

const RESEARCH_DOMAINS = [
  "Market Research", "Competitive Analysis", "Technology Assessment",
  "Customer Insights", "Industry Analysis", "Academic / Thought Leadership", "Other",
];

const DECISION_TYPES = [
  "Approve / Reject", "Go / No-Go", "Proceed to Next Phase",
  "Strategic Recommendation", "Board Resolution", "Information Only",
];

const BUDGET_RANGES = ["< $100K", "$100K – $500K", "$500K – $1M", "$1M – $5M", "$5M+"];

const SPEC_TYPES = [
  "API Specification", "System Architecture", "Data Model",
  "Infrastructure", "Integration Design", "Security Spec", "Other",
];

const TONE_PRESETS = [
  "Formal & Analytical",
  "Executive Brief",
  "Conversational & Clear",
  "Technical & Precise",
  "Persuasive & Action-Oriented",
  "Neutral & Objective",
  "Data-Driven & Evidence-First",
  "Cautious & Risk-Aware",
  "Narrative & Story-Led",
  "Investor-Friendly & Concise",
  "Balanced & Nuanced",
  "Other",
];

const AUDIENCES = [
  { value: "LP Committee", description: "Limited partners and fund investors reviewing deal allocation." },
  { value: "Investment Committee", description: "Senior decision-makers approving capital deployment." },
  { value: "Management Team", description: "Founders and executives of the target company." },
  { value: "Board of Directors", description: "Governance body overseeing strategic decisions." },
  { value: "External Advisors", description: "Third-party consultants and due-diligence partners." },
  { value: "Regulatory Body", description: "Compliance and regulatory oversight authorities." },
  { value: "General Audience", description: "A broad, diverse group of people with varying qualities" },
  { value: "Other", description: "A custom or unlisted audience type." },
];

// ─── Per-document-type field configs ─────────────────────────────────────────

type TextField = {
  type: "text" | "number";
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};
type RadioField = {
  type: "radio";
  key: string;
  label: string;
  required?: boolean;
  options: string[];
  columns?: number;
};
type FieldDef = TextField | RadioField;

const DOC_TYPE_FIELDS: Record<string, FieldDef[]> = {
  "Investment Memorandum": [
    { type: "number", key: "dealSizeUsd",  label: "Deal Size (USD)",                placeholder: "e.g. 50000000" },
    { type: "radio",  key: "sector",       label: "Sector",         required: true, options: SECTORS,    columns: 5 },
    { type: "radio",  key: "dealType",     label: "Deal Type",      required: true, options: DEAL_TYPES, columns: 5 },
  ],
  "Strategy Playbook": [
    { type: "text",  key: "organizationName", label: "Organization Name", required: true, placeholder: "e.g. Acme Corp" },
    { type: "radio", key: "industry",         label: "Industry",         required: true, options: SECTORS,           columns: 5 },
    { type: "radio", key: "strategicFocus",   label: "Strategic Focus",  required: true, options: STRATEGIC_FOCUSES, columns: 4 },
    { type: "radio", key: "timeHorizon",      label: "Time Horizon",                    options: TIME_HORIZONS,     columns: 4 },
  ],
  "Policy Document": [
    { type: "text",  key: "organizationName", label: "Organization Name", required: true, placeholder: "e.g. Acme Corp" },
    { type: "radio", key: "policyDomain",     label: "Policy Domain",    required: true, options: POLICY_DOMAINS, columns: 4 },
    { type: "text",  key: "jurisdiction",     label: "Jurisdiction",                     placeholder: "e.g. United States, EU, Global" },
  ],
  "Whitepaper": [
    { type: "text",  key: "organizationName", label: "Organization Name", required: true, placeholder: "e.g. Acme Corp" },
    { type: "text",  key: "topicArea",        label: "Topic Area",        required: true, placeholder: "e.g. AI in Financial Services" },
    { type: "radio", key: "targetIndustry",   label: "Target Industry",                  options: SECTORS, columns: 5 },
  ],
  "Research Report": [
    { type: "text",  key: "organizationName", label: "Organization Name", required: true, placeholder: "e.g. Acme Corp" },
    { type: "radio", key: "researchDomain",   label: "Research Domain",  required: true, options: RESEARCH_DOMAINS, columns: 4 },
  ],
  "Executive Summary": [
    { type: "text",  key: "organizationName", label: "Organization Name",  required: true, placeholder: "e.g. Acme Corp" },
    { type: "text",  key: "topicInitiative",  label: "Topic / Initiative", required: true, placeholder: "e.g. Q3 Product Launch" },
    { type: "radio", key: "decisionType",     label: "Decision Type",                     options: DECISION_TYPES, columns: 3 },
  ],
  "Business Case": [
    { type: "text",  key: "organizationName", label: "Organization Name", required: true, placeholder: "e.g. Acme Corp" },
    { type: "text",  key: "initiativeName",   label: "Initiative Name",   required: true, placeholder: "e.g. CRM Platform Migration" },
    { type: "radio", key: "budgetRange",      label: "Budget Range",                      options: BUDGET_RANGES, columns: 5 },
    { type: "text",  key: "businessUnit",     label: "Business Unit",                     placeholder: "e.g. Operations, Marketing" },
  ],
  "Technical Specification": [
    { type: "text",  key: "systemProductName", label: "System / Product Name",   required: true, placeholder: "e.g. Payment Gateway API" },
    { type: "text",  key: "techStack",         label: "Technology Stack",                         placeholder: "e.g. Next.js, PostgreSQL, AWS" },
    { type: "radio", key: "specType",          label: "Specification Type",      required: true,  options: SPEC_TYPES, columns: 4 },
  ],
  "Other": [
    { type: "text", key: "organizationName", label: "Organization / Project Name", placeholder: "e.g. Acme Corp" },
  ],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({
  icon: Icon,
  title,
  required,
  optional,
  children,
}: {
  icon: React.ElementType;
  title: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="font-medium text-sm text-foreground">
          {title}
          {required && <span className="text-destructive ml-1">*</span>}
          {optional && (
            <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
          )}
        </h3>
      </div>
      {children}
    </div>
  );
}

function CardRadioGroup({
  options,
  value,
  onChange,
  columns = 3,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  columns?: number;
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onChange}
      className={cn(
        "grid gap-2",
        columns === 5 && "grid-cols-5",
        columns === 4 && "grid-cols-4",
        columns === 3 && "grid-cols-3",
        columns === 2 && "grid-cols-2"
      )}
    >
      {options.map((opt) => (
        <label
          key={opt}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm transition-all duration-150",
            value === opt
              ? "border-primary bg-primary/5 text-primary font-semibold"
              : "border-border text-foreground/80 hover:border-muted-foreground/50 hover:bg-muted/40"
          )}
        >
          <RadioGroupItem value={opt} className="sr-only" />
          {opt}
        </label>
      ))}
    </RadioGroup>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface DefineTaskStepProps {
  projectId: string;
  projectTitle: string;
  briefData: ProjectBriefData | null;
  stage1Status: string;
  masterPrompt: string | null;
}

const CORE_BRIEF_KEYS = new Set([
  "documentType", "keyQuestion", "targetAudience",
  "tonePreset", "toneInstructions", "additionalContext",
]);

export function DefineTaskStep({
  projectId,
  projectTitle,
  briefData,
  stage1Status,
  masterPrompt,
}: DefineTaskStepProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(briefData !== null);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedPayloadRef = useRef<string | null>(null);
  const failedPayloadRef = useRef<string | null>(null);
  // Always holds the latest handleSave so event listeners never capture a stale closure
  const handleSaveRef = useRef<(opts?: { refresh?: boolean }) => Promise<void>>(async () => {});

  const [title, setTitle] = useState(
    projectTitle === "Untitled Project" ? "" : projectTitle
  );
  const [documentType, setDocumentType] = useState(briefData?.documentType ?? "");

  // Dynamic per-doc-type fields — initialised from briefData (strips core keys)
  const [contextFields, setContextFields] = useState<Record<string, string>>(() => {
    if (!briefData) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(briefData as unknown as Record<string, unknown>)) {
      if (!CORE_BRIEF_KEYS.has(k) && v !== undefined && v !== null) {
        out[k] = String(v);
      }
    }
    return out;
  });

  const [keyQuestion, setKeyQuestion] = useState(briefData?.keyQuestion ?? "");
  const [targetAudience, setTargetAudience] = useState(briefData?.targetAudience ?? "");
  const [targetAudienceOther, setTargetAudienceOther] = useState("");
  const [tonePreset, setTonePreset] = useState(briefData?.tonePreset ?? "");
  const [toneInstructions, setToneInstructions] = useState(briefData?.toneInstructions ?? "");

  function markUnsaved() { setSaved(false); }

  function setContextField(key: string, value: string) {
    setContextFields((prev) => ({ ...prev, [key]: value }));
    markUnsaved();
  }

  function handleDocumentTypeChange(v: string) {
    setDocumentType(v);
    setContextFields({});
    markUnsaved();
  }

  const requiredContextKeys = useMemo(() => {
    if (!documentType) return [];
    return (DOC_TYPE_FIELDS[documentType] ?? [])
      .filter((f) => f.required)
      .map((f) => f.key);
  }, [documentType]);

  const isFormValid =
    (title.trim() !== "" || projectTitle !== "Untitled Project") &&
    documentType !== "" &&
    keyQuestion.trim() !== "" &&
    targetAudience !== "" &&
    requiredContextKeys.every((key) => (contextFields[key] ?? "").trim() !== "");

  function buildRequestPayload() {
    const contextData: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(contextFields)) {
      if (k.endsWith("_other")) continue;
      const trimmed = v.trim();
      if (trimmed !== "") {
        const resolved = trimmed === "Other"
          ? ((contextFields[k + "_other"] ?? "").trim() || "Other")
          : trimmed;
        contextData[k] = k === "dealSizeUsd" ? Number(resolved) : resolved;
      }
    }

    const resolvedAudience = targetAudience === "Other" && targetAudienceOther.trim()
      ? targetAudienceOther.trim()
      : targetAudience;

    return {
      title: title.trim() || projectTitle,
      briefData: {
        documentType,
        keyQuestion: keyQuestion.trim(),
        targetAudience: resolvedAudience,
        ...(tonePreset ? { tonePreset } : {}),
        ...(tonePreset === "Other" && toneInstructions.trim()
          ? { toneInstructions: toneInstructions.trim() }
          : {}),
        ...contextData,
      },
    };
  }

  async function handleSave(options?: { refresh?: boolean }) {
    setIsSaving(true);
    setSaveError(null);
    const payload = buildRequestPayload();
    const serializedPayload = JSON.stringify(payload);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: serializedPayload,
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        failedPayloadRef.current = serializedPayload;
        setSaveError(body.error ?? "Failed to save");
        return;
      }

      const updated = (await res.json()) as { updatedAt?: unknown };
      setSaved(true);
      lastSavedPayloadRef.current = serializedPayload;
      failedPayloadRef.current = null;

      if (typeof updated.updatedAt === "string") {
        emitProjectSaved({ projectId, savedAt: updated.updatedAt });
      }

      if (options?.refresh) {
        router.refresh();
      }
    } catch {
      failedPayloadRef.current = serializedPayload;
      setSaveError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    if (saved && lastSavedPayloadRef.current === null) {
      lastSavedPayloadRef.current = JSON.stringify(buildRequestPayload());
    }
  }, [saved, title, projectTitle, documentType, keyQuestion, targetAudience, targetAudienceOther, tonePreset, toneInstructions, contextFields]);

  useEffect(() => {
    if (!isFormValid || isSaving) {
      return;
    }

    const serializedPayload = JSON.stringify(buildRequestPayload());
    if (serializedPayload === lastSavedPayloadRef.current) {
      return;
    }

    if (serializedPayload === failedPayloadRef.current) {
      return;
    }

    if (saveDebounceRef.current) {
      clearTimeout(saveDebounceRef.current);
    }

    saveDebounceRef.current = setTimeout(() => {
      void handleSave();
    }, 800);

    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [isFormValid, isSaving, title, projectTitle, documentType, keyQuestion, targetAudience, targetAudienceOther, tonePreset, toneInstructions, contextFields]);

  // Keep the ref pointing to the latest handleSave so the event listener below
  // never captures a stale closure (e.g. after typing into an "Other" text input)
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  // Listen for save requests from the header Save button
  useEffect(() => {
    const onSaveRequest = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectSaveRequestDetail>;
      if (customEvent.detail?.projectId !== projectId) return;
      if (isFormValid && !isSaving) void handleSaveRef.current({ refresh: true });
    };
    window.addEventListener(PROJECT_SAVE_REQUEST_EVENT, onSaveRequest);
    return () => window.removeEventListener(PROJECT_SAVE_REQUEST_EVENT, onSaveRequest);
  }, [projectId, isFormValid, isSaving]);

  // Render panels for the selected doc type's context fields.
  // Consecutive text/number fields are paired side-by-side; radio fields are full-width.
  function renderContextFields(): React.ReactNode[] {
    const fields = DOC_TYPE_FIELDS[documentType];
    if (!fields || fields.length === 0) return [];

    const nodes: React.ReactNode[] = [];
    let i = 0;

    while (i < fields.length) {
      const field = fields[i]!;

      if (field.type === "radio") {
        nodes.push(
          <div key={field.key} className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Target className="size-4 text-muted-foreground" />
              <h3 className="font-medium text-sm text-foreground">
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
                {!field.required && (
                  <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
                )}
              </h3>
            </div>
            <CardRadioGroup
              options={field.options}
              value={contextFields[field.key] ?? ""}
              onChange={(v) => setContextField(field.key, v)}
              columns={field.columns}
            />
            {contextFields[field.key] === "Other" && (
              <Input
                autoFocus
                placeholder={`Specify ${field.label.toLowerCase()}…`}
                value={contextFields[field.key + "_other"] ?? ""}
                onChange={(e) => setContextField(field.key + "_other", e.target.value)}
              />
            )}
          </div>
        );
        i++;
      } else {
        // Pair with next if next is also a text/number field
        const next = fields[i + 1];
        if (next && next.type !== "radio") {
          nodes.push(
            <div key={`${field.key}+${next.key}`} className="grid grid-cols-2 gap-5">
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm text-foreground">
                    {field.label}
                    {field.required && <span className="text-destructive ml-1">*</span>}
                    {!field.required && (
                      <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
                    )}
                  </h3>
                </div>
                <Input
                  placeholder={field.placeholder}
                  type={field.type === "number" ? "number" : "text"}
                  value={contextFields[field.key] ?? ""}
                  onChange={(e) => setContextField(field.key, e.target.value)}
                />
              </div>
              <div className="rounded-xl border bg-card p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  <h3 className="font-medium text-sm text-foreground">
                    {next.label}
                    {next.required && <span className="text-destructive ml-1">*</span>}
                    {!next.required && (
                      <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
                    )}
                  </h3>
                </div>
                <Input
                  placeholder={next.placeholder}
                  type={next.type === "number" ? "number" : "text"}
                  value={contextFields[next.key] ?? ""}
                  onChange={(e) => setContextField(next.key, e.target.value)}
                />
              </div>
            </div>
          );
          i += 2;
        } else {
          // Standalone text field
          nodes.push(
            <div key={field.key} className="rounded-xl border bg-card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <h3 className="font-medium text-sm text-foreground">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                  {!field.required && (
                    <span className="text-muted-foreground font-normal text-xs ml-1">(optional)</span>
                  )}
                </h3>
              </div>
              <Input
                placeholder={field.placeholder}
                type={field.type === "number" ? "number" : "text"}
                value={contextFields[field.key] ?? ""}
                onChange={(e) => setContextField(field.key, e.target.value)}
              />
            </div>
          );
          i++;
        }
      }
    }

    return nodes;
  }

  // ─── Completed state ────────────────────────────────────────────────────────
  if (stage1Status === "completed") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="size-5" />
          <span className="font-medium">Brief saved & master prompt generated.</span>
        </div>
        {masterPrompt && (
          <SectionCard icon={Sparkles} title="Master Prompt">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
              {masterPrompt}
            </p>
          </SectionCard>
        )}
        <Button variant="outline" size="sm" onClick={() => setSaved(false)}>
          Edit Brief
        </Button>
      </div>
    );
  }

  // ─── Edit form ──────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Project Name */}
      <SectionCard icon={FileText} title="Project Name">
        <Input
          placeholder="e.g., Q1 Investment Memo – Project Alpha"
          value={title}
          onChange={(e) => { setTitle(e.target.value); markUnsaved(); }}
          className="text-base"
        />
      </SectionCard>

      {/* Document Type */}
      <SectionCard icon={Layers} title="Document Type" required>
        <CardRadioGroup
          options={DOCUMENT_TYPES}
          value={documentType}
          onChange={handleDocumentTypeChange}
          columns={3}
        />
      </SectionCard>

      {/* Dynamic context fields (conditionally shown per doc type) */}
      {documentType && renderContextFields()}

      {/* Target Audience */}
      {documentType && (
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h3 className="font-medium text-sm text-foreground">
              Target Audience <span className="text-destructive">*</span>
            </h3>
          </div>
          <RadioGroup
            value={targetAudience}
            onValueChange={(v) => { setTargetAudience(v); markUnsaved(); }}
            className="grid grid-cols-2 gap-3"
          >
            {AUDIENCES.map((a) => (
              <FieldLabel key={a.value} htmlFor={`aud-${a.value}`}>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>{a.value}</FieldTitle>
                    <FieldDescription>{a.description}</FieldDescription>
                  </FieldContent>
                  <RadioGroupItem value={a.value} id={`aud-${a.value}`} />
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
          {targetAudience === "Other" && (
            <Input
              autoFocus
              placeholder="Specify your audience…"
              value={targetAudienceOther}
              onChange={(e) => { setTargetAudienceOther(e.target.value); markUnsaved(); }}
            />
          )}
        </div>
      )}

      {/* Purpose & Objective */}
      <SectionCard icon={MessageSquare} title="Purpose & Objective" required>
        <Textarea
          placeholder="What is this document for? What should it accomplish? e.g. 'Evaluate the investment opportunity in Project Alpha, a Series B fintech startup…'"
          value={keyQuestion}
          onChange={(e) => { setKeyQuestion(e.target.value); markUnsaved(); }}
          rows={5}
        />
      </SectionCard>

      {/* Tone Instructions */}
      <SectionCard icon={FileText} title="Tone Instructions" optional>
        <CardRadioGroup
          options={TONE_PRESETS}
          value={tonePreset}
          onChange={(v) => {
            setTonePreset(v);
            if (v !== "Other") setToneInstructions("");
            markUnsaved();
          }}
          columns={4}
        />
        {tonePreset === "Other" && (
          <Textarea
            autoFocus
            placeholder="Describe the tone you want, e.g. 'Concise and direct, suitable for a non-technical board audience…'"
            value={toneInstructions}
            onChange={(e) => { setToneInstructions(e.target.value); markUnsaved(); }}
            rows={3}
          />
        )}
      </SectionCard>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      <div className="flex items-center gap-3">
        <Button
          onClick={() => void handleSave({ refresh: true })}
          disabled={!isFormValid || isSaving}
          variant={saved ? "outline" : "default"}
        >
          {isSaving ? "Saving…" : saved ? "Saved ✓" : "Save Brief"}
        </Button>
        {saved && stage1Status !== "completed" && (
          <StepTrigger
            projectId={projectId}
            stepNumber={1}
            label="Generate Master Prompt"
            currentStatus={stage1Status}
          />
        )}
      </div>
    </div>
  );
}
