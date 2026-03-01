"use client";

import * as React from "react";
import Link from "next/link";
import { FolderOpen, Grid2X2, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { DashboardNewProjectButton } from "@/components/projects/dashboard-new-project-button";
import {
  DASHBOARD_SEARCH_PROJECTS_EVENT,
  DASHBOARD_VIEW_MODE_EVENT,
  type DashboardViewMode,
} from "@/lib/dashboard-folder-events";

interface ProjectSummary {
  id: string;
  title: string;
  status: string;
  currentStage: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

interface DashboardExplorerProps {
  mode: "active" | "trash";
  projects: ProjectSummary[];
}

type BadgeVariant = "secondary" | "outline";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: "secondary",
  active: "outline",
  paused: "outline",
  completed: "outline",
  archived: "secondary",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-primary/10 text-primary",
  paused: "bg-amber-500/10 text-amber-600",
  completed: "bg-green-500/10 text-green-600",
};

export function DashboardExplorer({ projects, mode }: DashboardExplorerProps) {
  const [query, setQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<DashboardViewMode>("grid");

  React.useEffect(() => {
    function handleSearch(event: Event) {
      const custom = event as CustomEvent<string>;
      setQuery(custom.detail ?? "");
    }
    function handleViewMode(event: Event) {
      const custom = event as CustomEvent<DashboardViewMode>;
      if (custom.detail) setViewMode(custom.detail);
    }

    window.addEventListener(DASHBOARD_SEARCH_PROJECTS_EVENT, handleSearch);
    window.addEventListener(DASHBOARD_VIEW_MODE_EVENT, handleViewMode);
    return () => {
      window.removeEventListener(DASHBOARD_SEARCH_PROJECTS_EVENT, handleSearch);
      window.removeEventListener(DASHBOARD_VIEW_MODE_EVENT, handleViewMode);
    };
  }, []);

  const filtered = React.useMemo(() => {
    if (!query.trim()) return projects;
    const lower = query.toLowerCase();
    return projects.filter((p) => p.title.toLowerCase().includes(lower));
  }, [projects, query]);

  function getDateInfo(project: ProjectSummary): { label: string; date: Date } {
    const updated = new Date(project.updatedAt).getTime();
    const created = new Date(project.createdAt).getTime();
    const isEdited = updated > created + 1000; // >1s diff = genuinely edited
    return {
      label: isEdited ? "Edited" : "Created",
      date: isEdited ? new Date(project.updatedAt) : new Date(project.createdAt),
    };
  }

  function formatDate(date: Date): string {
    const now = new Date();
    const sameYear = date.getFullYear() === now.getFullYear();
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }

  function getDaysLeft(deletedAt?: string): number | null {
    if (!deletedAt) return null;

    const deletedMs = new Date(deletedAt).getTime();
    if (Number.isNaN(deletedMs)) return null;

    const expiresMs = deletedMs + 30 * 24 * 60 * 60 * 1000;
    const remainingMs = expiresMs - Date.now();
    return Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle>No projects yet</EmptyTitle>
            <EmptyDescription>
              Create your first project to start generating AI-powered investment memos.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <DashboardNewProjectButton size="sm" />
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">No projects match your search.</p>
      </div>
    );
  }

  if (viewMode === "list") {
    return (
      <div className="rounded-lg border divide-y">
        {filtered.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3">
              <List className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{project.title}</span>
            </div>
            <div className="flex items-center gap-3">
              {mode === "trash" ? (
                <Badge variant="outline" className="text-xs">
                  {(() => {
                    const daysLeft = getDaysLeft(project.deletedAt);
                    if (daysLeft == null) return "30 days left";
                    return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
                  })()}
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">Step {project.currentStage}</span>
              <Badge
                variant={STATUS_VARIANTS[project.status] ?? "outline"}
                className={`text-xs capitalize ${STATUS_COLORS[project.status] ?? ""}`.trim()}
              >
                {project.status}
              </Badge>
              {(() => {
                const { label, date } = getDateInfo(project);
                return (
                  <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
                    {label} {formatDate(date)}
                  </span>
                );
              })()}
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`} className="block h-full">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-medium leading-tight">{project.title}</CardTitle>
                <div className="flex items-center gap-2 shrink-0">
                  {mode === "trash" ? (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {(() => {
                        const daysLeft = getDaysLeft(project.deletedAt);
                        if (daysLeft == null) return "30 days left";
                        return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
                      })()}
                    </Badge>
                  ) : null}
                  <Badge
                    variant={STATUS_VARIANTS[project.status] ?? "outline"}
                    className={`shrink-0 text-xs capitalize ${STATUS_COLORS[project.status] ?? ""}`.trim()}
                  >
                    {project.status}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Step {project.currentStage}</span>
                {(() => {
                  const { label, date } = getDateInfo(project);
                  return (
                    <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
                      {label} {formatDate(date)}
                    </span>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
