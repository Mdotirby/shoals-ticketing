"use client";

/**
 * What the buyer reads under a tier name on the storefront.
 *
 * A textarea, not an input, because this is where a VIP tier lists what it
 * actually includes — one benefit per line, Enter for the next. It grows with
 * what is typed rather than scrolling inside a fixed box, so the whole thing
 * is visible while it is being written.
 *
 * Shared by the three places a tier is built (the hub's Tickets & pricing,
 * Create a show, the event edit form) so the limit, the placeholder and the
 * line handling cannot drift between them.
 *
 * Lines are rendered on the storefront as a list when there is more than one
 * — see TIER_DESC_MAX and app/components/OrderSummary.tsx.
 */

import { useCallback, useLayoutEffect, useRef } from "react";
export { TIER_DESCRIPTION_FALLBACK } from "@/lib/tiers/description";

/**
 * Generous but not unbounded. The column is `text`, so this is a layout
 * limit, not a storage one: it is roughly 100 words, which is a full benefits
 * list and still fits a tier card without turning the ticket picker into an
 * essay. The counter only appears near the end.
 */
export const TIER_DESC_MAX = 600;

/**
 * One line, deliberately. A worked multi-line example reads better, but the
 * box sizes itself against the placeholder when the field is empty, so a
 * four-line example gave every undescribed tier a four-line box — 72px of
 * hint on each row of a list where most tiers say nothing. This says the two
 * things that matter: what goes in it, and that Enter starts the next one.
 */
const PLACEHOLDER = "What this tier includes — Enter for each new line";

export default function TierDescriptionField({
  value,
  onChange,
  className,
  label = "Buyer sees",
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  /** The wrapper class — each screen styles its own row. */
  className: string;
  label?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Height follows the content. Reset to auto first or it can only ever grow:
  // scrollHeight is measured against the current height, so a deleted line
  // would leave the box tall forever.
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  // Layout effect, not effect: sizing after paint shows one frame of a
  // one-line box before it jumps to full height on a tier that already has
  // four lines saved.
  useLayoutEffect(fit, [fit, value]);

  const left = TIER_DESC_MAX - value.length;

  return (
    <label className={className}>
      <span>{label}</span>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={PLACEHOLDER}
        maxLength={TIER_DESC_MAX}
        onChange={(e) => onChange(e.target.value)}
        onInput={fit}
        aria-label="What the buyer reads under the tier name"
      />
      {/* Only once it is close. A counter on an empty field is a warning
          about a limit nobody was going to hit. */}
      {left <= 80 && (
        <small className={left <= 0 ? "is-full" : undefined}>
          {left > 0 ? `${left} left` : "Full"}
        </small>
      )}
    </label>
  );
}
