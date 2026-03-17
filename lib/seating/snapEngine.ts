/**
 * SnapEngine — handles grid snapping and center alignment for layout objects.
 * All values are in FEET (real-world units).
 */

import { LayoutObject, SnapGuide } from "@/lib/types/layout";

/** Snap threshold in feet */
const SNAP_THRESHOLD_FT = 0.8;

/** Grid spacing in feet */
export const GRID_SPACING_FT = 1;

type SnapResult = {
  x: number;
  y: number;
  guides: SnapGuide[];
};

/**
 * Snap a position to grid and/or center alignment with other objects.
 * Returns the snapped position and any active guide lines.
 */
export function snapPosition(
  objId: string,
  rawX: number,
  rawY: number,
  objWidth: number,
  objHeight: number,
  allObjects: LayoutObject[],
  gridSpacing: number = GRID_SPACING_FT
): SnapResult {
  let x = rawX;
  let y = rawY;
  const guides: SnapGuide[] = [];

  // Object center
  const cx = rawX + objWidth / 2;
  const cy = rawY + objHeight / 2;

  // Object edges
  const right = rawX + objWidth;
  const bottom = rawY + objHeight;

  // 1. Snap to grid
  const gridSnappedX = Math.round(rawX / gridSpacing) * gridSpacing;
  const gridSnappedY = Math.round(rawY / gridSpacing) * gridSpacing;

  if (Math.abs(rawX - gridSnappedX) < SNAP_THRESHOLD_FT) {
    x = gridSnappedX;
  }
  if (Math.abs(rawY - gridSnappedY) < SNAP_THRESHOLD_FT) {
    y = gridSnappedY;
  }

  // 2. Snap to center alignment with other objects
  const others = allObjects.filter((o) => o.id !== objId);

  for (const other of others) {
    const otherCx = other.x + other.width / 2;
    const otherCy = other.y + other.height / 2;
    const otherRight = other.x + other.width;
    const otherBottom = other.y + other.height;

    // Vertical center alignment (x-axis centers match)
    if (Math.abs(cx - otherCx) < SNAP_THRESHOLD_FT) {
      x = otherCx - objWidth / 2;
      guides.push({ type: "vertical", position: otherCx });
    }

    // Horizontal center alignment (y-axis centers match)
    if (Math.abs(cy - otherCy) < SNAP_THRESHOLD_FT) {
      y = otherCy - objHeight / 2;
      guides.push({ type: "horizontal", position: otherCy });
    }

    // Left edge alignment
    if (Math.abs(rawX - other.x) < SNAP_THRESHOLD_FT) {
      x = other.x;
      guides.push({ type: "vertical", position: other.x });
    }

    // Right edge alignment
    if (Math.abs(right - otherRight) < SNAP_THRESHOLD_FT) {
      x = otherRight - objWidth;
      guides.push({ type: "vertical", position: otherRight });
    }

    // Top edge alignment
    if (Math.abs(rawY - other.y) < SNAP_THRESHOLD_FT) {
      y = other.y;
      guides.push({ type: "horizontal", position: other.y });
    }

    // Bottom edge alignment
    if (Math.abs(bottom - otherBottom) < SNAP_THRESHOLD_FT) {
      y = otherBottom - objHeight;
      guides.push({ type: "horizontal", position: otherBottom });
    }
  }

  return { x, y, guides };
}
