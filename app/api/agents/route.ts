import { createAdminClient } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// GET: list agents, optional ?venue_id= filter
export async function GET(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");

  let query = admin
    .from("agents")
    .select("*")
    .order("agency", { ascending: true });

  if (venueId) {
    query = query.or(`venue_id.eq.${venueId},venue_id.is.null`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST: create or update an agent (upsert by agency + agent_name)
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();

  // Check if agent already exists
  const { data: existing } = await admin
    .from("agents")
    .select("id")
    .eq("agency", body.agency || "")
    .eq("agent_name", body.agent_name || "")
    .maybeSingle();

  if (existing) {
    // Update existing
    const { data, error } = await admin
      .from("agents")
      .update({
        agent_phone: body.agent_phone || null,
        agent_email: body.agent_email || null,
        venue_id: body.venue_id || null,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Create new
  const { data, error } = await admin
    .from("agents")
    .insert({
      agency: body.agency,
      agent_name: body.agent_name,
      agent_phone: body.agent_phone || null,
      agent_email: body.agent_email || null,
      venue_id: body.venue_id || null,
      user_id: body.user_id || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE: fully remove an agent (agents row + admin_users row + auth user)
export async function DELETE(request: Request) {
  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: agent, error: fetchError } = await admin
    .from("agents")
    .select("id, user_id, agent_email, email")
    .eq("id", id)
    .single();

  if (fetchError || !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Delete agents row — agent_assignments cascade automatically
  const { error: deleteError } = await admin.from("agents").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // Resolve the linked admin_users ID (may be stored directly or found via email)
  let adminUserId: string | null = agent.user_id || null;
  if (!adminUserId) {
    const agentEmail = agent.agent_email || agent.email;
    if (agentEmail) {
      const { data: adminUser } = await admin
        .from("admin_users")
        .select("id")
        .eq("email", agentEmail)
        .eq("role", "agent")
        .maybeSingle();
      adminUserId = adminUser?.id || null;
    }
  }

  if (adminUserId) {
    await admin.from("admin_users").delete().eq("id", adminUserId);

    const authAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { error: authErr } = await authAdmin.auth.admin.deleteUser(adminUserId);
    if (authErr) {
      console.error("Failed to delete auth user for agent:", authErr.message);
    }
  }

  return NextResponse.json({ deleted: true });
}
