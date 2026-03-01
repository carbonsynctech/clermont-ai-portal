"use client";

import { Plus } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useCreateProject } from "@/hooks/use-create-project";

export function NewProjectButton() {
  const { isCreating, createProject } = useCreateProject();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => void createProject()}
        disabled={isCreating}
        className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/80"
      >
        <Plus />
        <span>{isCreating ? "Creating…" : "New Project"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
