import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectList } from "@/components/projects/project-list";
import { DashboardExplorerControls } from "@/components/projects/dashboard-explorer-controls";

export default async function TrashPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Trash</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Deleted projects are kept for 30 days before permanent deletion.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardExplorerControls />
        </div>
      </div>
      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading trashed projects…</div>}>
        <ProjectList userId={user.id} status="trashed" mode="trash" />
      </Suspense>
    </div>
  );
}
