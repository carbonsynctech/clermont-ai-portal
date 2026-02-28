import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, projects } from "@repo/db";
import { and, eq } from "drizzle-orm";
import { workerClient } from "@/lib/worker-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { name?: unknown; linkedinUrl?: unknown; context?: unknown };
  try {
    const raw: unknown = await req.json();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = raw as { name?: unknown; linkedinUrl?: unknown; context?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const result = await workerClient.generatePersona({
      name: body.name.trim(),
      linkedinUrl: typeof body.linkedinUrl === "string" ? body.linkedinUrl : undefined,
      context: typeof body.context === "string" ? body.context : undefined,
      projectId,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Worker error";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
