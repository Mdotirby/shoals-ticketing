/**
 * SeatGenerator — auto-generate seat positions for tables and rows.
 * Used by the seating editor canvas to render individual seats.
 */

import { SeatPosition, LayoutObject } from "@/lib/types/layout";

/**
 * Generate seat positions around a circular table.
 * Seats are distributed evenly in a circle around the table center.
 */
export function generateTableSeats(obj: LayoutObject): SeatPosition[] {
  const seats: SeatPosition[] = [];
  const count = obj.seat_count || 8;
  const centerX = obj.x + obj.width / 2;
  const centerY = obj.y + obj.height / 2;
  const orbitRadius = Math.min(obj.width, obj.height) / 2 + 12;

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
 * Seats are distributed evenly along the width of the row.
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
 * Returns empty array for objects that don't have individual seats (GA, stage, zones).
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
