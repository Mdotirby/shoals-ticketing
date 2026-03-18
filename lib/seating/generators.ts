/**
 * Seat Generators — create objects and seats for tables, rows, and GA sections.
 * All coordinates in FEET. These return data ready to insert into Supabase.
 */

type GeneratedObject = {
  type: string;
  x_ft: number;
  y_ft: number;
  width_ft: number;
  height_ft: number;
  rotation: number;
  metadata: Record<string, unknown>;
};

type GeneratedSeat = {
  row_label: string;
  seat_number: number;
  x_ft: number;
  y_ft: number;
  /** Which generated object index this seat belongs to */
  _objectIndex: number;
};

export type GeneratorResult = {
  objects: GeneratedObject[];
  seats: GeneratedSeat[];
};

/**
 * TOOL 1: TABLE GENERATOR
 * Creates evenly spaced round tables with seats orbiting each table.
 */
export function generateTables(opts: {
  numberOfTables: number;
  seatsPerTable: number;
  tableDiameterInches: number;
  spacingFt: number;
  startX: number;
  startY: number;
}): GeneratorResult {
  const { numberOfTables, seatsPerTable, tableDiameterInches, spacingFt, startX, startY } = opts;
  const tableDiameterFt = tableDiameterInches / 12;
  const tableRadius = tableDiameterFt / 2;
  const seatGap = 1.2; // gap from table edge to seat center
  const orbitRadius = tableRadius + seatGap;

  const cols = Math.ceil(Math.sqrt(numberOfTables));
  const cellSize = tableDiameterFt + spacingFt;

  const objects: GeneratedObject[] = [];
  const seats: GeneratedSeat[] = [];

  for (let i = 0; i < numberOfTables; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = startX + col * cellSize + tableDiameterFt / 2;
    const cy = startY + row * cellSize + tableDiameterFt / 2;

    objects.push({
      type: "table_group",
      x_ft: cx - tableDiameterFt / 2,
      y_ft: cy - tableDiameterFt / 2,
      width_ft: tableDiameterFt,
      height_ft: tableDiameterFt,
      rotation: 0,
      metadata: {
        table_number: i + 1,
        diameter_inches: tableDiameterInches,
        seats_per_table: seatsPerTable,
      },
    });

    for (let s = 0; s < seatsPerTable; s++) {
      const angle = (2 * Math.PI * s) / seatsPerTable - Math.PI / 2;
      seats.push({
        row_label: `T${i + 1}`,
        seat_number: s + 1,
        x_ft: parseFloat((cx + orbitRadius * Math.cos(angle)).toFixed(2)),
        y_ft: parseFloat((cy + orbitRadius * Math.sin(angle)).toFixed(2)),
        _objectIndex: i,
      });
    }
  }

  return { objects, seats };
}

/**
 * TOOL 2: ROW GENERATOR (Theater style)
 * Creates rows of seats with proper labeling (A, B, C...).
 */
export function generateRows(opts: {
  numberOfRows: number;
  seatsPerRow: number;
  rowSpacingFt: number;
  seatSpacingFt: number;
  aislePositions: number[]; // seat indices where aisle gaps go
  startX: number;
  startY: number;
}): GeneratorResult {
  const { numberOfRows, seatsPerRow, rowSpacingFt, seatSpacingFt, aislePositions, startX, startY } = opts;
  const aisleWidth = 2; // 2ft aisle gap

  const objects: GeneratedObject[] = [];
  const seats: GeneratedSeat[] = [];

  for (let r = 0; r < numberOfRows; r++) {
    const rowLabel = String.fromCharCode(65 + r); // A, B, C...
    const rowY = startY + r * rowSpacingFt;

    // Calculate total row width including aisles
    const aisleCount = aislePositions.length;
    const totalWidth = (seatsPerRow - 1) * seatSpacingFt + aisleCount * aisleWidth;

    objects.push({
      type: "row_block",
      x_ft: startX,
      y_ft: rowY - 1,
      width_ft: totalWidth,
      height_ft: 2,
      rotation: 0,
      metadata: {
        row_label: rowLabel,
        seats_per_row: seatsPerRow,
      },
    });

    let xOffset = 0;
    for (let s = 0; s < seatsPerRow; s++) {
      // Add aisle gap if this seat index is an aisle position
      if (aislePositions.includes(s) && s > 0) {
        xOffset += aisleWidth;
      }

      seats.push({
        row_label: rowLabel,
        seat_number: s + 1,
        x_ft: parseFloat((startX + xOffset).toFixed(2)),
        y_ft: parseFloat(rowY.toFixed(2)),
        _objectIndex: r,
      });

      xOffset += seatSpacingFt;
    }
  }

  return { objects, seats };
}

/**
 * TOOL 3: GA ZONE
 * Creates a general admission zone — no individual seats.
 */
export function generateGA(opts: {
  capacity: number;
  x: number;
  y: number;
  widthFt: number;
  heightFt: number;
}): GeneratorResult {
  return {
    objects: [{
      type: "ga_zone",
      x_ft: opts.x,
      y_ft: opts.y,
      width_ft: opts.widthFt,
      height_ft: opts.heightFt,
      rotation: 0,
      metadata: { capacity: opts.capacity },
    }],
    seats: [],
  };
}
