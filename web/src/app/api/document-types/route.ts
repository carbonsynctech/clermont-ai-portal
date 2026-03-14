import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@repo/db";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("document_types")
    .select()
    .order("display_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    description?: string;
    fields?: Json;
    prompt_template?: string;
    is_active?: boolean;
    display_order?: number;
  };

  if (!body.name || typeof body.name !== "string" || body.name.trim() === "") {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("document_types")
    .insert({
      name: body.name.trim(),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.fields !== undefined && { fields: body.fields }),
      ...(body.prompt_template !== undefined && {
        prompt_template: body.prompt_template,
      }),
      ...(body.is_active !== undefined && { is_active: body.is_active }),
      ...(body.display_order !== undefined && {
        display_order: body.display_order,
      }),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
