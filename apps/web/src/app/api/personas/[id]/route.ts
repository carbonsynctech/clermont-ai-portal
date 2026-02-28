import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db, personas } from "@repo/db";
import { eq } from "drizzle-orm";

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
