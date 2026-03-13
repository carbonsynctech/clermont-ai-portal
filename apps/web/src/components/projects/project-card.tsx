import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SOP_STEP_NAMES } from "@repo/core";
import type { Project } from "@repo/db";

const STATUS_COLORS: Record<Project["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  paused: "bg-amber-500/10 text-amber-600",
  completed: "bg-green-500/10 text-green-600",
  archived: "bg-muted text-muted-foreground",
};

export function ProjectCard({ project }: { project: Project }) {
  const stepName =
    SOP_STEP_NAMES[project.current_stage as keyof typeof SOP_STEP_NAMES] ??
    "Unknown";

  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-sm font-medium leading-tight">
              {project.title}
            </CardTitle>
            <Badge
              variant="outline"
              className={`shrink-0 text-xs capitalize ${STATUS_COLORS[project.status]}`}
            >
              {project.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            Step {project.current_stage}: {stepName}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {new Date(project.created_at).toLocaleDateString()}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
