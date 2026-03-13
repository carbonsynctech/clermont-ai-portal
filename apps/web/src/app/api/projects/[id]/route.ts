import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ProjectBriefData } from "@repo/db";
import { estimateTokens } from "@repo/core";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json()) as {
    action?: unknown;
    title?: unknown;
    briefData?: unknown;
    masterPrompt?: unknown;
  };

  const { data: existing, error: fetchError } = await supabase
    .from("projects")
    .select()
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (typeof body.action === "string") {
    if (body.action === "trash") {
      if (existing.deleted_at) {
        return NextResponse.json(existing);
      }

      const { data: trashed, error: trashError } = await supabase
        .from("projects")
        .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", user.id)
        .select()
        .single();

      if (trashError) {
        return NextResponse.json({ error: trashError.message }, { status: 500 });
      }

      await supabase.from("audit_logs").insert({
        project_id: id,
        user_id: user.id,
        action: "project_trashed",
        payload: { retentionDays: 30 },
      });

      return NextResponse.json(trashed);
    }

    if (body.action === "restore") {
      if (!existing.deleted_at) {
        return NextResponse.json(existing);
      }

      const { data: restored, error: restoreError } = await supabase
        .from("projects")
        .update({ deleted_at: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("owner_id", user.id)
        .select()
        .single();

      if (restoreError) {
        return NextResponse.json({ error: restoreError.message }, { status: 500 });
      }

      await supabase.from("audit_logs").insert({
        project_id: id,
        user_id: user.id,
        action: "project_restored",
        payload: { restoredAt: new Date().toISOString() },
      });

      return NextResponse.json(restored);
    }

    if (body.action === "purge") {
      const [materialsResult, guidesResult] = await Promise.all([
        supabase
          .from("source_materials")
          .select("storage_path")
          .eq("project_id", id),
        supabase
          .from("style_guides")
          .select("storage_path")
          .eq("project_id", id),
      ]);

      const materials = materialsResult.data ?? [];
      const guides = guidesResult.data ?? [];

      const storagePaths = Array.from(
        new Set(
          [...materials, ...guides]
            .map((item) => item.storage_path)
            .filter((value): value is string => typeof value === "string" && value.length > 0)
        )
      );

      if (storagePaths.length > 0) {
        const admin = createAdminClient();
        const { error: removeError } = await admin.storage
          .from("source-materials")
          .remove(storagePaths);

        if (removeError) {
          console.error("Failed to remove storage files before purge:", removeError);
          return NextResponse.json({ error: "Failed to remove project files" }, { status: 500 });
        }
      }

      await supabase
        .from("projects")
        .delete()
        .eq("id", id)
        .eq("owner_id", user.id);

      await supabase.from("audit_logs").insert({
        project_id: id,
        user_id: user.id,
        action: "project_purged",
        payload: { source: "manual" },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (typeof body.title === "string" && body.title.trim() !== "") {
    updates.title = body.title.trim();
  }

  if (body.briefData != null) {
    updates.brief_data = body.briefData as ProjectBriefData;
  }

  if (typeof body.masterPrompt === "string") {
    if (body.masterPrompt.trim() === "") {
      return NextResponse.json({ error: "Master prompt cannot be empty" }, { status: 400 });
    }
    updates.master_prompt = body.masterPrompt;
  }

  const { data: updated, error: updateError } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Log master prompt edits
  if (typeof body.masterPrompt === "string" && existing.master_prompt !== body.masterPrompt) {
    await supabase.from("audit_logs").insert({
      project_id: id,
      user_id: user.id,
      action: "master_prompt_edited",
      step_number: 1,
      payload: {
        previousTokens: existing.master_prompt ? estimateTokens(existing.master_prompt) : 0,
        newTokens: estimateTokens(body.masterPrompt),
      },
    });
  }

  return NextResponse.json(updated);
}
