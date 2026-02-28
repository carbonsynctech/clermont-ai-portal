import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, projects } from "@repo/db";
import { createClient } from "@/lib/supabase/server";
import { workerClient } from "@/lib/worker-client";

interface AskAiBody {
  prompt?: unknown;
  projectId?: unknown;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as AskAiBody | null;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (prompt.length > 10000) {
    return NextResponse.json({ error: "Prompt is too long" }, { status: 400 });
  }

  const rawProjectId = body.projectId;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : undefined;

  if (projectId && !isUuid(projectId)) {
    return NextResponse.json({ error: "Invalid project ID" }, { status: 400 });
  }

  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  try {
    const result = await workerClient.runAskAi(prompt, user.id, projectId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to dispatch Ask AI job" }, { status: 502 });
  }
}
