/** Seating System V3 — Clean Types */

export type SectionType = "table" | "row" | "ga";
export type ObjectType = "table_group" | "row_block" | "ga_zone" | "stage" | "label";
export type SeatStatus = "available" | "held" | "sold";

export type VenueLayout = {
  id: string;
  venue_id: string | null;
  name: string;
  room_width_ft: number;
  room_height_ft: number;
  created_at: string;
};

export type Section = {
  id: string;
  layout_id: string;
  name: string;
  type: SectionType;
  price_cents: number;
  color: string;
  created_at: string;
};

export type LayoutObject = {
  id: string;
  section_id: string;
  type: ObjectType;
  x_ft: number;
  y_ft: number;
  width_ft: number;
  height_ft: number;
  rotation: number;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Seat = {
  id: string;
  section_id: string;
  object_id: string;
  row_label: string;
  seat_number: number;
  x_ft: number;
  y_ft: number;
  status: SeatStatus;
  held_until?: string | null;
  held_session?: string | null;
  order_id?: string | null;
  created_at: string;
};

export type EventLayoutMap = {
  id: string;
  event_id: string;
  layout_id: string;
  enabled: boolean;
  created_at: string;
};

/** Section with nested objects and seats for full rendering */
export type SectionFull = Section & {
  objects: LayoutObject[];
  seats: Seat[];
};

/** Seat with section info for customer display */
export type SeatWithSection = Seat & {
  section_name: string;
  section_color: string;
  price_cents: number;
};

/** Full layout with all data */
export type LayoutFull = VenueLayout & {
  sections: SectionFull[];
};

/** Section colors */
export const SECTION_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#8b5cf6", "#14b8a6", "#f97316", "#06b6d4",
];

/** Pixels per foot for rendering */
export const PPF = 10;
