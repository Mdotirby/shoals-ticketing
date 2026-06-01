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
};

/**
 * Build seat assignments for an order.
 *
 * For sells_as_table sections: one entry per table object → "Table X"
 * For regular sections: one entry per seat → row + seat number
 */
export async function buildSeatAssignments(
  admin: AdminClient,
  orderId: string
): Promise<SeatAssignment[]> {
  const { data: rawSeats } = await admin
    .from("seats")
    .select("id, seat_number, row_label, section_id, object_id")
    .eq("order_id", orderId)
    .eq("status", "sold");

  if (!rawSeats || rawSeats.length === 0) return [];
  const seats = rawSeats as RawSeat[];

  // Fetch sections (need sells_as_table, type, name)
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

  // Fetch table object metadata to get table numbers
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

  // Build assignments — one per table object or one per individual seat
  const assignments: SeatAssignment[] = [];
  const seenTableObjects = new Set<string>();

  for (const seat of seats) {
    const sec = sectionMap.get(seat.section_id);
    const secName = sec?.name ?? "Section";

    if (sec?.isTable && seat.object_id) {
      if (seenTableObjects.has(seat.object_id)) continue; // already added this table
      seenTableObjects.add(seat.object_id);

      const tableNum = objectTableNumbers.get(seat.object_id);
      assignments.push({
        section: secName,
        row: "",
        seat: tableNum != null ? `Table ${tableNum}` : "Table",
      });
    } else {
      assignments.push({
        section: secName,
        row: seat.row_label,
        seat: String(seat.seat_number),
      });
    }
  }

  assignments.sort((a, b) => a.section.localeCompare(b.section) || a.seat.localeCompare(b.seat, undefined, { numeric: true }));
  return assignments;
}
