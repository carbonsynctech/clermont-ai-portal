export const PROJECT_SAVED_EVENT = "project:saved";
export const PROJECT_SAVE_REQUEST_EVENT = "project:save_request";
export const PROJECT_COST_EVENT = "project:cost_update";
export const PROJECT_TOKEN_USAGE_EVENT = "project:token_usage";

export interface ProjectSavedEventDetail {
  projectId: string;
  savedAt: string;
}

export interface ProjectSaveRequestDetail {
  projectId: string;
}

export interface ProjectCostEventDetail {
  projectId: string;
  estimatedCostUsd: number;
}

export interface ProjectTokenUsageDetail {
  projectId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

export function emitProjectSaved(detail: ProjectSavedEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProjectSavedEventDetail>(PROJECT_SAVED_EVENT, { detail }));
}

export function emitSaveRequest(detail: ProjectSaveRequestDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProjectSaveRequestDetail>(PROJECT_SAVE_REQUEST_EVENT, { detail }));
}

export function emitProjectCost(detail: ProjectCostEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProjectCostEventDetail>(PROJECT_COST_EVENT, { detail }));
}

export function emitTokenUsage(detail: ProjectTokenUsageDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProjectTokenUsageDetail>(PROJECT_TOKEN_USAGE_EVENT, { detail }));
}
