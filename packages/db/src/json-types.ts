// Hand-written JSONB interfaces for typed columns.
// These are used to cast jsonb columns from Supabase queries.

// ── projects.brief_data ──────────────────────────────────────
export interface ProjectBriefData {
  // Core (all doc types)
  documentType?: string;
  keyQuestion: string;
  targetAudience: string;
  tonePreset?: string;
  toneInstructions?: string;
  additionalContext?: string;

  // Investment Memorandum
  companyName?: string;
  sector?: string;
  dealType?: string;
  dealSizeUsd?: number;

  // Strategy Playbook
  organizationName?: string;
  industry?: string;
  strategicFocus?: string;
  timeHorizon?: string;

  // Policy Document
  policyDomain?: string;
  jurisdiction?: string;

  // Whitepaper
  topicArea?: string;
  targetIndustry?: string;

  // Research Report
  researchDomain?: string;

  // Executive Summary
  topicInitiative?: string;
  decisionType?: string;

  // Business Case
  initiativeName?: string;
  budgetRange?: string;
  businessUnit?: string;

  // Technical Specification
  systemProductName?: string;
  techStack?: string;
  specType?: string;

  // Table of Contents (generated after Step 1)
  tableOfContents?: TocEntry[];
}

// ── Table of Contents ───────────────────────────────────────────
export interface TocEntry {
  id: string;
  title: string;
  level: number; // 1 = top-level section, 2 = sub-section
  description?: string;
}

// ── Document Type field definitions ─────────────────────────────
export interface DocumentTypeFieldDef {
  type: "text" | "number" | "radio";
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  columns?: number;
}

// ── stages.metadata ──────────────────────────────────────────
export interface FactCheckSource {
  documentName: string | null;
  pageNumber: number | null;
  url?: string | null;
  evidence?: string | null;
}

export interface FactCheckFinding {
  id: string;
  issue: string;
  incorrectText?: string | null;
  correctedText?: string | null;
  sources?: FactCheckSource[];
}

export interface StageMetadata {
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
  factCheckIssues?: string[];
  factCheckFindings?: FactCheckFinding[];
  factCheckApprovedFindingIds?: string[];
  factCheckApprovedIssues?: string[];
  factCheckAppliedCorrections?: number;
  factCheckRevisedVersionId?: string;
  reviewDraftContent?: string;
  reviewDraftSavedAt?: string;
  reviewNotes?: string;
  selectedCritiquesCount?: number;
  devilsAdvocateDraft?: {
    critiques: Array<{
      id: number;
      title: string;
      detail: string;
      isCustom?: boolean;
    }>;
    selectedIds: number[];
    selectedCritiques: string[];
    savedAt: string;
  };
}

// ── style_guides.extracted_rules ─────────────────────────────
export interface StyleGuideRules {
  toneRules: string[];
  formattingRules: string[];
  vocabularyRules: string[];
  structureRules: string[];
  prohibitions: string[];
}

// ── style_guides.cover_images ────────────────────────────────
export interface CoverImageEntry {
  storagePath: string;
  style: "corporate" | "modern" | "minimal" | "bold";
  prompt: string;
  mimeType: string;
}

export interface CoverImagesData {
  images: CoverImageEntry[];
  selectedStyle: "corporate" | "modern" | "minimal" | "bold" | null;
  generatedAt: string; // ISO timestamp
}
