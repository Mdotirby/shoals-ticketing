/** Seating chart — a reusable venue-level layout */
export type SeatingChart = {
  id: string;
  name: string;
  venue_name?: string;
  venue_id?: string;
  total_sections: number;
  chart_data?: Record<string, unknown> | null;
  created_by?: string;
  created_at: string;
};

/** A named section within a seating chart (e.g. "Orchestra", "Balcony") */
export type SeatingSection = {
  id: string;
  chart_id: string;
  section_name: string;
  color: string;
  price_tier: number;
  row_count: number;
  seat_count: number;
};

/** A row within a section */
export type SeatingRow = {
  id: string;
  section_id: string;
  row_label: string;
  seat_count: number;
};

/** An individual seat with coordinates for chart rendering */
export type SeatingSeat = {
  id: string;
  row_id: string;
  seat_number: string;
  x_position: number;
  y_position: number;
  status: "available" | "held" | "sold";
};

/** Links an event to a seating chart */
export type EventSeatingMap = {
  id: string;
  event_id: string;
  chart_id: string;
  reserved_seating_enabled: boolean;
  created_at: string;
};

/** A temporary seat hold or completed purchase */
export type SeatReservation = {
  id: string;
  seat_id: string;
  event_id: string;
  user_id?: string;
  session_id?: string;
  reservation_expires: string;
  status: "held" | "purchased" | "expired";
  created_at: string;
};

// ── Admin editor draft types ──

export type SeatingSectionDraft = {
  section_name: string;
  color: string;
  price_tier: string; // string for form input
  row_count: string;
  seats_per_row: string;
};

export type SeatingChartDraft = {
  name: string;
  venue_name: string;
  sections: SeatingSectionDraft[];
};

// ── Enriched types for API responses ──

/** Section with nested rows and seats for full chart rendering */
export type SeatingSectionFull = SeatingSection & {
  rows: (SeatingRow & { seats: SeatingSeat[] })[];
};

/** Full chart with all nested data */
export type SeatingChartFull = SeatingChart & {
  sections: SeatingSectionFull[];
};
