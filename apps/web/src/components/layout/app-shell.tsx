"use client";

import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  defaultOpen?: boolean;
  headerTitle?: string;
  headerActions?: React.ReactNode;
  mainClassName?: string;
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}

export function AppShell({
  children,
  defaultOpen = true,
  headerTitle,
  headerActions,
  mainClassName,
  user,
}: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} variant="floating" />
      <SidebarInset>
        <Header title={headerTitle} actionsSlot={headerActions} />
        <main className={cn("flex flex-1 flex-col gap-4 p-4", mainClassName)}>{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
