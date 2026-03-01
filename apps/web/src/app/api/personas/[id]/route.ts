import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, personas, projects, auditLogs } from "@repo/db";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const persona = await db.query.personas.findFirst({
    where: eq(personas.id, id),
  });

  if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(persona);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const persona = await db.query.personas.findFirst({
    where: eq(personas.id, id),
  });

  if (!persona) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!persona.projectId) {
    return NextResponse.json({ error: "Cannot delete global persona" }, { status: 403 });
  }

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, persona.projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await db.delete(personas).where(eq(personas.id, id));

  await db.insert(auditLogs).values({
    projectId: persona.projectId,
    userId: user.id,
    action: "persona_selected",
    stepNumber: 2,
    payload: { event: "persona_deleted", personaId: id, name: persona.name },
  });

  return NextResponse.json({ ok: true });
}
