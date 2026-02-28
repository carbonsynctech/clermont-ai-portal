export const DASHBOARD_NEW_FOLDER_EVENT = "dashboard-new-folder-request";

export function emitDashboardNewFolderRequest() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_NEW_FOLDER_EVENT));
}
