"use client";

import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  GalleryVerticalEnd,
  Link,
  Loader2,
  MoreHorizontal,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import {
  PROJECT_SAVED_EVENT,
  PROJECT_COST_EVENT,
  PROJECT_TOKEN_USAGE_EVENT,
  type ProjectSavedEventDetail,
  type ProjectCostEventDetail,
  type ProjectTokenUsageDetail,
  emitSaveRequest,
} from "@/lib/project-save-events";
import {
  PROJECT_FAVORITES_UPDATED_EVENT,
  readFavoriteProjectIds,
  toggleProjectFavorite,
} from "@/lib/project-favorites";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Removed unused Popover/Sidebar imports

interface ProjectNavActionsProps {
  projectId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function ProjectNavActions({ projectId, createdAt, updatedAt }: ProjectNavActionsProps) {
    // Simulate folders for demo; replace with real folder state in production
    const [folders, setFolders] = React.useState([
      { id: "default", name: "Projects" },
      { id: "archive", name: "Archive" },
      { id: "team", name: "Team" },
    ]);
    const [moveOpen, setMoveOpen] = React.useState(false);
    function handleMoveTo(folderId: string) {
      // TODO: Replace with real move logic (API/local state)
      alert(`Project moved to folder: ${folders.find(f => f.id === folderId)?.name}`);
      setMoveOpen(false);
    }
    function handleUndo() {
      // TODO: Implement undo logic
      alert("Undo last action (not implemented)");
    }
  const [isSaving, setIsSaving] = React.useState(false);
  const [isFavorite, setIsFavorite] = React.useState(false);
  const [estimatedCost, setEstimatedCost] = React.useState<number | null>(null);
  const createdDate = React.useMemo(() => new Date(createdAt), [createdAt]);
  const updatedDate = React.useMemo(() => new Date(updatedAt), [updatedAt]);
  const initialSavedAt = React.useMemo(() => {
    return updatedDate.getTime() > createdDate.getTime() ? updatedDate : null;
  }, [createdDate, updatedDate]);
  const [savedAt, setSavedAt] = React.useState<Date | null>(initialSavedAt);
  const [hasMounted, setHasMounted] = React.useState(false);

  React.useEffect(() => {
    setHasMounted(true);
  }, []);

  React.useEffect(() => {
    setSavedAt(initialSavedAt);
  }, [initialSavedAt]);

  React.useEffect(() => {
    const syncFavoriteState = () => {
      const favoriteIds = readFavoriteProjectIds();
      setIsFavorite(favoriteIds.includes(projectId));
    };

    syncFavoriteState();
    window.addEventListener(PROJECT_FAVORITES_UPDATED_EVENT, syncFavoriteState);
    return () => window.removeEventListener(PROJECT_FAVORITES_UPDATED_EVENT, syncFavoriteState);
  }, [projectId]);

  React.useEffect(() => {
    const onProjectSaved = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectSavedEventDetail>;
      if (!customEvent.detail || customEvent.detail.projectId !== projectId) return;
      setSavedAt(new Date(customEvent.detail.savedAt));
      setIsSaving(false);
    };

    window.addEventListener(PROJECT_SAVED_EVENT, onProjectSaved);
    return () => window.removeEventListener(PROJECT_SAVED_EVENT, onProjectSaved);
  }, [projectId]);

  React.useEffect(() => {
    const onCostUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectCostEventDetail>;
      if (!customEvent.detail || customEvent.detail.projectId !== projectId) return;
      setEstimatedCost(customEvent.detail.estimatedCostUsd);
    };

    window.addEventListener(PROJECT_COST_EVENT, onCostUpdate);
    return () => window.removeEventListener(PROJECT_COST_EVENT, onCostUpdate);
  }, [projectId]);

  React.useEffect(() => {
    const onTokenUsageUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<ProjectTokenUsageDetail>;
      if (!customEvent.detail || customEvent.detail.projectId !== projectId) return;
      setEstimatedCost(customEvent.detail.estimatedCostUsd);
    };

    window.addEventListener(PROJECT_TOKEN_USAGE_EVENT, onTokenUsageUpdate);
    return () => window.removeEventListener(PROJECT_TOKEN_USAGE_EVENT, onTokenUsageUpdate);
  }, [projectId]);

  function handleSaveClick() {
    setIsSaving(true);
    setSavedAt(new Date()); // optimistic update
    emitSaveRequest({ projectId });
    // Reset spinner after 5s in case no listener responds
    setTimeout(() => setIsSaving(false), 5000);
  }

  function handleToggleFavorite() {
    setIsFavorite(toggleProjectFavorite(projectId));
  }

  const formattedCreatedDate = hasMounted
    ? createdDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const formattedSavedDate = hasMounted && savedAt
    ? savedAt.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  function formatCost(value: number): string {
    if (value < 0.01) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(2)}`;
  }

  const costText = estimatedCost !== null ? ` · Total cost: ${formatCost(estimatedCost)}` : "";

  // Removed unused actionGroups and isOpen/setIsOpen

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="text-muted-foreground hidden font-medium md:inline-block" suppressHydrationWarning>
        {hasMounted
          ? (formattedSavedDate ? `Saved ${formattedSavedDate}${costText}` : `Created ${formattedCreatedDate}${costText}`)
          : "\u00A0"}
      </div>
      <Button
        size="sm"
        className="h-7 bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 ml-2"
        onClick={handleSaveClick}
        disabled={isSaving}
      >
        {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
        Save
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={handleToggleFavorite}
        aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={isFavorite ? "fill-current text-yellow-500" : undefined} />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => window.location.href = `/projects/${projectId}/audit`}>
              <GalleryVerticalEnd className="mr-2 size-4" /> Version History
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleUndo}>
              <CornerUpLeft className="mr-2 size-4" /> Undo
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => navigator.clipboard.writeText(window.location.href)}>
              <Link className="mr-2 size-4" /> Copy Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              const res = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: document.title + " (Copy)",
                }),
              });
              const json = await res.json();
              if (json?.id) {
                window.location.href = `/projects/${json.id}`;
              }
            }}>
              <Copy className="mr-2 size-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMoveOpen(!moveOpen)}>
              <CornerUpRight className="mr-2 size-4" /> Move to
            </DropdownMenuItem>
            {moveOpen && (
              <div className="pl-8 pr-2 py-2">
                {folders.map(folder => (
                  <Button key={folder.id} variant="ghost" size="sm" className="w-full text-left mb-1" onClick={() => handleMoveTo(folder.id)}>
                    {folder.name}
                  </Button>
                ))}
              </div>
            )}
            <DropdownMenuItem
              onClick={async () => {
                // Move to Trash logic
                const res = await fetch(`/api/projects/${projectId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "trash" }),
                });
                if (res.ok) window.location.reload();
              }}
              className="text-red-600 focus:text-red-700 hover:text-red-700"
            >
              <Trash2 className="mr-2 size-4 text-red-600" /> Move to Trash
            </DropdownMenuItem>
          </DropdownMenuGroup>
          {/* Removed Import/Export buttons as requested */}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
