"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { NavActions } from "@/components/nav-actions";
import {
  DASHBOARD_BREADCRUMB_FOLDER_EVENT,
  emitDashboardNavToRoot,
} from "@/lib/dashboard-folder-events";

interface HeaderProps {
  title?: string;
  actionsSlot?: React.ReactNode;
}

export function Header({ title, actionsSlot }: HeaderProps) {
  const pathname = usePathname();
  const isDashboardRoute = pathname === "/dashboard";
  const [dashboardFolderName, setDashboardFolderName] = React.useState<string | null>(null);

  const breadcrumbSegments = React.useMemo(() => {
    if (isDashboardRoute) return [];

    const segments = pathname.split("/").filter(Boolean);

    return segments.map((segment, index) => {
      const previousSegment = index > 0 ? segments[index - 1] : null;
      const isLikelyProjectId =
        previousSegment === "projects" && /^[a-z0-9-]{8,}$/i.test(segment);

      const label = isLikelyProjectId
        ? (title ?? "Project")
        : decodeURIComponent(segment)
            .replace(/-/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase());

      return {
        href: `/${segments.slice(0, index + 1).join("/")}`,
        label,
        isLast: index === segments.length - 1,
      };
    });
  }, [isDashboardRoute, pathname, title]);

  React.useEffect(() => {
    const onFolderBreadcrumb = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      setDashboardFolderName(customEvent.detail ?? null);
    };

    window.addEventListener(DASHBOARD_BREADCRUMB_FOLDER_EVENT, onFolderBreadcrumb);
    return () => window.removeEventListener(DASHBOARD_BREADCRUMB_FOLDER_EVENT, onFolderBreadcrumb);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-1 items-center gap-2 px-3">
        <SidebarTrigger />
        <Separator
          orientation="vertical"
          className="mr-2 data-[orientation=vertical]:h-4"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {isDashboardRoute ? (
              <>
                <BreadcrumbItem>
                  {dashboardFolderName ? (
                    <BreadcrumbLink
                      asChild
                      className="cursor-pointer"
                    >
                      <button type="button" onClick={emitDashboardNavToRoot}>
                        Dashboard
                      </button>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage className="line-clamp-1">Dashboard</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {dashboardFolderName ? (
                  <>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="line-clamp-1">{dashboardFolderName}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {breadcrumbSegments.length > 0 ? (
                  breadcrumbSegments.map((segment) => (
                    <React.Fragment key={segment.href}>
                      <BreadcrumbItem>
                        {segment.isLast ? (
                          <BreadcrumbPage className="line-clamp-1">{segment.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link href={segment.href}>{segment.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!segment.isLast ? <BreadcrumbSeparator /> : null}
                    </React.Fragment>
                  ))
                ) : (
                  <BreadcrumbItem>
                    <BreadcrumbPage className="line-clamp-1">
                      {title ?? "Content Portal"}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="ml-auto flex items-center gap-2 px-3">
        {actionsSlot ?? <NavActions />}
      </div>
    </header>
  );
}
