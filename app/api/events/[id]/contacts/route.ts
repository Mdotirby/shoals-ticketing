import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { contactFields, eventInScope } from "@/lib/contacts/access";
import { loadShowContacts } from "@/lib/contacts/showContacts";

// GET /api/events/:id/contacts
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("offers");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  if (!(await eventInScope(admin, guard.actor, id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }
  return NextResponse.json(await loadShowContacts(admin, id));
}

// POST /api/events/:id/contacts
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("offers", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  if (!(await eventInScope(admin, guard.actor, id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const parsed = contactFields(await request.json().catch(() => ({})));
  if (!parsed.fields) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await admin
    .from("show_contacts")
    .insert({ event_id: id, ...parsed.fields })
    .select("id, name, role, email, phone")
    .single();
  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json(
      { error: taken ? "That email is already on this show." : error.message },
      { status: taken ? 409 : 500 },
    );
  }
  return NextResponse.json({ ...data, source: "contact" }, { status: 201 });
}
