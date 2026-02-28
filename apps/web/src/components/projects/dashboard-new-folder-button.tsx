"use client";

import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitDashboardNewFolderRequest } from "@/lib/dashboard-folder-events";

export function DashboardNewFolderButton() {
  return (
    <Button size="sm" variant="outline" onClick={emitDashboardNewFolderRequest}>
      <FolderPlus className="mr-1 h-4 w-4" />
      New Folder
    </Button>
  );
}
