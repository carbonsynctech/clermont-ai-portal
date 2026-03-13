import type {
  Stage,
  Persona,
  SourceMaterial,
  Version,
  StyleGuide,
  Project,
  FactCheckFinding,
} from "@repo/db";
import type { CritiqueItem } from "@/components/review/critique-selector";
import type { TokenUsageSummary } from "@/lib/token-usage-cost";

export const STEP_TITLES: Record<number, string> = {
  1: "Define Task",
  2: "Select Personas",
  3: "Source Material",
  4: "Generate Drafts",
  5: "Synthesize",
  6: "Fact-Check",
  7: "Human Review",
  8: "Devil's Advocate",
  9: "Integrate Critiques",
  10: "Style Guide",
  11: "Edit for Style",
  12: "Export",
};

export const STEP_PHASES: Record<number, string> = {
  1: "Setup Phase", 2: "Setup Phase", 3: "Setup Phase",
  4: "Generate Phase", 5: "Generate Phase",
  6: "Review Phase", 7: "Review Phase", 8: "Review Phase", 9: "Review Phase",
  10: "Polish Phase", 11: "Polish Phase", 12: "Polish Phase",
};

export const STEP_COMPLETION_MESSAGES: Record<number, string> = {
  4: "Persona drafts generated.",
  5: "Synthesis V1 completed.",
  6: "Fact-check V3 completed.",
  7: "Human review V5 approved.",
  8: "Critiques selected and confirmed.",
  9: "Critiques integrated into final V6.",
  10: "Style guide is ready.",
  11: "Style edit V2 completed.",
  12: "Export is ready.",
};

export interface Step8DraftPayload {
  critiques: CritiqueItem[];
  selectedIds: number[];
  selectedCritiques: string[];
}

export function isCritiqueItemArray(value: unknown): value is CritiqueItem[] {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const record = entry as Record<string, unknown>;
    return (
      typeof record.id === "number"
      && Number.isFinite(record.id)
      && typeof record.title === "string"
      && typeof record.detail === "string"
      && (record.isCustom === undefined || typeof record.isCustom === "boolean")
    );
  });
}

export function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

export function getStep8DraftFromMetadata(value: unknown): Step8DraftPayload | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const draft = record.devilsAdvocateDraft;
  if (!draft || typeof draft !== "object") return null;

  const draftRecord = draft as Record<string, unknown>;
  if (!isCritiqueItemArray(draftRecord.critiques)) return null;
  if (!isNumberArray(draftRecord.selectedIds)) return null;

  const selectedCritiquesRaw = draftRecord.selectedCritiques;
  const selectedCritiques =
    Array.isArray(selectedCritiquesRaw) && selectedCritiquesRaw.every((entry) => typeof entry === "string")
      ? selectedCritiquesRaw
      : [];

  return {
    critiques: draftRecord.critiques,
    selectedIds: draftRecord.selectedIds,
    selectedCritiques,
  };
}

export function getPrerequisiteMessage(
  step: number,
  stageMap: Record<number, Stage | undefined>,
): string | null {
  if (step <= 1) {
    return null;
  }

  const prerequisiteStep: Record<number, number> = {
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    7: 6,
    8: 7,
    9: 8,
    10: 5,
    11: 5,
    12: 11,
  };

  const requiredStep = prerequisiteStep[step];
  if (!requiredStep) {
    return null;
  }

  return stageMap[requiredStep]?.status === "completed"
    ? null
    : `Complete Step ${requiredStep} to run this step.`;
}

export function formatUsd(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export interface PipelineViewProps {
  project: Project;
  stages: Stage[];
  personas: Persona[];
  materials: SourceMaterial[];
  versions: Version[];
  latestStyleGuide: StyleGuide | null;
  initialStep: number;
  factCheckFindings: FactCheckFinding[] | null;
  factCheckApprovedFindingIds?: string[] | null;
  factCheckApprovedIssues?: string[] | null;
  factCheckAppliedCorrections?: number | null;
  coverImageUrl?: string;
  tokenUsageSummary: TokenUsageSummary;
  step11Critiques?: CritiqueItem[];
  step11SelectedIds?: number[];
}
