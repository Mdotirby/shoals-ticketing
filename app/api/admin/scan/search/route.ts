import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type TicketSearchRow = {
  id: string;
  qr_code: string;
  is_scanned: boolean;
  scanned_at: string | null;
  tier_name: string;
};

export type PersonResult = {
  customer_name: string;
  customer_email: string;
  tickets: TicketSearchRow[];
  total: number;
  scanned: number;
};

// GET /api/admin/scan/search?event_id=X&last_name=Smith
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("event_id");
  const lastName = searchParams.get("last_name")?.trim();

  if (!eventId) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }
  if (!lastName || lastName.length < 1) {
    return NextResponse.json([], { status: 200 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("tickets")
    .select("id, qr_code, customer_name, customer_email, is_scanned, scanned_at, ticket_tiers(name)")
    .eq("event_id", eventId)
    // Match last name: the last word in customer_name, case-insensitive
    .ilike("customer_name", `% ${lastName}`)
    .order("customer_name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by customer_name + customer_email
  const grouped = new Map<string, PersonResult>();
  for (const row of data ?? []) {
    const key = `${row.customer_name}||${row.customer_email}`;
    const tier = row.ticket_tiers as unknown as { name: string } | null;
    const ticket: TicketSearchRow = {
      id: row.id,
      qr_code: row.qr_code,
      is_scanned: row.is_scanned ?? false,
      scanned_at: row.scanned_at ?? null,
      tier_name: tier?.name ?? "General Admission",
    };
    if (!grouped.has(key)) {
      grouped.set(key, {
        customer_name: row.customer_name,
        customer_email: row.customer_email,
        tickets: [],
        total: 0,
        scanned: 0,
      });
    }
    const person = grouped.get(key)!;
    person.tickets.push(ticket);
    person.total++;
    if (ticket.is_scanned) person.scanned++;
  }

  return NextResponse.json([...grouped.values()], { status: 200 });
}
