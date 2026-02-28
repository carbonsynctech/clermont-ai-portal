const FAVORITE_PROJECTS_KEY = "favorite-project-ids";

export const PROJECT_FAVORITES_UPDATED_EVENT = "project-favorites-updated";

function sanitizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function readFavoriteProjectIds(): string[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(FAVORITE_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return sanitizeIds(parsed);
  } catch {
    return [];
  }
}

function writeFavoriteProjectIds(ids: string[]) {
  if (typeof window === "undefined") return;

  const uniqueIds = Array.from(new Set(ids));
  window.localStorage.setItem(FAVORITE_PROJECTS_KEY, JSON.stringify(uniqueIds));
  window.dispatchEvent(new CustomEvent(PROJECT_FAVORITES_UPDATED_EVENT));
}

export function setProjectFavorite(projectId: string, isFavorite: boolean) {
  const existingIds = readFavoriteProjectIds();

  if (isFavorite) {
    writeFavoriteProjectIds([...existingIds, projectId]);
    return true;
  }

  writeFavoriteProjectIds(existingIds.filter((id) => id !== projectId));
  return false;
}

export function toggleProjectFavorite(projectId: string) {
  const existingIds = readFavoriteProjectIds();
  const isFavorite = existingIds.includes(projectId);
  return setProjectFavorite(projectId, !isFavorite);
}
