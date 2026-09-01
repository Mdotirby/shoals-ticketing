/**
 * SuccessHeader — the checkmark badge + "You're In." headline + confirmation
 * copy + thank-you line at the top of Checkout Success (checkout_success.png,
 * .success-head). The thank-you paragraph isn't in the mockup — it's a real
 * kept feature (see page.tsx's HOTEL_PARTNER-style comment block) — moved up
 * here from further down the page and given a real class instead of an
 * inline style, per the "restyle in glass" instruction for the four kept
 * sections.
 */
export function SuccessHeader({
  eventTitle,
  email,
  quantity,
}: {
  eventTitle?: string;
  email?: string;
  quantity: number;
}) {
  return (
    <div className="cs-header">
      <div className="checkout-success-icon cs-check" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
          <path
            d="M5 13.5 L10.5 19 L21 7"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="checkout-success-heading">You&apos;re In.</h2>

      <p className="checkout-success-text cs-lede">
        {eventTitle ? (
          <>
            Your spot for <strong>{eventTitle}</strong> is locked in.
          </>
        ) : (
          <>Your spot is locked in.</>
        )}{" "}
        {email ? (
          <>
            A confirmation and your {quantity > 1 ? "tickets are" : "ticket is"} headed to{" "}
            <strong>{email}</strong> — try not to lose them before the show.
          </>
        ) : (
          <>Your {quantity > 1 ? "tickets are" : "ticket is"} on the way by email.</>
        )}
      </p>

      <p className="checkout-success-thankyou">
        Thank you for your purchase. We can&apos;t wait to see you there — get ready for an unforgettable night!
      </p>
    </div>
  );
}
