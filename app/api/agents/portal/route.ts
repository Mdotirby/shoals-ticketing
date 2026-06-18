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

  const admin = createAdminClient();

  // Verify this user has 'agent' role
  const { data: adminUser } = await admin
    .from("admin_users")
    .select("id, role, first_name, last_name, avatar_url, venue_id")
    .eq("id", user.id)
    .single();

  if (!adminUser || adminUser.role !== "agent") {
    return NextResponse.json({ error: "Not an agent" }, { status: 403 });
  }

  // Get the agent record linked to this user
  const { data: agent } = await admin
    .from("agents")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (!agent) {
    // Fallback: match by email — check both agent_email and email columns
    const { data: agentByEmail } = await admin
      .from("agents")
      .select("*")
      .or(`agent_email.eq.${user.email},email.eq.${user.email}`)
      .single();

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
  const { data: assignments } = await admin
    .from("agent_assignments")
    .select("event_id")
    .eq("agent_id", agent.id);

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
    .select("id, title, date, venue, venue_id, image_url, status")
    .in("id", eventIds)
    .order("date", { ascending: false });

  // Fetch sales data for each event
  const eventsWithSales = await Promise.all(
    (events || []).map(async (event: Record<string, unknown>) => {
      // Revenue from orders (same pattern as admin dashboard)
      const { data: orders } = await admin
        .from("orders")
        .select("total_amount, quantity")
        .eq("event_id", event.id)
        .eq("status", "paid");

      const totalRevenue = (orders || []).reduce((sum, o: { total_amount: number }) => sum + (o.total_amount || 0), 0);

      // Ticket count + tier breakdown from tickets table (has FK to ticket_tiers)
      const { data: tickets } = await admin
        .from("tickets")
        .select("ticket_tiers(tier_name)")
        .eq("event_id", event.id);

      const totalSold = tickets?.length || 0;

      // Group by tier
      const byTier: Record<string, { sold: number; revenue: number }> = {};
      for (const t of tickets || []) {
        const tierRow = t as unknown as { ticket_tiers: { tier_name: string } | null };
        const tier = tierRow.ticket_tiers?.tier_name || "General";
        if (!byTier[tier]) byTier[tier] = { sold: 0, revenue: 0 };
        byTier[tier].sold += 1;
      }
      // Spread revenue proportionally across tiers by ticket count
      const tierNames = Object.keys(byTier);
      if (tierNames.length > 0 && totalRevenue > 0) {
        for (const tier of tierNames) {
          byTier[tier].revenue = parseFloat(((byTier[tier].sold / totalSold) * totalRevenue).toFixed(2));
        }
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
