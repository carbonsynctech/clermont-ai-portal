"use client"

import NextLink from "next/link"
import { MoreHorizontal, StarOff } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function NavFavorites({
  favorites,
  onRemoveFavorite,
}: {
  favorites: {
    id: string
    name: string
    url: string
  }[]
  onRemoveFavorite: (projectId: string) => void
}) {
  const { isMobile } = useSidebar()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Favorites</SidebarGroupLabel>
      <SidebarMenu>
        {favorites.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/70">
              <span>No favorites yet</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        {favorites.map((item) => (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild>
              <NextLink href={item.url} title={item.name}>
                <span>{item.name}</span>
              </NextLink>
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover>
                  <MoreHorizontal />
                  <span className="sr-only">More</span>
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align={isMobile ? "end" : "start"}
              >
                <DropdownMenuItem onClick={() => onRemoveFavorite(item.id)}>
                  <StarOff className="text-muted-foreground" />
                  <span>Remove from Favorites</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
