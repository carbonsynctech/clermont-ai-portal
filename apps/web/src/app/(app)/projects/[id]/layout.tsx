import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

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
        <ProjectNavActions projectId={id} createdAt={project.created_at} updatedAt={project.updated_at} />
      }
      user={{ name: userName, email: user.email ?? "", avatar: userAvatar }}
    >
      {children}
    </AppShell>
  );
}
