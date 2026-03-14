"use client";

import * as React from "react";
import { Grid2X2, List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  DASHBOARD_SEARCH_PROJECTS_EVENT,
  DASHBOARD_VIEW_MODE_EVENT,
  type DashboardViewMode,
} from "@/lib/dashboard-folder-events";

const SEARCH_EVENT_NAME = DASHBOARD_SEARCH_PROJECTS_EVENT ?? "dashboard-search-projects";
const VIEW_MODE_EVENT_NAME = DASHBOARD_VIEW_MODE_EVENT ?? "dashboard-view-mode";

export function DashboardExplorerControls() {
  const [query, setQuery] = React.useState("");
  const [viewMode, setViewMode] = React.useState<DashboardViewMode>("grid");

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<string>(SEARCH_EVENT_NAME, { detail: query }));
  }, [query]);

  function setMode(mode: DashboardViewMode) {
    setViewMode(mode);
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<DashboardViewMode>(VIEW_MODE_EVENT_NAME, { detail: mode }));
  }

  return (
    <>
      <div className="relative w-64">
        <Search className="text-muted-foreground absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search projects"
          className="h-9 pl-8 text-sm"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-9 w-9 p-0 text-sm">
            {viewMode === "grid" ? <Grid2X2 className="h-4 w-4" /> : <List className="h-4 w-4" />}
            <span className="sr-only">Change view</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setMode("grid")}>
            <Grid2X2 className="mr-2 h-4 w-4" />
            Grid View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode("list")}>
            <List className="mr-2 h-4 w-4" />
            List View
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
