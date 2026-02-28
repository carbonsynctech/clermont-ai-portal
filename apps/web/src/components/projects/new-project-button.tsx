"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function NewProjectButton() {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function handleNew() {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/projects", { method: "POST" });
      if (!res.ok) return;
      const project = (await res.json()) as { id: string };
      router.push(`/projects/${project.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        onClick={() => void handleNew()}
        disabled={isCreating}
        className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/80"
      >
        <Plus />
        <span>{isCreating ? "Creating…" : "New Project"}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
