/** Types for the drag-and-drop seating layout editor */

export type LayoutObjectType = "table" | "row" | "ga_section" | "stage" | "custom_zone";

/**
 * LayoutObject — all position/dimension values stored in FEET.
 * Tables additionally store diameter_inches for user convenience.
 */
export type LayoutObject = {
  id: string;
  layout_id: string;
  type: LayoutObjectType;
  /** Position X in feet from top-left of room */
  x: number;
  /** Position Y in feet from top-left of room */
  y: number;
  /** Width in feet */
  width: number;
  /** Height in feet */
  height: number;
  /** Table diameter in inches (tables only, 0 for others) */
  diameter_inches: number;
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

/**
 * VenueLayout — the overall layout with room dimensions in feet.
 */
export type VenueLayout = {
  id: string;
  venue_id: string | null;
  name: string;
  background_image_url: string | null;
  /** Room width in feet */
  room_width_ft: number;
  /** Room height in feet */
  room_height_ft: number;
  /** Pixels per foot for rendering */
  scale_pixels_per_foot: number;
  canvas_width: number;
  canvas_height: number;
  created_at: string;
  updated_at: string;
};

/** Generated seat position for rendering (in feet) */
export type SeatPosition = {
  x: number;
  y: number;
  label: string;
  seatIndex: number;
};

/** Snap guide line for alignment rendering */
export type SnapGuide = {
  type: "horizontal" | "vertical";
  position: number; // in feet
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

/** Default pixels per foot */
export const DEFAULT_PPF = 10;

/** Default properties for each object type — dimensions in FEET */
export const OBJECT_DEFAULTS: Record<LayoutObjectType, Partial<LayoutObject>> = {
  table: {
    width: 5,       // 5 ft (60 inches)
    height: 5,
    diameter_inches: 60,
    seat_count: 8,
    capacity: 8,
    label: "Table",
    price_tier: "standard",
    color: "#6366f1",
  },
  row: {
    width: 20,      // 20 ft row
    height: 3,
    diameter_inches: 0,
    seat_count: 10,
    capacity: 10,
    label: "Row A",
    price_tier: "standard",
    color: "#6366f1",
  },
  ga_section: {
    width: 20,
    height: 15,
    diameter_inches: 0,
    seat_count: 0,
    capacity: 100,
    label: "General Admission",
    price_tier: "economy",
    color: "#10b981",
  },
  stage: {
    width: 30,
    height: 10,
    diameter_inches: 0,
    seat_count: 0,
    capacity: 0,
    label: "Stage",
    price_tier: "standard",
    color: "#71717a",
  },
  custom_zone: {
    width: 15,
    height: 10,
    diameter_inches: 0,
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

/** Convert inches to feet */
export function inchesToFeet(inches: number): number {
  return inches / 12;
}

/** Convert feet to inches */
export function feetToInches(feet: number): number {
  return feet * 12;
}
