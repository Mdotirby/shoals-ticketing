/**
 * A tier's buyer-facing description, as the blocks the storefront draws.
 *
 * WHAT CHANGED, AND WHY
 *
 * This used to bullet every line and throw blank lines away. That is
 * backwards: it stripped the dash you typed and added a marker to everything,
 * so a description with a heading, a list and a footnote came out as one
 * undifferentiated list. The Downtown Florence pass reads
 *
 *   Applies to the following places: FLOBAMA | LAVA ROOM | …
 *   - Waived Cover
 *   - Skip the entry line (N/A at Chicago Cafe)
 *   - 20% off all food items
 *   - Satin Wristband
 *
 *   Must be 21+ | ID to be verified at each establishment
 *
 * and every one of those seven lines was rendering as a bullet, with the
 * blank line before the footnote dropped.
 *
 * So: a dash makes a bullet, and nothing else does. A blank line is a blank
 * line. What is typed is what is shown.
 */

/**
 * A line that opens with one of these, and a space, is a bullet. The marker
 * is stripped because the page draws its own.
 *
 * It does not match "-5 degrees" or "Front-row", where the character is part
 * of the word: no space after it. A marker alone on a line is an empty
 * bullet, which is spacing, so it is treated as blank.
 */
const BULLET_MARKER = /^[-–—*•·▪](\s+|$)/;

export type TierDescriptionBlock =
  /** Consecutive dashed lines, grouped into one list. */
  | { kind: "bullets"; items: string[] }
  /** A line of ordinary prose — a heading, a sentence, a footnote. */
  | { kind: "text"; text: string }
  /** A blank line the author left for air. */
  | { kind: "space" };

export function tierDescriptionBlocks(
  description: string | null | undefined,
): TierDescriptionBlock[] {
  if (!description) return [];

  const blocks: TierDescriptionBlock[] = [];
  for (const raw of description.split(/\r?\n/)) {
    const line = raw.trim();

    if (line === "") {
      blocks.push({ kind: "space" });
      continue;
    }

    if (BULLET_MARKER.test(line)) {
      const item = line.replace(BULLET_MARKER, "").trim();
      // A marker with nothing after it is an empty bullet — air, not an item.
      if (item === "") { blocks.push({ kind: "space" }); continue; }

      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === "bullets") prev.items.push(item);
      else blocks.push({ kind: "bullets", items: [item] });
      continue;
    }

    blocks.push({ kind: "text", text: line });
  }

  // Space at either end is an accident of typing — a trailing newline, or a
  // paste that began with one — not a gap anybody asked for.
  while (blocks[0]?.kind === "space") blocks.shift();
  while (blocks[blocks.length - 1]?.kind === "space") blocks.pop();

  return blocks;
}

/**
 * True when the whole description is a single plain line.
 *
 * That case renders as the one-line note the tier row has always had, so a
 * tier with nothing but "Standing room, doors at 7" looks exactly as it did.
 */
export function isSingleLineDescription(blocks: TierDescriptionBlock[]): boolean {
  return blocks.length === 1 && blocks[0].kind === "text";
}

/**
 * The single line to show when a tier has no description — the string that was
 * hardcoded on every tier of every show before this field existed.
 */
export const TIER_DESCRIPTION_FALLBACK = "Full event access";
