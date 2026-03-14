"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, FolderPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ProjectItem {
  id: string;
  title: string;
}

interface FolderItem {
  id: string;
  name: string;
  projectIds: string[];
}

const STORAGE_KEY = "dashboard-project-folders-v1";
const DEFAULT_FOLDER_ID = "default";

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeFolders(raw: unknown): FolderItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((folder) => {
      if (
        !folder ||
        typeof folder !== "object" ||
        typeof (folder as { id?: unknown }).id !== "string" ||
        typeof (folder as { name?: unknown }).name !== "string" ||
        !Array.isArray((folder as { projectIds?: unknown }).projectIds)
      ) {
        return null;
      }

      return {
        id: (folder as { id: string }).id,
        name: (folder as { name: string }).name,
        projectIds: (folder as { projectIds: unknown[] }).projectIds.filter(
          (value): value is string => typeof value === "string"
        ),
      } satisfies FolderItem;
    })
    .filter((folder): folder is FolderItem => folder !== null);
}

function buildDefaultFolder(projects: ProjectItem[]): FolderItem {
  return {
    id: DEFAULT_FOLDER_ID,
    name: "Projects",
    projectIds: projects.map((project) => project.id),
  };
}

function reconcileFolders(
  candidateFolders: FolderItem[],
  projects: ProjectItem[]
): FolderItem[] {
  const projectIdSet = new Set(projects.map((project) => project.id));
  const cleanedFolders = candidateFolders.map((folder) => ({
    ...folder,
    name: folder.name.trim() || "Untitled Folder",
    projectIds: uniqueStrings(folder.projectIds.filter((projectId) => projectIdSet.has(projectId))),
  }));

  const foldersWithoutDefault = cleanedFolders.filter((folder) => folder.id !== DEFAULT_FOLDER_ID);
  const assigned = new Set(foldersWithoutDefault.flatMap((folder) => folder.projectIds));
  const unassigned = projects
    .map((project) => project.id)
    .filter((projectId) => !assigned.has(projectId));

  const defaultFolder = cleanedFolders.find((folder) => folder.id === DEFAULT_FOLDER_ID);
  const defaultProjectIds = uniqueStrings([...(defaultFolder?.projectIds ?? []), ...unassigned]);

  return [
    {
      id: DEFAULT_FOLDER_ID,
      name: defaultFolder?.name?.trim() || "Projects",
      projectIds: defaultProjectIds,
    },
    ...foldersWithoutDefault,
  ];
}

export function DashboardProjectStructure({ projects }: { projects: ProjectItem[] }) {
  const [folders, setFolders] = React.useState<FolderItem[]>(() => [buildDefaultFolder(projects)]);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [renameTargetId, setRenameTargetId] = React.useState<string | null>(null);
  const [folderNameInput, setFolderNameInput] = React.useState("");

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setFolders(reconcileFolders([buildDefaultFolder(projects)], projects));
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      const normalized = normalizeFolders(parsed);
      setFolders(reconcileFolders(normalized, projects));
    } catch {
      setFolders(reconcileFolders([buildDefaultFolder(projects)], projects));
    }
  }, [projects]);

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(folders));
  }, [folders]);

  const projectsById = React.useMemo(() => {
    const map = new Map<string, ProjectItem>();
    for (const project of projects) {
      map.set(project.id, project);
    }
    return map;
  }, [projects]);

  const renameTarget = React.useMemo(
    () => folders.find((folder) => folder.id === renameTargetId) ?? null,
    [folders, renameTargetId]
  );

  function handleCreateFolder() {
    const nextName = folderNameInput.trim();
    if (!nextName) return;

    setFolders((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: nextName,
        projectIds: [],
      },
    ]);
    setFolderNameInput("");
    setCreateOpen(false);
  }

  function openRenameDialog(folder: FolderItem) {
    setRenameTargetId(folder.id);
    setFolderNameInput(folder.name);
  }

  function handleRenameFolder() {
    if (!renameTargetId) return;

    const nextName = folderNameInput.trim();
    if (!nextName) return;

    setFolders((prev) =>
      prev.map((folder) =>
        folder.id === renameTargetId
          ? {
              ...folder,
              name: nextName,
            }
          : folder
      )
    );
    setRenameTargetId(null);
    setFolderNameInput("");
  }

  function handleDeleteFolder(folderId: string) {
    if (folderId === DEFAULT_FOLDER_ID) return;

    setFolders((prev) => {
      const target = prev.find((folder) => folder.id === folderId);
      if (!target) return prev;

      const remaining = prev.filter((folder) => folder.id !== folderId);
      return remaining.map((folder) =>
        folder.id === DEFAULT_FOLDER_ID
          ? {
              ...folder,
              projectIds: uniqueStrings([...folder.projectIds, ...target.projectIds]),
            }
          : folder
      );
    });
  }

  function moveProjectToFolder(projectId: string, folderId: string) {
    setFolders((prev) => {
      const stripped = prev.map((folder) => ({
        ...folder,
        projectIds: folder.projectIds.filter((id) => id !== projectId),
      }));

      return stripped.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              projectIds: [...folder.projectIds, projectId],
            }
          : folder
      );
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium">Project Folders</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setFolderNameInput("");
            setCreateOpen(true);
          }}
        >
          <FolderPlus className="mr-1.5 h-4 w-4" />
          New Folder
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {folders.map((folder) => {
          const folderProjects = folder.projectIds
            .map((projectId) => projectsById.get(projectId))
            .filter((project): project is ProjectItem => project != null);

          return (
            <Collapsible key={folder.id} defaultOpen>
              <div className="rounded-md border">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <CollapsibleTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6 data-[state=open]:rotate-90">
                      <ChevronRight className="h-4 w-4" />
                      <span className="sr-only">Toggle folder</span>
                    </Button>
                  </CollapsibleTrigger>
                  <div className="flex-1 text-sm font-medium">{folder.name}</div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Folder actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => openRenameDialog(folder)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Rename Folder
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        disabled={folder.id === DEFAULT_FOLDER_ID}
                        onClick={() => handleDeleteFolder(folder.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <CollapsibleContent>
                  <div className="border-t px-2 py-1">
                    {folderProjects.length === 0 ? (
                      <p className="text-muted-foreground px-2 py-2 text-xs">No projects in this folder.</p>
                    ) : (
                      <ul className="space-y-1">
                        {folderProjects.map((project) => (
                          <li
                            key={project.id}
                            className="hover:bg-muted/40 flex items-center justify-between rounded-sm px-2 py-1"
                          >
                            <Link href={`/projects/${project.id}`} className="text-sm">
                              {project.title}
                            </Link>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                                  Move
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                {folders.map((targetFolder) => (
                                  <DropdownMenuItem
                                    key={`${project.id}-${targetFolder.id}`}
                                    disabled={targetFolder.id === folder.id}
                                    onClick={() => moveProjectToFolder(project.id, targetFolder.id)}
                                  >
                                    {targetFolder.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={folderNameInput}
            onChange={(event) => setFolderNameInput(event.target.value)}
            placeholder="Folder name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameTarget != null} onOpenChange={(open) => !open && setRenameTargetId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <Input
            value={folderNameInput}
            onChange={(event) => setFolderNameInput(event.target.value)}
            placeholder="Folder name"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTargetId(null)}>
              Cancel
            </Button>
            <Button onClick={handleRenameFolder}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
