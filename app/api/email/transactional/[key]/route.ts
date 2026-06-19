import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import type { EmailDocument } from "@/emails/email-document";

type Params = { params: Promise<{ key: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { key } = await params;
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("transactional_email_templates")
    .select("key, label, body_json, updated_at, updated_by")
    .eq("key", key)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? null);
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { key } = await params;
  const body = await req.json() as { label?: string; body_json: EmailDocument; updated_by?: string };

  if (!body.body_json?.blocks) {
    return NextResponse.json({ error: "body_json.blocks is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("transactional_email_templates")
    .upsert({
      key,
      label: body.label ?? key,
      body_json: body.body_json,
      updated_at: new Date().toISOString(),
      updated_by: body.updated_by ?? null,
    }, { onConflict: "key" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
