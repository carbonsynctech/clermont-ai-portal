import NextLink from "next/link"
import { ChevronRight } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"

export function NavWorkspaces({
  workspaces,
}: {
  workspaces: {
    name: string
    pages: {
      id: string
      name: string
      url: string
    }[]
  }[]
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {workspaces.map((workspace) => (
            <Collapsible key={workspace.name} defaultOpen>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <span>
                    <span>{workspace.name}</span>
                  </span>
                </SidebarMenuButton>
                <CollapsibleTrigger asChild>
                  <SidebarMenuAction className="data-[state=open]:rotate-90">
                    <ChevronRight />
                  </SidebarMenuAction>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {workspace.pages.length === 0 ? (
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton className="text-sidebar-foreground/70" asChild>
                          <span>No projects yet</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ) : null}
                    {workspace.pages.map((page) => (
                      <SidebarMenuSubItem key={page.id}>
                        <SidebarMenuSubButton asChild>
                          <NextLink href={page.url}>
                            <span>{page.name}</span>
                          </NextLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
