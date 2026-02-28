export const SOP_STEPS = {
  DEFINE_TASK: 1,
  SELECT_PERSONAS: 2,
  GATHER_SOURCES: 3,
  GENERATE_PERSONA_DRAFTS: 4,
  SYNTHESIZE_V1: 5,
  LOAD_STYLE_GUIDE: 6,
  EDIT_TO_STYLE_V2: 7,
  FACT_CHECK_V3: 8,
  FINAL_STYLE_PASS_V4: 9,
  HUMAN_REVIEW_V5: 10,
  DEVILS_ADVOCATE: 11,
  INTEGRATE_CRITIQUES: 12,
  EXPORT: 13,
} as const;

export type SopStepNumber = (typeof SOP_STEPS)[keyof typeof SOP_STEPS];

export const SOP_STEP_NAMES: Record<SopStepNumber, string> = {
  1: "Define Task & Prompt",
  2: "Select Expert Personas",
  3: "Gather Source Material",
  4: "Generate Persona Drafts",
  5: "Synthesize V1",
  6: "Load Style Guide",
  7: "Edit to Style V2",
  8: "Fact-Check V3",
  9: "Final Style Pass V4",
  10: "Human Review V5",
  11: "Devil's Advocate",
  12: "Integrate Critiques",
  13: "Export HTML→PDF",
};

export const HUMAN_CHECKPOINT_STEPS: SopStepNumber[] = [2, 3, 10, 11, 12];
export const AI_AGENT_STEPS: SopStepNumber[] = [1, 2, 4, 5, 7, 8, 9, 11, 12, 13];
