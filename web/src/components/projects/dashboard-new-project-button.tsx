"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateProject } from "@/hooks/use-create-project";

interface DashboardNewProjectButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function DashboardNewProjectButton({
  className,
  size = "sm",
}: DashboardNewProjectButtonProps) {
  const { isCreating, createProject } = useCreateProject();

  return (
    <Button
      type="button"
      size={size}
      onClick={() => void createProject()}
      disabled={isCreating}
      className={className}
    >
      <Plus className="h-4 w-4" />
      {isCreating ? "Creating…" : "New Project"}
    </Button>
  );
}
