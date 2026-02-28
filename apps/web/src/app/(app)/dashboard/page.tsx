import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ProjectList } from "@/components/projects/project-list";
import { Plus } from "lucide-react";

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
        <Button asChild size="sm">
          <Link href="/projects/new">
            <Plus className="h-4 w-4 mr-1" />
            New Project
          </Link>
        </Button>
      </div>
      <Suspense fallback={<div className="text-muted-foreground text-sm">Loading projects…</div>}>
        <ProjectList userId={user.id} />
      </Suspense>
    </div>
  );
}
