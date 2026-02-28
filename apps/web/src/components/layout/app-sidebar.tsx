"use client";

import * as React from "react";
import {
  AudioWaveform,
  Calendar,
  Command,
  Home,
  MessageCircleQuestion,
  Search,
  Settings2,
  Sparkles,
  Blocks,
  Trash2,
} from "lucide-react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavFavorites } from "@/components/nav-favorites";
import { NewProjectButton } from "@/components/projects/new-project-button";
import { NavSecondary } from "@/components/nav-secondary";
import { NavUser } from "@/components/nav-user";
import { NavWorkspaces } from "@/components/nav-workspaces";
import { TeamSwitcher } from "@/components/team-switcher";
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
      name: "Content Portal",
      logo: Command,
      plan: "Enterprise",
    },
    {
      name: "Acme Corp.",
      logo: AudioWaveform,
      plan: "Startup",
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
      title: "Calendar",
      url: "#",
      icon: Calendar,
    },
    {
      title: "Settings",
      url: "/settings",
      icon: Settings2,
    },
    {
      title: "Templates",
      url: "#",
      icon: Blocks,
    },
    {
      title: "Trash",
      url: "#",
      icon: Trash2,
    },
    {
      title: "Help",
      url: "#",
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
          {data.navMain.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <Link href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
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
