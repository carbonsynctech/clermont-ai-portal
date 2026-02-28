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
  type ProjectSavedEventDetail,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// Removed unused Popover/Sidebar imports

interface ProjectNavActionsProps {
  projectId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function ProjectNavActions({ projectId, createdAt, updatedAt }: ProjectNavActionsProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [isFavorite, setIsFavorite] = React.useState(false);
  const createdDate = React.useMemo(() => new Date(createdAt), [createdAt]);
  const updatedDate = React.useMemo(() => new Date(updatedAt), [updatedAt]);
  const initialSavedAt = React.useMemo(() => {
    return updatedDate.getTime() > createdDate.getTime() ? updatedDate : null;
  }, [createdDate, updatedDate]);
  const [savedAt, setSavedAt] = React.useState<Date | null>(initialSavedAt);

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

  const formattedCreatedDate = createdDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const formattedSavedDate = savedAt
    ? savedAt.toLocaleString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  // Removed unused actionGroups and isOpen/setIsOpen

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="text-muted-foreground hidden font-medium md:inline-block">
        {formattedSavedDate ? `Saved ${formattedSavedDate}` : `Created ${formattedCreatedDate}`}
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
            <DropdownMenuItem onClick={() => {/* TODO: implement undo logic */}}>
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
            <DropdownMenuItem onClick={() => {/* TODO: implement move to logic */}}>
              <CornerUpRight className="mr-2 size-4" /> Move to
            </DropdownMenuItem>
            <DropdownMenuItem onClick={async () => {
              // Move to Trash logic
              const res = await fetch(`/api/projects/${projectId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "trash" }),
              });
              if (res.ok) window.location.reload();
            }} className="text-destructive">
              <Trash2 className="mr-2 size-4" /> Move to Trash
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => {/* TODO: implement import logic */}}>
              <ArrowUp className="mr-2 size-4" /> Import
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {/* TODO: implement export logic */}}>
              <ArrowDown className="mr-2 size-4" /> Export
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
