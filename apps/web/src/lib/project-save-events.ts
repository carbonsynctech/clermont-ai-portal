export const PROJECT_SAVED_EVENT = "project:saved";
export const PROJECT_SAVE_REQUEST_EVENT = "project:save_request";

export interface ProjectSavedEventDetail {
  projectId: string;
  savedAt: string;
}

export interface ProjectSaveRequestDetail {
  projectId: string;
}

export function emitProjectSaved(detail: ProjectSavedEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProjectSavedEventDetail>(PROJECT_SAVED_EVENT, { detail }));
}

export function emitSaveRequest(detail: ProjectSaveRequestDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProjectSaveRequestDetail>(PROJECT_SAVE_REQUEST_EVENT, { detail }));
}
