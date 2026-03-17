/**
 * SeatGenerator — auto-generate seat positions for tables and rows.
 * All positions are in FEET (real-world units).
 * The rendering layer converts feet → pixels.
 */

import { SeatPosition, LayoutObject, inchesToFeet } from "@/lib/types/layout";

/** Seat circle radius in feet (≈18 inch chair) */
export const SEAT_RADIUS_FT = 0.75;

/** Gap between table edge and seat center in feet */
const SEAT_GAP_FT = 1.2;

/**
 * Generate seat positions around a circular table.
 * Uses diameter_inches if set, otherwise falls back to width.
 */
export function generateTableSeats(obj: LayoutObject): SeatPosition[] {
  const seats: SeatPosition[] = [];
  const count = obj.seat_count || 8;

  // Table radius in feet
  const tableDiameterFt = obj.diameter_inches > 0
    ? inchesToFeet(obj.diameter_inches)
    : Math.min(obj.width, obj.height);
  const tableRadius = tableDiameterFt / 2;

  const centerX = obj.x + obj.width / 2;
  const centerY = obj.y + obj.height / 2;
  const orbitRadius = tableRadius + SEAT_GAP_FT;

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    seats.push({
      x: centerX + orbitRadius * Math.cos(angle),
      y: centerY + orbitRadius * Math.sin(angle),
      label: `${i + 1}`,
      seatIndex: i,
    });
  }

  return seats;
}

/**
 * Generate seat positions in a straight row.
 * Standard chair width is ~20 inches (1.67 ft).
 */
export function generateRowSeats(obj: LayoutObject): SeatPosition[] {
  const seats: SeatPosition[] = [];
  const count = obj.seat_count || 10;
  const spacing = count > 1 ? obj.width / (count - 1) : 0;
  const centerY = obj.y + obj.height / 2;

  for (let i = 0; i < count; i++) {
    seats.push({
      x: obj.x + (count > 1 ? i * spacing : obj.width / 2),
      y: centerY,
      label: `${i + 1}`,
      seatIndex: i,
    });
  }

  return seats;
}

/**
 * Generate seat positions for any layout object.
 * Returns empty array for objects that don't have individual seats.
 */
export function generateSeats(obj: LayoutObject): SeatPosition[] {
  switch (obj.type) {
    case "table":
      return generateTableSeats(obj);
    case "row":
      return generateRowSeats(obj);
    case "ga_section":
    case "stage":
    case "custom_zone":
    default:
      return [];
  }
}
