export const DASHBOARD_NEW_FOLDER_EVENT = "dashboard-new-folder-request";
export const DASHBOARD_SEARCH_PROJECTS_EVENT = "dashboard-search-projects";
export const DASHBOARD_VIEW_MODE_EVENT = "dashboard-view-mode";
export const DASHBOARD_BREADCRUMB_FOLDER_EVENT = "dashboard-breadcrumb-folder";
export const DASHBOARD_NAV_TO_ROOT_EVENT = "dashboard-nav-to-root";

export type DashboardViewMode = "grid" | "list";

export function emitDashboardNewFolderRequest() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_NEW_FOLDER_EVENT));
}

export function emitDashboardSearchProjects(query: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(DASHBOARD_SEARCH_PROJECTS_EVENT, { detail: query }));
}

export function emitDashboardViewMode(mode: DashboardViewMode) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DashboardViewMode>(DASHBOARD_VIEW_MODE_EVENT, { detail: mode }));
}

export function emitDashboardBreadcrumbFolder(folderName: string | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string | null>(DASHBOARD_BREADCRUMB_FOLDER_EVENT, { detail: folderName }));
}

export function emitDashboardNavToRoot() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_NAV_TO_ROOT_EVENT));
}
