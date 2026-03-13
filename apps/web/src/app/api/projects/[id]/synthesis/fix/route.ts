import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workerClient } from "@/lib/worker-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface FixBody {
  message?: unknown;
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

  const { data: project } = await supabase
    .from("projects")
    .select()
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as FixBody | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > 4000) {
    return NextResponse.json({ error: "Message is too long (max 4000 chars)" }, { status: 400 });
  }

  try {
    const result = await workerClient.fixSynthesis(projectId, user.id, message);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to dispatch fix job" }, { status: 502 });
  }
}
