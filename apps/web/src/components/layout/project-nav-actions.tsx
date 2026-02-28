"use client";

import * as React from "react";
import {
  ArrowDown,
  Bell,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  GalleryVerticalEnd,
  LineChart,
  Link,
  Loader2,
  MoreHorizontal,
  Save,
  Settings2,
  Star,
  Trash,
  Trash2,
  ClipboardList,
} from "lucide-react";
import NextLink from "next/link";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface ProjectNavActionsProps {
  projectId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function ProjectNavActions({ projectId, createdAt, updatedAt }: ProjectNavActionsProps) {
  const [isOpen, setIsOpen] = React.useState(false);
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

  const actionGroups = [
    [
      { label: "View Audit Log", icon: ClipboardList, href: `/projects/${projectId}/audit` },
      { label: "Customize Page", icon: Settings2 },
    ],
    [
      { label: "Copy Link", icon: Link },
      { label: "Duplicate", icon: Copy },
      { label: "Move to", icon: CornerUpRight },
      { label: "Move to Trash", icon: Trash2 },
    ],
    [
      { label: "Undo", icon: CornerUpLeft },
      { label: "View analytics", icon: LineChart },
      { label: "Version History", icon: GalleryVerticalEnd },
      { label: "Show deleted pages", icon: Trash },
      { label: "Notifications", icon: Bell },
    ],
    [
      { label: "Export", icon: ArrowDown },
    ],
  ];

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
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="data-[state=open]:bg-accent h-7 w-7"
          >
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 overflow-hidden rounded-lg p-0" align="end">
          <Sidebar collapsible="none" className="bg-transparent">
            <SidebarContent>
              {actionGroups.map((group, i) => (
                <SidebarGroup key={i} className="border-b last:border-none">
                  <SidebarGroupContent className="gap-0">
                    <SidebarMenu>
                      {group.map((item) => (
                        <SidebarMenuItem key={item.label}>
                          {"href" in item && item.href ? (
                            <SidebarMenuButton asChild>
                              <NextLink href={item.href}>
                                <item.icon />
                                <span>{item.label}</span>
                              </NextLink>
                            </SidebarMenuButton>
                          ) : (
                            <SidebarMenuButton>
                              <item.icon />
                              <span>{item.label}</span>
                            </SidebarMenuButton>
                          )}
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </Sidebar>
        </PopoverContent>
      </Popover>
    </div>
  );
}
