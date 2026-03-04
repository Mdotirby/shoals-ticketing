import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// GET /api/agents/assignments?agent_id=xxx
// List agent assignments with event details
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const agentId = searchParams.get("agent_id");

  if (!agentId) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: assignments, error } = await admin
    .from("agent_assignments")
    .select("id, event_id, created_at")
    .eq("agent_id", agentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!assignments || assignments.length === 0) {
    return NextResponse.json([]);
  }

  // Fetch event details
  const eventIds = assignments.map((a: { event_id: string }) => a.event_id);
  const { data: events } = await admin
    .from("events")
    .select("id, title, date, venue")
    .in("id", eventIds);

  const result = assignments.map((a: { id: string; event_id: string; created_at: string }) => {
    const ev = events?.find((e: { id: string }) => e.id === a.event_id);
    return {
      id: a.id,
      event_id: a.event_id,
      created_at: a.created_at,
      event: ev || { id: a.event_id, title: "Unknown", date: "", venue: "" },
    };
  });

  return NextResponse.json(result);
}

// POST /api/agents/assignments — Assign agent to event (admin only)
export async function POST(request: Request) {
  const admin = createAdminClient();
  const body = await request.json();
  const { agent_id, event_id } = body;

  if (!agent_id || !event_id) {
    return NextResponse.json(
      { error: "agent_id and event_id are required" },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("agent_assignments")
    .insert({ agent_id, event_id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Agent is already assigned to this event" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/agents/assignments?id=xxx
// Remove an agent assignment
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const agentId = searchParams.get("agent_id");
  const eventId = searchParams.get("event_id");

  const admin = createAdminClient();

  if (id) {
    const { error } = await admin
      .from("agent_assignments")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ deleted: true });
  }

  if (agentId && eventId) {
    const { error } = await admin
      .from("agent_assignments")
      .delete()
      .eq("agent_id", agentId)
      .eq("event_id", eventId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ deleted: true });
  }

  return NextResponse.json(
    { error: "id or (agent_id + event_id) required" },
    { status: 400 }
  );
}
