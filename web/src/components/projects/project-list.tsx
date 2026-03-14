import { createClient } from "@/lib/supabase/server";
import { DashboardExplorer } from "./dashboard-explorer";

type ProjectListStatus = "active" | "trashed" | "all";

type ProjectListMode = "active" | "trash";

interface ProjectListProps {
  userId: string;
  status?: ProjectListStatus;
  mode?: ProjectListMode;
}

export async function ProjectList({
  userId,
  status = "active",
  mode = "active",
}: ProjectListProps) {
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select()
    .eq("owner_id", userId);

  if (status === "trashed") {
    query = query.not("deleted_at", "is", null);
  } else if (status === "active") {
    query = query.is("deleted_at", null);
  }
  // status === "all" needs no extra filter

  const { data: rows } = await query.order("created_at", { ascending: false });

  const allRows = rows ?? [];

  if (allRows.length === 0 && mode === "trash") {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">Trash is empty.</p>
        <p className="text-muted-foreground text-xs mt-1">
          Deleted projects are kept for 30 days before permanent removal.
        </p>
      </div>
    );
  }

  return (
    <DashboardExplorer
      mode={mode}
      projects={allRows.map((project) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        currentStage: project.current_stage,
        createdAt: project.created_at,
        updatedAt: project.updated_at,
        deletedAt: project.deleted_at ?? undefined,
      }))}
    />
  );
}
