"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

interface SearchProjectItem {
  id: string;
  title: string;
}

interface ProjectSearchCommandProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: SearchProjectItem[];
}

export function ProjectSearchCommand({
  open,
  onOpenChange,
  projects,
}: ProjectSearchCommandProps) {
  const router = useRouter();

  const sortedProjects = React.useMemo(
    () => [...projects].sort((a, b) => a.title.localeCompare(b.title)),
    [projects]
  );

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Search projects by name..." />
        <CommandList>
          <CommandEmpty>No projects found.</CommandEmpty>
          <CommandGroup heading="Projects">
            {sortedProjects.map((project) => (
              <CommandItem
                key={project.id}
                value={project.title}
                onSelect={() => {
                  onOpenChange(false);
                  router.push(`/projects/${project.id}`);
                }}
              >
                <FileText />
                <span>{project.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
