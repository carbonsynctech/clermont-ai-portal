import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const { data: rows, error } = await supabase
    .from("personas")
    .select()
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let filtered = rows ?? [];

  if (excludeProjectId) {
    filtered = filtered.filter((p) => p.project_id !== excludeProjectId);
  }

  if (q) {
    const lower = q.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        (p.name as string).toLowerCase().includes(lower) ||
        (p.description as string).toLowerCase().includes(lower)
    );
  }

  if (tag && tag !== "All") {
    filtered = filtered.filter((p) => (p.tags as string[]).includes(tag));
  }

  return NextResponse.json(filtered.slice(offset, offset + limit));
}
