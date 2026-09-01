/**
 * ActionRow — the two buttons below the order panel (checkout_success.png,
 * .action-row). Exactly two actions, not three — no "Add to Apple Wallet"
 * button: that needs Apple Developer Program enrollment + a Pass Type ID
 * certificate to generate real .pkpass files, which isn't set up. Add a
 * third button back only once that's actually wired.
 *
 * Takes hrefs rather than onClick handlers (the reference version's shape)
 * so "View My Tickets" stays a real Next <Link> — prefetching, no JS
 * click-handler indirection for a plain navigation — and "Add to Calendar"
 * stays a real download link. ticketHref === null renders the same
 * disabled-look pending state the live page already had while the webhook
 * is still creating the ticket.
 */
import Link from "next/link";

export function ActionRow({
  ticketHref,
  ticketLabel,
  calendarHref,
  calendarFilename,
}: {
  ticketHref: string | null;
  ticketLabel: string;
  calendarHref?: string;
  calendarFilename?: string;
}) {
  return (
    <div className="cs-actions">
      {ticketHref ? (
        <Link href={ticketHref} className="lg-btn lg-btn--lg lg-btn--primary">
          {ticketLabel}
        </Link>
      ) : (
        <span className="lg-btn lg-btn--lg lg-btn--pending" aria-hidden="true">
          {ticketLabel}
        </span>
      )}

      {calendarHref && (
        <a className="lg-btn lg-btn--lg lg-btn--outline" href={calendarHref} download={calendarFilename}>
          Add to Calendar
        </a>
      )}
    </div>
  );
}
