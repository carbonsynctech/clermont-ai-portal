import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectList } from "@/components/projects/project-list";
import { DashboardNewFolderButton } from "@/components/projects/dashboard-new-folder-button";
import { DashboardExplorerControls } from "@/components/projects/dashboard-explorer-controls";
import { DashboardNewProjectButton } from "@/components/projects/dashboard-new-project-button";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your content projects.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardExplorerControls />
          <DashboardNewFolderButton />
          <DashboardNewProjectButton className="h-9 px-3 text-sm" size="sm" />
        </div>
      </div>
      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading projects…</div>}>
        <ProjectList userId={user.id} />
      </Suspense>
    </div>
  );
}
