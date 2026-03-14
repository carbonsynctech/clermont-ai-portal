import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const name =
    (user?.user_metadata?.["full_name"] as string | undefined) ??
    user?.email?.split("@")[0] ??
    "User";
  const avatar = (user?.user_metadata?.["avatar_url"] as string | undefined) ?? "";

  return (
    <AppShell user={{ name, email: user?.email ?? "", avatar }}>
      {children}
    </AppShell>
  );
}
