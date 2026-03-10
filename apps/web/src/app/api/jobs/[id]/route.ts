import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { workerClient } from "@/lib/worker-client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;

  try {
    const job = await workerClient.getJobStatus(jobId);
    return NextResponse.json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[GET /api/jobs/${jobId}] Worker fetch failed:`, message);
    const status = message.includes("401") ? 502 : 404;
    return NextResponse.json({ error: "Job not found", detail: message }, { status });
  }
}
