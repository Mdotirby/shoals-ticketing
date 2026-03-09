/**
 * Generate an SVG seating chart from AI-extracted seating JSON.
 *
 * Input: AI seating JSON with sections containing rows or tables.
 * Output: SVG string that renders responsively.
 */

type RowDef = { row: string; seats: number };
type TableDef = { table: string; seats: number };
type SectionDef = {
  name: string;
  type: "rows" | "tables";
  rows?: RowDef[];
  tables?: TableDef[];
};
type SeatingLayout = { sections: SectionDef[] };

const SECTION_COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6",
  "#ef4444", "#8b5cf6", "#14b8a6",
];

const SEAT_RADIUS = 10;
const SEAT_SPACING = 28;
const ROW_SPACING = 32;
const TABLE_RADIUS = 30;
const TABLE_SEAT_RADIUS = 10;
const TABLE_SEAT_ORBIT = 52;
const TABLE_SPACING_X = 140;
const TABLE_SPACING_Y = 140;
const SECTION_GAP = 60;
const LABEL_HEIGHT = 28;
const PADDING = 40;

export function generateSeatingSvg(layout: SeatingLayout): string {
  const elements: string[] = [];
  let yOffset = PADDING;
  let maxWidth = 0;

  for (let sIdx = 0; sIdx < layout.sections.length; sIdx++) {
    const section = layout.sections[sIdx];
    const color = SECTION_COLORS[sIdx % SECTION_COLORS.length];

    // Section label
    elements.push(
      `<text x="${PADDING}" y="${yOffset + 16}" fill="${color}" font-size="14" font-weight="700" font-family="system-ui, sans-serif">${escapeXml(section.name)}</text>`
    );
    yOffset += LABEL_HEIGHT;

    if (section.type === "rows" && section.rows) {
      for (const row of section.rows) {
        const rowWidth = row.seats * SEAT_SPACING;
        const startX = PADDING + 30; // offset for row label

        // Row label
        elements.push(
          `<text x="${PADDING + 12}" y="${yOffset + SEAT_RADIUS + 4}" fill="rgba(255,255,255,0.4)" font-size="11" font-weight="600" font-family="system-ui, sans-serif" text-anchor="end">${escapeXml(row.row)}</text>`
        );

        // Seats
        for (let s = 0; s < row.seats; s++) {
          const cx = startX + s * SEAT_SPACING + SEAT_RADIUS;
          const cy = yOffset + SEAT_RADIUS;
          elements.push(
            `<circle class="seat" cx="${cx}" cy="${cy}" r="${SEAT_RADIUS}" fill="${color}" opacity="0.8" data-section="${escapeXml(section.name)}" data-row="${escapeXml(row.row)}" data-seat="${s + 1}" style="cursor:pointer"><title>${escapeXml(section.name)} Row ${escapeXml(row.row)} Seat ${s + 1}</title></circle>`
          );
        }

        maxWidth = Math.max(maxWidth, startX + rowWidth + PADDING);
        yOffset += ROW_SPACING;
      }
    } else if (section.type === "tables" && section.tables) {
      const tablesPerRow = Math.min(section.tables.length, 4);
      const tableRows = Math.ceil(section.tables.length / tablesPerRow);

      for (let tRow = 0; tRow < tableRows; tRow++) {
        const startIdx = tRow * tablesPerRow;
        const endIdx = Math.min(startIdx + tablesPerRow, section.tables.length);

        for (let tIdx = startIdx; tIdx < endIdx; tIdx++) {
          const table = section.tables[tIdx];
          const col = tIdx - startIdx;
          const tableCx = PADDING + 80 + col * TABLE_SPACING_X;
          const tableCy = yOffset + TABLE_RADIUS + 10;

          // Table circle
          elements.push(
            `<circle cx="${tableCx}" cy="${tableCy}" r="${TABLE_RADIUS}" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="1.5" />`
          );

          // Table label
          elements.push(
            `<text x="${tableCx}" y="${tableCy + 4}" fill="${color}" font-size="11" font-weight="700" font-family="system-ui, sans-serif" text-anchor="middle">${escapeXml(table.table)}</text>`
          );

          // Seats around table
          for (let s = 0; s < table.seats; s++) {
            const angle = (2 * Math.PI * s) / table.seats - Math.PI / 2;
            const sx = tableCx + TABLE_SEAT_ORBIT * Math.cos(angle);
            const sy = tableCy + TABLE_SEAT_ORBIT * Math.sin(angle);
            elements.push(
              `<circle class="seat" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${TABLE_SEAT_RADIUS}" fill="${color}" opacity="0.8" data-section="${escapeXml(section.name)}" data-table="${escapeXml(table.table)}" data-seat="${s + 1}" style="cursor:pointer"><title>${escapeXml(section.name)} ${escapeXml(table.table)} Seat ${s + 1}</title></circle>`
            );
          }

          maxWidth = Math.max(maxWidth, tableCx + TABLE_SEAT_ORBIT + TABLE_SEAT_RADIUS + PADDING);
        }

        yOffset += TABLE_SPACING_Y;
      }
    }

    yOffset += SECTION_GAP;
  }

  const totalHeight = yOffset + PADDING;
  const totalWidth = Math.max(maxWidth, 400);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="100%" height="100%" style="max-width:${totalWidth}px;background:transparent;">
  <style>
    .seat:hover { opacity: 1; stroke: #fff; stroke-width: 2; }
  </style>
  ${elements.join("\n  ")}
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
