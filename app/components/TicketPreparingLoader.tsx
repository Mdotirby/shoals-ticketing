"use client";

/**
 * The hand-off between "payment succeeded" and the confirmation page.
 *
 * The order and its ticket are created by the Stripe webhook asynchronously,
 * so there is a real wait here — a second or three, occasionally longer. This
 * fills it with something that reads as progress rather than a frozen screen,
 * which is the moment a buyer is most likely to hit back or refresh.
 *
 * The bar is deliberately indeterminate: we cannot know how far along the
 * webhook is, and a bar that claims a percentage it doesn't have would be a
 * lie that stalls at 90%. It sweeps instead, and the label pulses.
 */
export default function TicketPreparingLoader({
  label = "Preparing your tickets…",
  sublabel,
}: {
  label?: string;
  sublabel?: string;
}) {
  return (
    <div className="tpl" role="status" aria-live="polite">
      <p className="tpl-label">{label}</p>
      <div
        className="tpl-track"
        role="progressbar"
        aria-label={label}
        // No aria-valuenow: this is an indeterminate bar, and announcing a
        // fabricated value to a screen reader is worse than announcing none.
      >
        <span className="tpl-fill" />
      </div>
      {sublabel && <p className="tpl-sublabel">{sublabel}</p>}
    </div>
  );
}
