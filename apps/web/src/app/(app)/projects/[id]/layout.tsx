import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectNavActions } from "@/components/layout/project-nav-actions";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}

export default async function ProjectLayout({ children, params }: LayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { id } = await params;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.ownerId, user.id)),
  });

  if (!project) notFound();

  const userName =
    (user.user_metadata?.["full_name"] as string | undefined) ??
    user.email?.split("@")[0] ??
    "User";
  const userAvatar = (user.user_metadata?.["avatar_url"] as string | undefined) ?? "";

  return (
    <AppShell
      defaultOpen={false}
      headerTitle={project.title}
      mainClassName="bg-[#FAFAFA]"
      headerActions={
        <ProjectNavActions projectId={id} createdAt={project.createdAt} updatedAt={project.updatedAt} />
      }
      user={{ name: userName, email: user.email ?? "", avatar: userAvatar }}
    >
      {children}
    </AppShell>
  );
}
