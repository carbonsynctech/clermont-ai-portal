export const SOP_STEPS = {
  DEFINE_TASK: 1,
  SELECT_PERSONAS: 2,
  GATHER_SOURCES: 3,
  GENERATE_PERSONA_DRAFTS: 4,
  SYNTHESIZE_V1: 5,
  FACT_CHECK_V3: 6,
  HUMAN_REVIEW_V5: 7,
  DEVILS_ADVOCATE: 8,
  INTEGRATE_CRITIQUES: 9,
  LOAD_STYLE_GUIDE: 10,
  EDIT_TO_STYLE_V2: 11,
  EXPORT: 12,
} as const;

export type SopStepNumber = (typeof SOP_STEPS)[keyof typeof SOP_STEPS];

export const SOP_STEP_NAMES: Record<SopStepNumber, string> = {
  1: "Define Task & Prompt",
  2: "Select Expert Personas",
  3: "Gather Source Material",
  4: "Generate Persona Drafts",
  5: "Synthesize V1",
  6: "Fact-Check V3",
  7: "Human Review V5",
  8: "Devil's Advocate",
  9: "Integrate Critiques",
  10: "Load Style Guide",
  11: "Edit to Style V2",
  12: "Export HTML→PDF",
};

export const HUMAN_CHECKPOINT_STEPS: SopStepNumber[] = [2, 3, 7, 8, 9];
export const AI_AGENT_STEPS: SopStepNumber[] = [1, 2, 4, 5, 6, 8, 9, 11, 12];
