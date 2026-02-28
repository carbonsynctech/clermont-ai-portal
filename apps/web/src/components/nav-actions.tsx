"use client"

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  CornerUpLeft,
  CornerUpRight,
  GalleryVerticalEnd,
  Link,
  MoreHorizontal,
  Star,
  Trash2,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const data = [
  [],
  [
    { label: "Copy Link", icon: Link, onClick: () => {
      navigator.clipboard.writeText(window.location.href);
    } },
    { label: "Duplicate", icon: Copy, onClick: async () => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: document.title + " (Copy)",
          // TODO: pass briefData if available
        }),
      });
      const json = await res.json();
      if (json?.id) {
        window.location.href = `/projects/${json.id}`;
      }
    } },
    { label: "Move to", icon: CornerUpRight },
    { label: "Move to Trash", icon: Trash2 },
  ],
  [
    { label: "Undo", icon: CornerUpLeft },
    { label: "Version History", icon: GalleryVerticalEnd },
  ],
  [
    { label: "Import", icon: ArrowUp },
    { label: "Export", icon: ArrowDown },
  ],
]

export function NavActions() {
  const [isOpen, setIsOpen] = React.useState(false)

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="text-muted-foreground hidden font-medium md:inline-block">
        Edit Oct 08
      </div>
      <Button variant="ghost" size="icon" className="h-7 w-7">
        <Star />
      </Button>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="data-[state=open]:bg-accent h-7 w-7"
          >
            <MoreHorizontal />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 overflow-hidden rounded-lg p-0"
          align="end"
        >
          <Sidebar collapsible="none" className="bg-transparent">
            <SidebarContent>
              {data.map((group, index) => (
                <SidebarGroup key={index} className="border-b last:border-none">
                  <SidebarGroupContent className="gap-0">
                    <SidebarMenu>
                      {group.map((item, index) => (
                        <SidebarMenuItem key={index}>
                          <SidebarMenuButton onClick={item.onClick}>
                            <item.icon /> <span>{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              ))}
            </SidebarContent>
          </Sidebar>
        </PopoverContent>
      </Popover>
    </div>
  )
}
