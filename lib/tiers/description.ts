/**
 * A tier's buyer-facing description, split into the lines the storefront
 * shows.
 *
 * The field is a textarea: a VIP tier lists what it includes, one benefit per
 * line. One line renders as the plain note that used to read "Full event
 * access"; several render as a list.
 *
 * People type their own bullets — "- Early entry", "• Early entry",
 * "* Early entry" — because that is what a list looks like. The storefront
 * draws its own marker, so a typed one is stripped rather than doubled.
 */

/**
 * A leading bullet character, with the space after it or at the end of the
 * line. The `|$` matters: a bare "-" on its own line — which is what you get
 * typing a list and hitting Enter before writing the next benefit — would
 * otherwise survive as a literal "-" bullet on the storefront.
 *
 * It does not match "-5 degrees" or "Front-row", where the character is part
 * of the words: those have no space after the dash.
 */
const TYPED_BULLET = /^[-–—*•·▪](\s+|$)/;

export function tierDescriptionLines(description: string | null | undefined): string[] {
  if (!description) return [];
  return description
    .split(/\r?\n/)
    .map((line) => line.trim().replace(TYPED_BULLET, "").trim())
    // Blank lines are spacing in the editor, not empty bullets on the page.
    .filter((line) => line.length > 0);
}

/**
 * The single line to show when a tier has no description — the string that was
 * hardcoded on every tier of every show before this field existed.
 */
export const TIER_DESCRIPTION_FALLBACK = "Full event access";
