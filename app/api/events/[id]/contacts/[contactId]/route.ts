import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { createAdminClient } from "@/lib/supabase-server";
import { contactFields, eventInScope } from "@/lib/contacts/access";

// PATCH /api/events/:id/contacts/:contactId
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const guard = await requireCapability("offers", { write: true });
  if (!guard.ok) return guard.response;

  const { id, contactId } = await params;
  const admin = createAdminClient();
  if (!(await eventInScope(admin, guard.actor, id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const parsed = contactFields(await request.json().catch(() => ({})));
  if (!parsed.fields) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await admin
    .from("show_contacts")
    .update({ ...parsed.fields, updated_at: new Date().toISOString() })
    .eq("id", contactId)
    .eq("event_id", id)
    .select("id, name, role, email, phone")
    .maybeSingle();
  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json(
      { error: taken ? "That email is already on this show." : error.message },
      { status: taken ? 409 : 500 },
    );
  }
  if (!data) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  return NextResponse.json({ ...data, source: "contact" });
}

// DELETE /api/events/:id/contacts/:contactId
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  const guard = await requireCapability("offers", { write: true });
  if (!guard.ok) return guard.response;

  const { id, contactId } = await params;
  const admin = createAdminClient();
  if (!(await eventInScope(admin, guard.actor, id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { error } = await admin.from("show_contacts").delete().eq("id", contactId).eq("event_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
