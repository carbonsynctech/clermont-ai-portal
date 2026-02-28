import { db } from "@repo/db";
import { projects } from "@repo/db";
import { eq } from "drizzle-orm";
import { ProjectCard } from "./project-card";
import { DashboardProjectStructure } from "./dashboard-project-structure";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export async function ProjectList({ userId }: { userId: string }) {
  const rows = await db.query.projects.findMany({
    where: eq(projects.ownerId, userId),
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <p className="text-muted-foreground text-sm">No projects yet.</p>
        <p className="text-muted-foreground text-xs mt-1 mb-4">
          Create your first project to get started.
        </p>
        <Button asChild size="sm">
          <Link href="/projects/new">
            <Plus className="h-4 w-4 mr-1" />
            New Project
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DashboardProjectStructure
        projects={rows.map((project) => ({
          id: project.id,
          title: project.title,
        }))}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
