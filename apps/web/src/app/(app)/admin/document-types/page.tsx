"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  X,
  Check,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DocumentTypeFieldDef {
  type: "text" | "number" | "radio";
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  columns?: number;
}

interface DocumentType {
  id: string;
  name: string;
  description: string | null;
  fields: DocumentTypeFieldDef[];
  prompt_template: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

type FormData = {
  name: string;
  description: string;
  prompt_template: string;
  fields_json: string;
  is_active: boolean;
  display_order: number;
};

const emptyForm: FormData = {
  name: "",
  description: "",
  prompt_template: "",
  fields_json: "[]",
  is_active: true,
  display_order: 0,
};

function formFromDocType(dt: DocumentType): FormData {
  return {
    name: dt.name,
    description: dt.description ?? "",
    prompt_template: dt.prompt_template ?? "",
    fields_json: JSON.stringify(dt.fields, null, 2),
    is_active: dt.is_active,
    display_order: dt.display_order,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DocumentTypesAdminPage() {
  const [docTypes, setDocTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ------- Fetch -------
  const fetchDocTypes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/document-types");
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data: DocumentType[] = await res.json();
      setDocTypes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocTypes();
  }, [fetchDocTypes]);

  // ------- Helpers -------
  function openCreate() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      display_order:
        docTypes.length > 0
          ? Math.max(...docTypes.map((d) => d.display_order)) + 1
          : 0,
    });
    setFieldsError(null);
    setFormOpen(true);
  }

  function openEdit(dt: DocumentType) {
    setEditingId(dt.id);
    setForm(formFromDocType(dt));
    setFieldsError(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFieldsError(null);
  }

  function validateFieldsJson(json: string): DocumentTypeFieldDef[] | null {
    try {
      const parsed: unknown = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        setFieldsError("Fields must be a JSON array");
        return null;
      }
      setFieldsError(null);
      return parsed as DocumentTypeFieldDef[];
    } catch {
      setFieldsError("Invalid JSON");
      return null;
    }
  }

  // ------- Save (create / update) -------
  async function handleSave() {
    const fields = validateFieldsJson(form.fields_json);
    if (fields === null) return;

    setSaving(true);
    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        prompt_template: form.prompt_template.trim() || null,
        fields,
        is_active: form.is_active,
        display_order: form.display_order,
      };

      const url = editingId
        ? `/api/document-types/${editingId}`
        : "/api/document-types";
      const method = editingId ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }

      closeForm();
      await fetchDocTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // ------- Delete -------
  async function handleDelete(id: string) {
    if (!confirm("Delete this document type? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/document-types/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await fetchDocTypes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  // ------- Render -------
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Document Types
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage document type definitions and their field schemas.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" disabled={formOpen}>
          <Plus className="size-4 mr-1.5" />
          New Document Type
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-2 hover:opacity-70"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Inline form */}
      {formOpen && (
        <div className="mb-6 rounded-lg border bg-card p-6 shadow-sm">
          <h2 className="text-lg font-medium mb-4">
            {editingId ? "Edit Document Type" : "New Document Type"}
          </h2>

          <div className="grid gap-4">
            {/* Name */}
            <div className="grid gap-1.5">
              <Label htmlFor="dt-name">Name *</Label>
              <Input
                id="dt-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Investment Memo"
              />
            </div>

            {/* Description */}
            <div className="grid gap-1.5">
              <Label htmlFor="dt-desc">Description</Label>
              <Textarea
                id="dt-desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Brief description of this document type"
                rows={2}
              />
            </div>

            {/* Prompt Template */}
            <div className="grid gap-1.5">
              <Label htmlFor="dt-prompt">Prompt Template</Label>
              <Textarea
                id="dt-prompt"
                value={form.prompt_template}
                onChange={(e) =>
                  setForm({ ...form, prompt_template: e.target.value })
                }
                placeholder="System prompt template for this document type..."
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            {/* Fields JSON */}
            <div className="grid gap-1.5">
              <Label htmlFor="dt-fields">
                Fields (JSON){" "}
                <span className="text-muted-foreground font-normal">
                  — array of DocumentTypeFieldDef
                </span>
              </Label>
              <Textarea
                id="dt-fields"
                value={form.fields_json}
                onChange={(e) => {
                  setForm({ ...form, fields_json: e.target.value });
                  setFieldsError(null);
                }}
                rows={8}
                className="font-mono text-sm"
              />
              {fieldsError && (
                <p className="text-destructive text-sm">{fieldsError}</p>
              )}
            </div>

            {/* Display Order + Active */}
            <div className="flex items-center gap-6">
              <div className="grid gap-1.5 w-32">
                <Label htmlFor="dt-order">Display Order</Label>
                <Input
                  id="dt-order"
                  type="number"
                  value={form.display_order}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      display_order: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>

              <div className="flex items-center gap-2 pt-5">
                <Checkbox
                  id="dt-active"
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm({ ...form, is_active: checked === true })
                  }
                />
                <Label htmlFor="dt-active" className="cursor-pointer">
                  Active
                </Label>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                {editingId ? "Update" : "Create"}
              </Button>
              <Button variant="outline" onClick={closeForm} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" />
          Loading document types...
        </div>
      ) : docTypes.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No document types found.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={openCreate}
          >
            <Plus className="size-4 mr-1.5" />
            Create your first document type
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium px-4 py-3">Name</th>
                <th className="text-left font-medium px-4 py-3">
                  Description
                </th>
                <th className="text-center font-medium px-4 py-3">Fields</th>
                <th className="text-center font-medium px-4 py-3">Active</th>
                <th className="text-center font-medium px-4 py-3">Order</th>
                <th className="text-right font-medium px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docTypes
                .sort((a, b) => a.display_order - b.display_order)
                .map((dt) => (
                  <tr
                    key={dt.id}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium">{dt.name}</td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                      {dt.description ?? (
                        <span className="italic">No description</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="secondary">{dt.fields.length}</Badge>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {dt.is_active ? (
                        <Badge variant="default">
                          <Check className="size-3 mr-0.5" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums">
                      <div className="inline-flex items-center gap-1">
                        {dt.display_order}
                        <ArrowUp className="size-3 text-muted-foreground" />
                        <ArrowDown className="size-3 text-muted-foreground" />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(dt)}
                          disabled={formOpen}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(dt.id)}
                          disabled={deletingId === dt.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {deletingId === dt.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
