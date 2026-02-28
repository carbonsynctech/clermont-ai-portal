import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, personas } from "@repo/db";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() ?? "";
  const tag = searchParams.get("tag")?.trim() ?? "";
  const excludeProjectId = searchParams.get("excludeProjectId")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);
  const offset = Number(searchParams.get("offset") ?? "0");

  const rows = await db.query.personas.findMany({
    limit,
    offset,
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

  // Filter in JS for simplicity
  let filtered = rows;

  if (excludeProjectId) {
    filtered = filtered.filter((p) => p.projectId !== excludeProjectId);
  }

  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        p.description.toLowerCase().includes(lower)
    );
  }

  if (tag && tag !== "All") {
    filtered = filtered.filter((p) => p.tags.includes(tag));
  }

  return NextResponse.json(filtered);
}
