/**
 * Quick Build Engine — generates complete seating layouts instantly.
 * Pure math, zero API calls, deterministic, runs client-side.
 */

import { SECTION_COLORS } from "./types";

export type EventType = "theater" | "tables_ga" | "full_tables";
export type StagePosition = "top" | "bottom";

export type QuickBuildConfig = {
  layoutName: string;
  eventType: EventType;
  roomWidthFt: number;
  roomDepthFt: number;
  stagePosition: StagePosition;
  // Tables config
  numberOfTables: number;
  seatsPerTable: number;
  tableDiameterInches: number;
  tableSpacingFt: number;
  tablePriceCents: number;
  // Rows config (theater)
  numberOfRows: number;
  seatsPerRow: number;
  rowSpacingFt: number;
  seatSpacingFt: number;
  rowPriceCents: number;
  // GA config
  gaCapacity: number;
  gaPriceCents: number;
};

// Generated data ready for saving
export type GeneratedSection = {
  _id: string;
  name: string;
  type: "table" | "row" | "ga";
  price_cents: number;
  color: string;
};

export type GeneratedObject = {
  _id: string;
  _sectionId: string;
  type: "table_group" | "row_block" | "ga_zone" | "stage";
  x_ft: number;
  y_ft: number;
  width_ft: number;
  height_ft: number;
  rotation: number;
  metadata: Record<string, unknown>;
};

export type GeneratedSeat = {
  _sectionId: string;
  _objectId: string;
  row_label: string;
  seat_number: number;
  x_ft: number;
  y_ft: number;
};

export type QuickBuildResult = {
  layout: { name: string; room_width_ft: number; room_height_ft: number };
  sections: GeneratedSection[];
  objects: GeneratedObject[];
  seats: GeneratedSeat[];
  stats: { totalSeats: number; totalCapacity: number; generationMs: number };
};

let _counter = 0;
function tempId(): string {
  _counter++;
  return `_qb_${_counter}_${Date.now().toString(36)}`;
}

/**
 * Generate a complete seating layout from config.
 * Runs synchronously, instant (<100ms for 500 seats).
 */
export function quickBuild(config: QuickBuildConfig): QuickBuildResult {
  const start = performance.now();
  _counter = 0;

  const sections: GeneratedSection[] = [];
  const objects: GeneratedObject[] = [];
  const seats: GeneratedSeat[] = [];

  const stageY = config.stagePosition === "top" ? 2 : config.roomDepthFt - 8;
  const stageH = 6;
  const contentStartY = config.stagePosition === "top" ? stageY + stageH + 4 : 4;
  const contentEndY = config.stagePosition === "bottom" ? stageY - 4 : config.roomDepthFt - 2;
  const availableDepth = contentEndY - contentStartY;

  // Stage object (no section — it's decorative)
  const stageSectionId = tempId();
  sections.push({
    _id: stageSectionId,
    name: "Stage",
    type: "ga",
    price_cents: 0,
    color: "#71717a",
  });
  objects.push({
    _id: tempId(),
    _sectionId: stageSectionId,
    type: "stage",
    x_ft: config.roomWidthFt * 0.1,
    y_ft: stageY,
    width_ft: config.roomWidthFt * 0.8,
    height_ft: stageH,
    rotation: 0,
    metadata: { label: "STAGE" },
  });

  if (config.eventType === "theater") {
    // Theater layout: all rows
    buildRows(config, sections, objects, seats, contentStartY, availableDepth);
  } else if (config.eventType === "tables_ga") {
    // Hybrid: tables first, then GA behind
    const tablesDepth = buildTables(config, sections, objects, seats, contentStartY);
    buildGA(config, sections, objects, contentStartY + tablesDepth + 6, contentEndY);
  } else if (config.eventType === "full_tables") {
    // All tables
    buildTables(config, sections, objects, seats, contentStartY);
  }

  const totalSeats = seats.length;
  const gaSection = sections.find((s) => s.type === "ga" && s.name !== "Stage");
  const gaCap = gaSection ? config.gaCapacity : 0;
  const totalCapacity = totalSeats + gaCap;

  return {
    layout: { name: config.layoutName, room_width_ft: config.roomWidthFt, room_height_ft: config.roomDepthFt },
    sections,
    objects,
    seats,
    stats: {
      totalSeats,
      totalCapacity,
      generationMs: Math.round(performance.now() - start),
    },
  };
}

function buildTables(
  config: QuickBuildConfig,
  sections: GeneratedSection[],
  objects: GeneratedObject[],
  seats: GeneratedSeat[],
  startY: number,
): number {
  const tableDiamFt = config.tableDiameterInches / 12;
  const seatGap = 1.5;
  const orbitR = tableDiamFt / 2 + seatGap;
  const cellSize = config.tableSpacingFt;
  const margin = 5;

  // Calculate grid
  const usableWidth = config.roomWidthFt - margin * 2;
  const tablesPerRow = Math.max(1, Math.floor(usableWidth / cellSize));
  const rowsNeeded = Math.ceil(config.numberOfTables / tablesPerRow);

  const sectionId = tempId();
  sections.push({
    _id: sectionId,
    name: "VIP Tables",
    type: "table",
    price_cents: config.tablePriceCents,
    color: SECTION_COLORS[0],
  });

  for (let i = 0; i < config.numberOfTables; i++) {
    const col = i % tablesPerRow;
    const row = Math.floor(i / tablesPerRow);
    // Center tables in row
    const tablesInThisRow = Math.min(tablesPerRow, config.numberOfTables - row * tablesPerRow);
    const rowOffset = (usableWidth - tablesInThisRow * cellSize) / 2;

    const cx = margin + rowOffset + col * cellSize + cellSize / 2;
    const cy = startY + row * cellSize + cellSize / 2;

    const objectId = tempId();
    objects.push({
      _id: objectId,
      _sectionId: sectionId,
      type: "table_group",
      x_ft: cx - tableDiamFt / 2,
      y_ft: cy - tableDiamFt / 2,
      width_ft: tableDiamFt,
      height_ft: tableDiamFt,
      rotation: 0,
      metadata: { table_number: i + 1, diameter_inches: config.tableDiameterInches, seats_per_table: config.seatsPerTable },
    });

    for (let s = 0; s < config.seatsPerTable; s++) {
      const angle = (2 * Math.PI * s) / config.seatsPerTable - Math.PI / 2;
      seats.push({
        _sectionId: sectionId,
        _objectId: objectId,
        row_label: `T${i + 1}`,
        seat_number: s + 1,
        x_ft: parseFloat((cx + orbitR * Math.cos(angle)).toFixed(2)),
        y_ft: parseFloat((cy + orbitR * Math.sin(angle)).toFixed(2)),
      });
    }
  }

  return rowsNeeded * cellSize;
}

function buildRows(
  config: QuickBuildConfig,
  sections: GeneratedSection[],
  objects: GeneratedObject[],
  seats: GeneratedSeat[],
  startY: number,
  availableDepth: number,
): void {
  const margin = 5;
  const sectionId = tempId();
  sections.push({
    _id: sectionId,
    name: "Reserved Rows",
    type: "row",
    price_cents: config.rowPriceCents,
    color: SECTION_COLORS[2],
  });

  const actualRows = Math.min(config.numberOfRows, Math.floor(availableDepth / config.rowSpacingFt));
  const totalRowWidth = (config.seatsPerRow - 1) * config.seatSpacingFt;
  const rowStartX = Math.max(margin, (config.roomWidthFt - totalRowWidth) / 2);

  for (let r = 0; r < actualRows; r++) {
    const rowLabel = String.fromCharCode(65 + r);
    const rowY = startY + r * config.rowSpacingFt;

    const objectId = tempId();
    objects.push({
      _id: objectId,
      _sectionId: sectionId,
      type: "row_block",
      x_ft: rowStartX,
      y_ft: rowY - 1,
      width_ft: totalRowWidth,
      height_ft: 2,
      rotation: 0,
      metadata: { row_label: rowLabel, seats_per_row: config.seatsPerRow },
    });

    for (let s = 0; s < config.seatsPerRow; s++) {
      seats.push({
        _sectionId: sectionId,
        _objectId: objectId,
        row_label: rowLabel,
        seat_number: s + 1,
        x_ft: parseFloat((rowStartX + s * config.seatSpacingFt).toFixed(2)),
        y_ft: parseFloat(rowY.toFixed(2)),
      });
    }
  }
}

function buildGA(
  config: QuickBuildConfig,
  sections: GeneratedSection[],
  objects: GeneratedObject[],
  startY: number,
  endY: number,
): void {
  const gaHeight = Math.max(10, endY - startY);
  const margin = 3;

  const sectionId = tempId();
  sections.push({
    _id: sectionId,
    name: "General Admission",
    type: "ga",
    price_cents: config.gaPriceCents,
    color: SECTION_COLORS[3],
  });

  objects.push({
    _id: tempId(),
    _sectionId: sectionId,
    type: "ga_zone",
    x_ft: margin,
    y_ft: startY,
    width_ft: config.roomWidthFt - margin * 2,
    height_ft: gaHeight,
    rotation: 0,
    metadata: { capacity: config.gaCapacity },
  });
}

/** Default config for each event type */
export function getDefaultConfig(type: EventType): Partial<QuickBuildConfig> {
  switch (type) {
    case "theater":
      return {
        numberOfRows: 15, seatsPerRow: 20, rowSpacingFt: 3, seatSpacingFt: 1.8,
        rowPriceCents: 2500, numberOfTables: 0, gaCapacity: 0,
      };
    case "tables_ga":
      return {
        numberOfTables: 15, seatsPerTable: 8, tableDiameterInches: 72,
        tableSpacingFt: 10, tablePriceCents: 5000, gaCapacity: 200, gaPriceCents: 2000,
        numberOfRows: 0,
      };
    case "full_tables":
      return {
        numberOfTables: 25, seatsPerTable: 8, tableDiameterInches: 72,
        tableSpacingFt: 10, tablePriceCents: 5000, gaCapacity: 0, numberOfRows: 0,
      };
  }
}
