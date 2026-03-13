"use client";

import { useState } from "react";
import type { TocEntry } from "@repo/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GripVertical,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Pencil,
} from "lucide-react";

interface TocReviewProps {
  projectId: string;
  tocEntries: TocEntry[];
  onTocChange: (entries: TocEntry[]) => void;
}

export function TocReview({ projectId: _projectId, tocEntries, onTocChange }: TocReviewProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editLevel, setEditLevel] = useState<number>(1);

  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...tocEntries];
    const item = updated[index]!;
    updated[index] = updated[index - 1]!;
    updated[index - 1] = item;
    onTocChange(updated);
  }

  function moveDown(index: number) {
    if (index === tocEntries.length - 1) return;
    const updated = [...tocEntries];
    const item = updated[index]!;
    updated[index] = updated[index + 1]!;
    updated[index + 1] = item;
    onTocChange(updated);
  }

  function removeEntry(index: number) {
    const updated = tocEntries.filter((_, i) => i !== index);
    onTocChange(updated);
  }

  function addEntry() {
    const newEntry: TocEntry = {
      id: crypto.randomUUID(),
      title: "New Section",
      level: 1,
      description: undefined,
    };
    onTocChange([...tocEntries, newEntry]);
    startEditing(newEntry);
  }

  function startEditing(entry: TocEntry) {
    setEditingId(entry.id);
    setEditTitle(entry.title);
    setEditDescription(entry.description ?? "");
    setEditLevel(entry.level);
  }

  function saveEditing() {
    if (editingId === null) return;
    const updated = tocEntries.map((entry) => {
      if (entry.id !== editingId) return entry;
      return {
        ...entry,
        title: editTitle.trim() || entry.title,
        level: editLevel,
        description: editDescription.trim() || undefined,
      };
    });
    onTocChange(updated);
    setEditingId(null);
  }

  function cancelEditing() {
    setEditingId(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Table of Contents</h3>
        <Button variant="outline" size="sm" onClick={addEntry}>
          <Plus className="h-4 w-4 mr-1" />
          Add Section
        </Button>
      </div>

      {tocEntries.length === 0 && (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No sections yet. Click &quot;Add Section&quot; to get started.
        </p>
      )}

      <div className="space-y-1">
        {tocEntries.map((entry, index) => {
          const isEditing = editingId === entry.id;

          if (isEditing) {
            return (
              <div
                key={entry.id}
                className="flex flex-col gap-2 rounded-md border p-3 bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Section title"
                    className="flex-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEditing();
                      if (e.key === "Escape") cancelEditing();
                    }}
                  />
                  <Button
                    variant={editLevel === 1 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditLevel(1)}
                  >
                    H1
                  </Button>
                  <Button
                    variant={editLevel === 2 ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditLevel(2)}
                  >
                    H2
                  </Button>
                </div>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Description (optional)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEditing();
                    if (e.key === "Escape") cancelEditing();
                  }}
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={cancelEditing}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveEditing}>
                    Save
                  </Button>
                </div>
              </div>
            );
          }

          return (
            <div
              key={entry.id}
              className={`flex items-center gap-2 rounded-md border p-2 group ${
                entry.level === 2 ? "ml-6" : ""
              }`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{entry.title}</p>
                {entry.description && (
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveUp(index)}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => moveDown(index)}
                  disabled={index === tocEntries.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => startEditing(entry)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => removeEntry(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
