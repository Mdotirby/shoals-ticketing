/** Types for the drag-and-drop seating layout editor */

export type LayoutObjectType = "table" | "row" | "ga_section" | "stage" | "custom_zone";

export type LayoutObject = {
  id: string;
  layout_id: string;
  type: LayoutObjectType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  capacity: number;
  seat_count: number;
  price_tier: string;
  color: string;
  metadata: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type VenueLayout = {
  id: string;
  venue_id: string | null;
  name: string;
  background_image_url: string | null;
  canvas_width: number;
  canvas_height: number;
  created_at: string;
  updated_at: string;
};

/** Generated seat position for rendering */
export type SeatPosition = {
  x: number;
  y: number;
  label: string;
  seatIndex: number;
};

/** Color palette for price tiers */
export const PRICE_TIER_COLORS: Record<string, string> = {
  vip: "#ec4899",
  premium: "#f59e0b",
  standard: "#6366f1",
  economy: "#10b981",
  balcony: "#3b82f6",
  floor: "#ef4444",
  mezzanine: "#8b5cf6",
  pit: "#14b8a6",
};

/** Available price tiers */
export const PRICE_TIERS = [
  "vip",
  "premium",
  "standard",
  "economy",
  "balcony",
  "floor",
  "mezzanine",
  "pit",
];

/** Default properties for each object type */
export const OBJECT_DEFAULTS: Record<LayoutObjectType, Partial<LayoutObject>> = {
  table: {
    width: 100,
    height: 100,
    seat_count: 8,
    capacity: 8,
    label: "Table",
    price_tier: "standard",
    color: "#6366f1",
  },
  row: {
    width: 300,
    height: 40,
    seat_count: 10,
    capacity: 10,
    label: "Row A",
    price_tier: "standard",
    color: "#6366f1",
  },
  ga_section: {
    width: 200,
    height: 150,
    seat_count: 0,
    capacity: 100,
    label: "General Admission",
    price_tier: "economy",
    color: "#10b981",
  },
  stage: {
    width: 300,
    height: 100,
    seat_count: 0,
    capacity: 0,
    label: "Stage",
    price_tier: "standard",
    color: "#71717a",
  },
  custom_zone: {
    width: 150,
    height: 100,
    seat_count: 0,
    capacity: 0,
    label: "Zone",
    price_tier: "standard",
    color: "#8b5cf6",
  },
};

/** Tool definitions for the sidebar */
export const LAYOUT_TOOLS: { type: LayoutObjectType; label: string; icon: string; description: string }[] = [
  { type: "table", label: "Table", icon: "⬤", description: "Round table with seats" },
  { type: "row", label: "Row", icon: "━━━", description: "Straight row of seats" },
  { type: "ga_section", label: "GA Section", icon: "▬", description: "General admission zone" },
  { type: "stage", label: "Stage", icon: "▭", description: "Stage or performance area" },
  { type: "custom_zone", label: "Custom Zone", icon: "◇", description: "Custom labeled area" },
];
