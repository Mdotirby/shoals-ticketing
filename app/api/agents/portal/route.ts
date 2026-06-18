import { createAdminClient } from "@/lib/supabase-server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// GET /api/agents/portal — Returns agent profile + assigned events with sales data
export async function GET() {
  // Authenticate user via Supabase session
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[portal] user.id:", user.id, "user.email:", user.email);

  const admin = createAdminClient();

  // Verify this user has 'agent' role
  const { data: adminUser, error: adminUserError } = await admin
    .from("admin_users")
    .select("id, role, first_name, last_name, avatar_url, venue_id")
    .eq("id", user.id)
    .single();

  console.log("[portal] adminUser:", adminUser?.id, adminUser?.role, "error:", adminUserError?.message);

  if (!adminUser || adminUser.role !== "agent") {
    return NextResponse.json({ error: "Not an agent" }, { status: 403 });
  }

  // Get the agent record linked to this user
  const { data: agent, error: agentError } = await admin
    .from("agents")
    .select("*")
    .eq("user_id", user.id)
    .single();

  console.log("[portal] agent by user_id:", agent ? (agent as Record<string,unknown>).id : "null", "error:", agentError?.message);

  if (!agent) {
    // Fallback: match by email — check both agent_email and email columns
    const { data: agentByEmail, error: emailError } = await admin
      .from("agents")
      .select("*")
      .or(`agent_email.eq.${user.email},email.eq.${user.email}`)
      .single();

    console.log("[portal] agent by email fallback:", agentByEmail ? (agentByEmail as Record<string,unknown>).id : "null", "error:", emailError?.message);

    if (!agentByEmail) {
      return NextResponse.json({ error: "Agent record not found" }, { status: 404 });
    }

    // Link user_id so future lookups hit the fast path
    await admin.from("agents").update({ user_id: user.id }).eq("id", (agentByEmail as Record<string,unknown>).id);

    return buildResponse(admin, agentByEmail, adminUser);
  }

  return buildResponse(admin, agent, adminUser);
}

async function buildResponse(
  admin: ReturnType<typeof createAdminClient>,
  agent: Record<string, unknown>,
  adminUser: Record<string, unknown>
) {
  // Get assigned event IDs
  const { data: assignments, error: assignError } = await admin
    .from("agent_assignments")
    .select("event_id")
    .eq("agent_id", agent.id);

  console.log("[portal] agent.id used for assignments:", agent.id, "assignments:", assignments?.length, "error:", assignError?.message, "raw:", JSON.stringify(assignments));

  const eventIds = (assignments || []).map((a: { event_id: string }) => a.event_id);

  if (eventIds.length === 0) {
    return NextResponse.json({
      agent: {
        id: agent.id,
        first_name: agent.first_name || agent.agent_name,
        last_name: agent.last_name || "",
        email: agent.email || agent.agent_email,
        phone: agent.agent_phone,
        agency_name: agent.agency,
        avatar_url: adminUser.avatar_url || null,
      },
      events: [],
    });
  }

  // Fetch events with details
  const { data: events } = await admin
    .from("events")
    .select("id, title, date, venue, venue_id, flyer_url, status")
    .in("id", eventIds)
    .order("date", { ascending: false });

  // Fetch sales data for each event
  const eventsWithSales = await Promise.all(
    (events || []).map(async (event: Record<string, unknown>) => {
      // Get orders for this event
      const { data: orders } = await admin
        .from("orders")
        .select("id, total, quantity, ticket_type, status")
        .eq("event_id", event.id)
        .neq("status", "refunded");

      const totalSold = (orders || []).reduce(
        (sum: number, o: { quantity?: number }) => sum + (o.quantity || 1),
        0
      );
      const totalRevenue = (orders || []).reduce(
        (sum: number, o: { total?: number }) => sum + (o.total || 0),
        0
      );

      // Group by tier
      const byTier: Record<string, { sold: number; revenue: number }> = {};
      for (const o of orders || []) {
        const tier = (o as Record<string, unknown>).ticket_type as string || "General";
        if (!byTier[tier]) byTier[tier] = { sold: 0, revenue: 0 };
        byTier[tier].sold += ((o as Record<string, unknown>).quantity as number) || 1;
        byTier[tier].revenue += ((o as Record<string, unknown>).total as number) || 0;
      }

      // Get event views for marketing analytics
      const { data: views } = await admin
        .from("event_views")
        .select("id")
        .eq("event_id", event.id);

      const totalViews = views?.length || 0;
      const conversionRate = totalViews > 0 ? ((totalSold / totalViews) * 100).toFixed(1) : "0.0";

      return {
        ...event,
        sales: {
          total_sold: totalSold,
          total_revenue: totalRevenue,
          by_tier: byTier,
        },
        analytics: {
          views: totalViews,
          conversion_rate: conversionRate,
        },
      };
    })
  );

  return NextResponse.json({
    agent: {
      id: agent.id,
      first_name: agent.first_name || agent.agent_name,
      last_name: agent.last_name || "",
      email: agent.email || agent.agent_email,
      phone: agent.agent_phone,
      agency_name: agent.agency,
      avatar_url: adminUser.avatar_url || null,
    },
    events: eventsWithSales,
  });
}
