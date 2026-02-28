"use client";

import * as React from "react";
import Link from "next/link";
import { Grid2X2, List } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

interface DashboardExplorerProps {
  mode: "active" | "trash";
  projects: ProjectSummary[];
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  paused: "bg-amber-500/10 text-amber-600",
  completed: "bg-green-500/10 text-green-600",
  archived: "bg-muted text-muted-foreground",
};

export function DashboardExplorer({ projects }: DashboardExplorerProps) {
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
              <span className="text-xs text-muted-foreground">Step {project.currentStage}</span>
              <Badge
                variant="outline"
                className={`text-xs capitalize ${STATUS_COLORS[project.status] ?? ""}`}
              >
                {project.status}
              </Badge>
              <span className="text-xs text-muted-foreground/60">
                {new Date(project.createdAt).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {filtered.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`} className="block">
          <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-sm font-medium leading-tight">{project.title}</CardTitle>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs capitalize ${STATUS_COLORS[project.status] ?? ""}`}
                >
                  {project.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Step {project.currentStage}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {new Date(project.createdAt).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
