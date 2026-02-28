import { db } from "@repo/db";
import { projects } from "@repo/db";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
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
  const whereClause =
    status === "trashed"
      ? and(eq(projects.ownerId, userId), isNotNull(projects.deletedAt))
      : status === "all"
      ? eq(projects.ownerId, userId)
      : and(eq(projects.ownerId, userId), isNull(projects.deletedAt));

  const rows = await db.query.projects.findMany({
    where: whereClause,
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  if (rows.length === 0 && mode === "trash") {
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
      projects={rows.map((project) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        currentStage: project.currentStage,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        deletedAt: project.deletedAt?.toISOString(),
      }))}
    />
  );
}
