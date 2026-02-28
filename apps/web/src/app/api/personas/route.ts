import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/db";

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
  const rawLimit = parseInt(searchParams.get("limit") ?? "30", 10);
  const limit = Math.min(isNaN(rawLimit) || rawLimit < 1 ? 30 : rawLimit, 100);
  const rawOffset = parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  // Fetch all rows first, then filter in JS (spec requirement)
  const rows = await db.query.personas.findMany({
    orderBy: (p, { desc }) => [desc(p.createdAt)],
  });

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

  return NextResponse.json(filtered.slice(offset, offset + limit));
}
