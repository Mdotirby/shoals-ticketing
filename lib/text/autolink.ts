/**
 * Finding the links in text somebody typed.
 *
 * Event and tier descriptions are plain text in a textarea — a URL pasted
 * into one has been rendering as dead characters. The Halloween on Court
 * description has carried a Google Form link nobody could click.
 *
 * This is the matcher only; it returns segments, and the component in
 * app/components/AutoLinkText.tsx turns them into elements. Split that way
 * because the matching is the part that can be wrong in a way that matters,
 * and it is testable without a DOM.
 *
 * SAFETY. The output of this is rendered on public pages from text anyone
 * with admin access typed. Two rules hold the line:
 *
 *   1. Only http, https and mailto ever become an href. A pasted
 *      "javascript:alert(1)" or "data:text/html,…" is returned as TEXT, so it
 *      renders as the characters it is and cannot be clicked into running.
 *   2. Nothing here produces HTML. Segments are data; the component builds
 *      React elements from them, so the text is escaped by React itself and
 *      dangerouslySetInnerHTML never appears.
 */

export type LinkSegment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

/**
 * Candidates, in precedence order: an explicit scheme, then a bare www host,
 * then an email. Scheme first so the "@" inside https://x.com/a@b does not
 * win and cut the URL in half.
 *
 * The character class stops at whitespace and at the quotes and angle
 * brackets that mean the author was wrapping the URL rather than typing it.
 */
const CANDIDATE = /(https?:\/\/[^\s<>"'`]+)|(\bwww\.[^\s<>"'`]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/gi;

/** Sentence punctuation that follows a URL rather than belonging to it. */
const TRAILING = `.,;:!?'"`;

/**
 * Trim what the sentence put there, not what the URL needs.
 *
 * "see https://example.com." should link example.com, not example.com with a
 * full stop inside it. But a closing bracket can genuinely be part of a URL
 * (Wikipedia is full of them), so one is only dropped when there is no
 * opening bracket earlier in the match to pair it with.
 */
function trimTrailing(raw: string): string {
  let out = raw;
  for (;;) {
    const last = out[out.length - 1];
    if (!last) break;
    if (TRAILING.includes(last)) { out = out.slice(0, -1); continue; }
    if (last === ")" || last === "]" || last === "}") {
      const open = last === ")" ? "(" : last === "]" ? "[" : "{";
      const opens = out.split(open).length - 1;
      const closes = out.split(last).length - 1;
      if (closes > opens) { out = out.slice(0, -1); continue; }
    }
    break;
  }
  return out;
}

/** A host with a dot and a plausible ending — not "www." or "a@b". */
const HAS_TLD = /\.[A-Za-z]{2,}(?:[/:?#]|$)/;

/**
 * The href for a matched candidate, or null to leave it as text.
 *
 * URL parsing is the check, not a regex: whatever the browser would resolve
 * is what gets vetted, and anything that is not http, https or mailto is
 * refused. That is what keeps a typed "javascript:" inert.
 */
function hrefFor(match: string, kind: "scheme" | "www" | "email"): string | null {
  if (kind === "email") return `mailto:${match}`;
  const candidate = kind === "www" ? `https://${match}` : match;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // A scheme with no host — "http://" alone, or "https:///path".
  if (!url.hostname || !url.hostname.includes(".")) return null;
  return url.toString();
}

/**
 * Split text into the runs that are links and the runs that are not.
 *
 * Always returns at least one segment for non-empty input, and joining every
 * segment's `text` reproduces the input exactly — nothing is dropped, so a
 * candidate that fails validation still renders, as the characters typed.
 */
export function linkSegments(text: string | null | undefined): LinkSegment[] {
  if (!text) return [];
  const out: LinkSegment[] = [];
  let cursor = 0;

  // A fresh regex each call: CANDIDATE is global and lastIndex is state.
  const re = new RegExp(CANDIDATE.source, "gi");
  let m: RegExpExecArray | null;

  const pushText = (s: string) => {
    if (!s) return;
    const prev = out[out.length - 1];
    if (prev && prev.kind === "text") prev.text += s;
    else out.push({ kind: "text", text: s });
  };

  while ((m = re.exec(text)) !== null) {
    const whole = m[0];
    const kind: "scheme" | "www" | "email" = m[1] ? "scheme" : m[2] ? "www" : "email";
    const trimmed = kind === "email" ? whole : trimTrailing(whole);
    const href = trimmed && (kind === "email" || HAS_TLD.test(trimmed)) ? hrefFor(trimmed, kind) : null;

    pushText(text.slice(cursor, m.index));
    if (href) {
      out.push({ kind: "link", text: trimmed, href });
      // Whatever trimTrailing took off is sentence punctuation, and belongs
      // in the text after the link.
      pushText(whole.slice(trimmed.length));
    } else {
      pushText(whole);
    }
    cursor = m.index + whole.length;

    // A zero-length match would spin forever. Cannot happen with these
    // alternatives, but the loop should not depend on that holding.
    if (re.lastIndex === m.index) re.lastIndex++;
  }

  pushText(text.slice(cursor));
  return out;
}

/**
 * The same text with its blank lines removed — for a clamped preview.
 *
 * The event description is clamped to three lines with a Read More under it.
 * Once blank lines render as blank lines, one of them costs a line of that
 * preview: Halloween on Court spent its third line on an empty one and hid
 * the link entirely behind the button. A blank line is air for the full
 * text; a three-line teaser has no room for air, so the preview keeps the
 * line structure and drops the gaps.
 */
export function withoutBlankLines(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .join("\n");
}

/** Whether there is anything to link — lets a caller skip the work. */
export function hasLink(text: string | null | undefined): boolean {
  return linkSegments(text).some((s) => s.kind === "link");
}
