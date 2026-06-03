import { createAdminClient } from "@/lib/supabase-server";

export type SeatAssignment = {
  section: string;
  row: string;   // empty string for table assignments
  seat: string;  // "Table X" for tables, seat number for regular seats
};

type AdminClient = ReturnType<typeof createAdminClient>;

type RawSeat = {
  id: string;
  seat_number: number;
  row_label: string;
  section_id: string;
  object_id: string | null;
  ticket_id?: string | null;
};

// ── Shared helpers ─────────────────────────────────────────────────────────────

async function fetchSectionAndObjectMaps(admin: AdminClient, seats: RawSeat[]) {
  const sectionIds = [...new Set(seats.map((s) => s.section_id))];
  const { data: sectionData } = await admin
    .from("sections")
    .select("id, name, sells_as_table, type")
    .in("id", sectionIds);

  const sectionMap = new Map(
    (sectionData || []).map((s: { id: string; name: string; sells_as_table: boolean; type: string }) => [
      s.id,
      { name: s.name, isTable: !!s.sells_as_table || s.type === "table" },
    ])
  );

  const tableObjectIds = [
    ...new Set(
      seats
        .filter((s) => s.object_id && sectionMap.get(s.section_id)?.isTable)
        .map((s) => s.object_id as string)
    ),
  ];

  const objectTableNumbers = new Map<string, number>();
  if (tableObjectIds.length > 0) {
    const { data: objects } = await admin
      .from("objects")
      .select("id, metadata")
      .in("id", tableObjectIds);

    for (const obj of objects || []) {
      const tableNum = (obj.metadata as { table_number?: number })?.table_number;
      if (tableNum != null) objectTableNumbers.set(obj.id, tableNum);
    }
  }

  return { sectionMap, objectTableNumbers };
}

function assignmentsFromSeats(
  seats: RawSeat[],
  sectionMap: Map<string, { name: string; isTable: boolean }>,
  objectTableNumbers: Map<string, number>
): SeatAssignment[] {
  const assignments: SeatAssignment[] = [];
  const seenTableObjects = new Set<string>();

  for (const seat of seats) {
    const sec = sectionMap.get(seat.section_id);
    const secName = sec?.name ?? "Section";

    if (sec?.isTable && seat.object_id) {
      if (seenTableObjects.has(seat.object_id)) continue;
      seenTableObjects.add(seat.object_id);
      const tableNum = objectTableNumbers.get(seat.object_id);
      assignments.push({ section: secName, row: "", seat: tableNum != null ? `Table ${tableNum}` : "Table" });
    } else {
      assignments.push({ section: secName, row: seat.row_label, seat: String(seat.seat_number) });
    }
  }

  assignments.sort((a, b) => a.section.localeCompare(b.section) || a.seat.localeCompare(b.seat, undefined, { numeric: true }));
  return assignments;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Build seat assignments for a single order (legacy / fallback).
 * Returns ALL seats for the order — used when ticket_id is not available.
 */
export async function buildSeatAssignments(
  admin: AdminClient,
  orderId: string
): Promise<SeatAssignment[]> {
  const { data: rawSeats } = await admin
    .from("seats")
    .select("id, seat_number, row_label, section_id, object_id, ticket_id")
    .eq("order_id", orderId)
    .eq("status", "sold");

  if (!rawSeats || rawSeats.length === 0) return [];
  const seats = rawSeats as RawSeat[];

  const { sectionMap, objectTableNumbers } = await fetchSectionAndObjectMaps(admin, seats);
  return assignmentsFromSeats(seats, sectionMap, objectTableNumbers);
}

/**
 * Build seat assignments keyed by ticket_id for every ticket in an order.
 *
 * Returns a Map<ticketId, SeatAssignment[]> so each ticket in the carousel
 * can show only its own assigned seat(s).
 *
 * Falls back to order-level (all seats on every ticket) when ticket_id has
 * not been populated yet (pre-migration rows). In that case every ticket gets
 * the same full list, which matches the old behaviour.
 */
export async function buildSeatAssignmentsByTicket(
  admin: AdminClient,
  orderId: string
): Promise<Map<string, SeatAssignment[]>> {
  const { data: rawSeats } = await admin
    .from("seats")
    .select("id, seat_number, row_label, section_id, object_id, ticket_id")
    .eq("order_id", orderId)
    .eq("status", "sold");

  if (!rawSeats || rawSeats.length === 0) return new Map();
  const seats = rawSeats as RawSeat[];

  const { sectionMap, objectTableNumbers } = await fetchSectionAndObjectMaps(admin, seats);

  const hasTicketIds = seats.some((s) => s.ticket_id != null);

  if (!hasTicketIds) {
    // Pre-migration: fall back to order-level — return the same list for every null key
    // Callers should use the null key as the fallback entry.
    const all = assignmentsFromSeats(seats, sectionMap, objectTableNumbers);
    const result = new Map<string, SeatAssignment[]>();
    result.set("__order__", all);
    return result;
  }

  // Group seats by ticket_id
  const seatsByTicket = new Map<string, RawSeat[]>();
  for (const seat of seats) {
    const key = seat.ticket_id ?? "__order__";
    const bucket = seatsByTicket.get(key) ?? [];
    bucket.push(seat);
    seatsByTicket.set(key, bucket);
  }

  const result = new Map<string, SeatAssignment[]>();
  for (const [ticketId, ticketSeats] of seatsByTicket) {
    result.set(ticketId, assignmentsFromSeats(ticketSeats, sectionMap, objectTableNumbers));
  }
  return result;
}
