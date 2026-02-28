"use client";

import * as React from "react";
import {
  Home,
  MessageCircleQuestion,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

function FleurDeLis(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" {...props}>
      {/* top petal */}
      <path d="M12 1c-.6 1.8-2.5 4-2.5 6.5 0 1.6 1 2.7 2.5 3 1.5-.3 2.5-1.4 2.5-3C14.5 5 12.6 2.8 12 1z" />
      {/* left petal */}
      <path d="M9.5 10.5C7 10.5 4.5 12 4.5 14.5c0 1.8 1.3 3 3 3 1.2 0 2.2-.6 3-1.3-.3-.8-.5-1.7-.5-2.7 0-.7.2-2 1-3.5-.5-.3-1-.5-1.5-.5z" />
      {/* right petal */}
      <path d="M14.5 10.5c-.5 0-1 .2-1.5.5.8 1.5 1 2.8 1 3.5 0 1-.2 1.9-.5 2.7.8.7 1.8 1.3 3 1.3 1.7 0 3-1.2 3-3 0-2.5-2.5-4-5-4z" />
      {/* collar band */}
      <path d="M9.5 18.5h5l-.5 1h-4z" />
      {/* base drop */}
      <path d="M10 19.5l-.5 3h5l-.5-3z" />
    </svg>
  );
}

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavFavorites } from "@/components/nav-favorites";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { NavWorkspaces } from "@/components/nav-workspaces";
import { AskAiDialog } from "@/components/layout/ask-ai-dialog";
import { ProjectSearchCommand } from "@/components/layout/project-search-command";
import { TeamSwitcher } from "@/components/team-switcher";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  PROJECT_FAVORITES_UPDATED_EVENT,
  readFavoriteProjectIds,
  setProjectFavorite,
} from "@/lib/project-favorites";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

const data = {
  teams: [
    {
      name: "AI Content Portal",
      logo: FleurDeLis,
      plan: "Enterprise",
    },
  ],
  navMain: [
    {
      title: "Search",
      url: "#",
      icon: Search,
    },
    {
      title: "Ask AI",
      url: "#",
      icon: Sparkles,
    },
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: Home,
    },
  ],
  navSecondary: [
    {
      title: "Trash",
      url: "/trash",
      icon: Trash2,
    },
    {
      title: "Help",
      url: "/help",
      icon: MessageCircleQuestion,
    },
  ],
};

interface SidebarProject {
  id: string;
  title: string;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}

export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const [projects, setProjects] = React.useState<SidebarProject[]>([]);
  const [favoriteProjectIds, setFavoriteProjectIds] = React.useState<string[]>([]);
  const [searchCommandOpen, setSearchCommandOpen] = React.useState(false);
  const [askAiDialogOpen, setAskAiDialogOpen] = React.useState(false);
  const [isMacPlatform, setIsMacPlatform] = React.useState(false);

  React.useEffect(() => {
    setIsMacPlatform(/Mac|iPhone|iPad|iPod/i.test(navigator.platform));
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      setSearchCommandOpen(true);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  React.useEffect(() => {
    setFavoriteProjectIds(readFavoriteProjectIds());

    const onFavoritesUpdated = () => {
      setFavoriteProjectIds(readFavoriteProjectIds());
    };

    window.addEventListener(PROJECT_FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    return () => {
      window.removeEventListener(PROJECT_FAVORITES_UPDATED_EVENT, onFavoritesUpdated);
    };
  }, []);

  React.useEffect(() => {
    let isCancelled = false;

    const loadProjects = async () => {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (!response.ok) return;

        const rows = (await response.json()) as Array<{ id: string; title: string }>;
        if (!isCancelled) {
          setProjects(rows);
        }
      } catch {
      }
    };

    void loadProjects();

    return () => {
      isCancelled = true;
    };
  }, [pathname]);

  const favoriteIdSet = React.useMemo(
    () => new Set(favoriteProjectIds),
    [favoriteProjectIds]
  );

  const favoriteProjects = React.useMemo(
    () =>
      projects
        .filter((project) => favoriteIdSet.has(project.id))
        .map((project) => ({
          id: project.id,
          name: project.title,
          url: `/projects/${project.id}`,
        })),
    [favoriteIdSet, projects]
  );

  const workspaceProjects = React.useMemo(
    () =>
      projects
        .filter((project) => !favoriteIdSet.has(project.id))
        .map((project) => ({
          id: project.id,
          name: project.title,
          url: `/projects/${project.id}`,
        })),
    [favoriteIdSet, projects]
  );

  const workspaces = React.useMemo(
    () => [
      {
        name: "Projects",
        pages: workspaceProjects,
      },
    ],
    [workspaceProjects]
  );

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
        <SidebarMenu>
          <NewProjectButton />
          {data.navMain.map((item) =>
            item.title === "Search" ? (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  type="button"
                  onClick={() => setSearchCommandOpen(true)}
                  className="justify-between [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <item.icon />
                    <span>{item.title}</span>
                  </div>
                  <KbdGroup className="group-data-[collapsible=icon]:hidden">
                    {isMacPlatform ? (
                      <>
                        <Kbd>⌘</Kbd>
                        <Kbd>K</Kbd>
                      </>
                    ) : (
                      <>
                        <Kbd>Ctrl</Kbd>
                        <Kbd>K</Kbd>
                      </>
                    )}
                  </KbdGroup>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : item.title === "Ask AI" ? (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton type="button" onClick={() => setAskAiDialogOpen(true)}>
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <Link href={item.url}>
                    <item.icon />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          )}
        </SidebarMenu>
        <ProjectSearchCommand
          open={searchCommandOpen}
          onOpenChange={setSearchCommandOpen}
          projects={projects}
        />
        <AskAiDialog open={askAiDialogOpen} onOpenChange={setAskAiDialogOpen} />
      </SidebarHeader>
      <SidebarContent>
        <NavFavorites
          favorites={favoriteProjects}
          onRemoveFavorite={(projectId) => {
            setProjectFavorite(projectId, false);
          }}
        />
        <NavWorkspaces workspaces={workspaces} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
