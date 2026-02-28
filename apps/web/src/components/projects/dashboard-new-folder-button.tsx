"use client";

import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emitDashboardNewFolderRequest } from "@/lib/dashboard-folder-events";
import { cn } from "@/lib/utils";

export function DashboardNewFolderButton({ className }: { className?: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn("h-9 px-3 text-sm", className)}
      onClick={emitDashboardNewFolderRequest}
    >
      <FolderPlus className="mr-1 h-4 w-4" />
      New Folder
    </Button>
  );
}
