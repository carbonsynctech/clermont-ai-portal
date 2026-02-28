import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";
import { projects } from "@repo/db";
import { eq, and } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: projectId } = await params;

  // Ownership check
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.ownerId, user.id)),
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const workerUrl = process.env["WORKER_URL"] ?? "http://localhost:3001";
  const workerSecret = process.env["WORKER_SECRET"] ?? "";

  // Proxy to worker PDF endpoint
  const workerRes = await fetch(
    `${workerUrl}/export/pdf?projectId=${encodeURIComponent(projectId)}`,
    {
      headers: {
        "x-worker-secret": workerSecret,
      },
    }
  );

  if (!workerRes.ok) {
    const text = await workerRes.text();
    return NextResponse.json(
      { error: `Export failed: ${text}` },
      { status: workerRes.status }
    );
  }

  const pdfBuffer = await workerRes.arrayBuffer();

  return new NextResponse(pdfBuffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="memo-${projectId}.pdf"`,
    },
  });
}
