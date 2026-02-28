import type { SopStepNumber } from "./pipeline";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: JobStatus;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface StageRunPayload {
  projectId: string;
  stepNumber: SopStepNumber;
  userId: string;
}

export interface GenerateMasterPromptPayload extends StageRunPayload {
  stepNumber: 1;
}

export interface SuggestPersonasPayload extends StageRunPayload {
  stepNumber: 2;
}
