"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { useSearchParams, useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  PaymentRequestButtonElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { PaymentRequest } from "@stripe/stripe-js";
import SfHeader from "@/app/components/SfHeader";
import SfFooter from "@/app/components/SfFooter";
import SfStepper from "@/app/components/SfStepper";
import { trackFbEvent } from "@/lib/fbq";
import { useOperator } from "@/app/components/OperatorContext";
import { safeDate, formatEventDateFull } from "@/lib/dates";
import { getStoredUtmParams } from "@/lib/clientAttribution";
import { stripeAppearance } from "@/lib/stripeAppearance";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ── Payment step — raw Elements + PaymentIntent, styled via the shared
// stripeAppearance config so the card fields actually match the rest of the
// dark page instead of Stripe's un-themeable Embedded Checkout default. ──
function CheckoutPaymentForm({
  clientSecret,
  paymentIntentId,
  buyerName,
  buyerEmail,
  buyerPhone,
  buyerZip,
  payLabel,
  walletLabel,
  totalCents,
}: {
  clientSecret: string;
  paymentIntentId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerZip: string;
  /** Mockup's CTA reads "Pay $29.01" rather than a generic label. */
  payLabel: string;
  /** Line item shown in the Apple Pay / Google Pay sheet. */
  walletLabel: string;
  /** Authoritative total in cents, from the PaymentIntent the server created.
   *  Never derived client-side — see the comment on the effect below. */
  totalCents: number;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);

  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

  /* ── Apple Pay / Google Pay ────────────────────────────────────────────
   * Wired against the PaymentIntent the server has ALREADY created, rather
   * than against a total computed here.
   *
   * That is the whole design constraint. The wallet sheet shows the buyer an
   * amount and then charges it, so the figure in `total` must be the figure
   * Stripe settles. This route only fetches /api/events/{id}, which returns
   * tax_method and fees_included_in_price but NOT the fee amounts — those live
   * on the venue / event_venue rows. Recomputing the total from a partial fee
   * picture is exactly how a wallet ends up displaying $40.00 and charging
   * $57.72. So the button only appears once `clientSecret` exists, and its
   * amount is `totalCents` straight off the server's breakdown.
   *
   * Consequence, stated rather than hidden: this sits in the payment step
   * above the card fields, not above the buyer form where the mockup draws it.
   * The mockup's placement assumes the wallet can autofill the form, which
   * needs a trustworthy total before the form is filled — that needs a quote
   * endpoint this codebase doesn't have.
   *
   * Because the intent already exists, this confirms it with the wallet's
   * payment method instead of creating a second one — no orphan intents, and
   * the metadata the server attached at creation is preserved intact.
   */
  useEffect(() => {
    if (!stripe || !clientSecret || totalCents <= 0) return;
    let cancelled = false;

    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: walletLabel, amount: totalCents },
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true,
    });

    pr.on("paymentmethod", async (ev) => {
      setIsProcessing(true);
      setCardError("");
      try {
        const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
          clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        );

        if (confirmError) {
          ev.complete("fail");
          setCardError(confirmError.message || "Payment failed. Please try again.");
          setIsProcessing(false);
          return;
        }

        // Close the sheet before any 3DS step — Stripe requires the sheet be
        // dismissed first, otherwise the authentication modal opens behind it.
        ev.complete("success");

        if (paymentIntent?.status === "requires_action") {
          const { error: actionError } = await stripe.confirmCardPayment(clientSecret);
          if (actionError) {
            setCardError(actionError.message || "Authentication failed. Please try again.");
            setIsProcessing(false);
            return;
          }
        }

        trackFbEvent("Purchase");
        router.push(`/checkout/success?payment_intent_id=${paymentIntentId}`);
      } catch {
        ev.complete("fail");
        setCardError("An unexpected error occurred. Please try again.");
        setIsProcessing(false);
      }
    });

    pr.canMakePayment().then((result) => {
      if (result && !cancelled) setPaymentRequest(pr);
    });

    return () => { cancelled = true; setPaymentRequest(null); };
  }, [stripe, clientSecret, totalCents, walletLabel, paymentIntentId, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const cardNumberElement = elements.getElement(CardNumberElement);
    if (!cardNumberElement) {
      setCardError("Card fields not ready.");
      return;
    }

    setIsProcessing(true);
    setCardError("");

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardNumberElement,
            billing_details: {
              name: buyerName,
              email: buyerEmail,
              phone: buyerPhone || undefined,
              address: buyerZip ? { postal_code: buyerZip } : undefined,
            },
          },
        }
      );

      if (confirmError) {
        setCardError(confirmError.message || "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        trackFbEvent("Purchase");
        router.push(`/checkout/success?payment_intent_id=${paymentIntentId}`);
        return;
      }

      setCardError("Payment did not complete. Please try again.");
      setIsProcessing(false);
    } catch {
      setCardError("An unexpected error occurred. Please try again.");
      setIsProcessing(false);
    }
  };

  const cardFieldsComplete = cardNumberComplete && cardExpiryComplete && cardCvcComplete;

  return (
    /* .ic-stripe-field and stripeAppearance are deliberately untouched — that
       pairing is what keeps Stripe's iframes dark. Only the surrounding labels
       and the submit button move to sf-* classes. */
    <form className="sf-payment-form" onSubmit={handleSubmit} noValidate>
      {/* Express checkout — mockup line 1556. Only rendered when
          canMakePayment() says this visitor actually has a wallet, so exactly
          one of Apple Pay / Google Pay appears and neither shows as a dead
          button on an unsupported browser.

          The mockup hand-draws two glyph buttons. Production uses Stripe's
          PaymentRequestButtonElement instead: Apple's Human Interface
          Guidelines require their own button asset for Apple Pay, and a custom
          button is not a compliant substitute. Styling is therefore Stripe's,
          themed dark to match. */}
      {paymentRequest && (
        <>
          <div className="sf-express">
            <div className="sf-eyebrow">Express checkout — fastest</div>
            <PaymentRequestButtonElement
              options={{
                paymentRequest,
                style: { paymentRequestButton: { theme: "dark", height: "48px", type: "buy" } },
              }}
            />
            <p className="sf-express-note">
              Only one shows per visitor — Apple Pay on Safari and iOS, Google Pay on
              Chrome and Android. Pays the same total shown above.
            </p>
          </div>

          <div className="sf-or"><span>Or pay with card</span></div>
        </>
      )}

      <div>
        <label className="sf-field-label">Card Number</label>
        <div className="ic-stripe-field">
          <CardNumberElement
            options={{ showIcon: true }}
            onChange={(e) => {
              setCardNumberComplete(e.complete);
              setCardError(e.error?.message || "");
            }}
          />
        </div>
      </div>

      <div className="sf-field-row">
        <div>
          <label className="sf-field-label">Expiry</label>
          <div className="ic-stripe-field">
            <CardExpiryElement
              onChange={(e) => {
                setCardExpiryComplete(e.complete);
                if (e.error) setCardError(e.error.message);
              }}
            />
          </div>
        </div>
        <div>
          <label className="sf-field-label">CVC</label>
          <div className="ic-stripe-field">
            <CardCvcElement
              onChange={(e) => {
                setCardCvcComplete(e.complete);
                if (e.error) setCardError(e.error.message);
              }}
            />
          </div>
        </div>
      </div>

      {cardError && <p className="sf-error">{cardError}</p>}

      <button
        type="submit"
        className="sf-btn sf-btn--primary sf-btn--block"
        disabled={!stripe || isProcessing || !cardFieldsComplete}
      >
        {isProcessing ? "Processing…" : payLabel}
      </button>
    </form>
  );
}

function SeatHoldTimer({ heldUntil }: { heldUntil: string }) {
  const [secsLeft, setSecsLeft] = useState(() =>
    Math.max(0, Math.round((new Date(heldUntil).getTime() - Date.now()) / 1000))
  );

  useEffect(() => {
    if (secsLeft <= 0) return;
    const id = setInterval(() => {
      setSecsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secsLeft]);

  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;
  const expired = secsLeft === 0;
  const urgent = secsLeft <= 60;

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 14px",
      borderRadius: 8,
      background: expired ? "rgba(239,68,68,0.1)" : urgent ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.05)",
      border: `1px solid ${expired ? "rgba(239,68,68,0.4)" : urgent ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.1)"}`,
      fontSize: 13,
      color: expired ? "#f87171" : urgent ? "#fbbf24" : "rgba(255,255,255,0.6)",
      marginBottom: 16,
    }}>
      {expired ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <path d="M12 3.5L2 20h20L12 3.5z" />
          <path d="M12 10v4M12 17h.01" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      )}
      {expired
        ? "Your seat hold has expired. Please go back and reselect."
        : `Seats held for ${mins}:${String(secs).padStart(2, "0")} — complete payment before time runs out.`}
    </div>
  );
}

type EventSummary = {
  title: string;
  date: string;
  venue: string;
  image_url?: string | null;
  price?: number;
};

function CheckoutContent() {
  const operator = useOperator();
  const router = useRouter();
  const isWest72 = operator.slug === "west72";
  const searchParams = useSearchParams();

  // Dodge animation state — west72 FWB checkbox only
  const dodgeCount = useRef(0);
  const [dodgeClass, setDodgeClass] = useState("");
  const eventId = searchParams.get("event");
  const quantity = Number(searchParams.get("qty") || "1");
  const [error, setError] = useState<string | null>(null);

  // Event context for the order summary panel
  const [eventSummary, setEventSummary] = useState<EventSummary | null>(null);
  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.title) {
          setEventSummary({ title: d.title, date: d.date, venue: d.venue, image_url: d.image_url, price: d.price });
        }
      })
      .catch(() => {});
  }, [eventId]);

  // Buyer info state
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerZip, setBuyerZip] = useState("");
  const [fwbOptIn, setFwbOptIn] = useState(true);
  const [agreed, setAgreed] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");
  /* /api/checkout/create-intent already returns the authoritative breakdown in
     `orderDetails` — this page just never read it. Capturing it (no change to
     the request) is what lets the pay button state the real amount Stripe is
     about to charge instead of the face price. */
  const [orderDetails, setOrderDetails] = useState<{
    subtotal: number; ticketingFee: number; facilityFee: number;
    tax: number; processingFee: number; discount: number; total: number;
  } | null>(null);

  // Promo code state
  const [showPromo, setShowPromo] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoValid, setPromoValid] = useState<null | { discount_type: string; discount_value: number }>(null);
  const [promoError, setPromoError] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);

  const handleApplyPromo = async () => {
    if (!promoCode.trim() || !eventId) return;
    setPromoLoading(true);
    setPromoError("");
    setPromoValid(null);
    try {
      const res = await fetch("/api/promo-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), event_id: eventId }),
      });
      const data = await res.json();
      if (data.valid) {
        setPromoValid({ discount_type: data.discount_type, discount_value: data.discount_value });
      } else {
        setPromoError(data.error || "Invalid promo code");
      }
    } catch {
      setPromoError("Failed to validate promo code");
    } finally {
      setPromoLoading(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode("");
    setPromoValid(null);
    setPromoError("");
  };

  // Get seat_ids from URL params (for assigned seating)
  const seatIdsParam = searchParams.get("seat_ids");
  const seatIds = seatIdsParam ? seatIdsParam.split(",").filter(Boolean) : [];

  // Seat hold expiry (only present for assigned-seating purchases)
  const heldUntilParam = searchParams.get("held_until");

  // Get trackable link ref from URL params (for conversion attribution)
  const trackingRef = searchParams.get("ref") || (typeof window !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : null);

  const handleContinue = async () => {
    if (!buyerName.trim() || !buyerEmail.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the terms to continue.");
      return;
    }
    if (!eventId) {
      setError("No event selected.");
      return;
    }
    setError(null);
    setCreatingIntent(true);

    try {
      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          quantity,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerZip: buyerZip.trim() || undefined,
          fwbOptIn,
          promoCode: promoValid ? promoCode.trim() : undefined,
          selectedSeats: seatIds.length > 0 ? seatIds : undefined,
          sessionId: typeof window !== "undefined" ? sessionStorage.getItem("vc_session") || undefined : undefined,
          trackingRef: trackingRef || undefined,
          ...getStoredUtmParams(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to start checkout.");
        setCreatingIntent(false);
        return;
      }

      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId ?? "");
      setOrderDetails(data.orderDetails ?? null);
      // Fire Meta Pixel InitiateCheckout when buyer moves from info form → payment
      trackFbEvent("InitiateCheckout");
      setShowCheckout(true);
    } catch {
      setError("Failed to start checkout. Please try again.");
    } finally {
      setCreatingIntent(false);
    }
  };

  // Fire AddPaymentInfo once the payment step is shown
  useEffect(() => {
    if (showCheckout) {
      trackFbEvent("AddPaymentInfo");
    }
  }, [showCheckout]);

  if (!eventId) {
    return (
      <div className="ticket-page-loading">
        No event selected. Go back and choose a ticket.
      </div>
    );
  }

  function triggerDodge() {
    if (!isWest72 || fwbOptIn || dodgeCount.current >= 3 || dodgeClass) return;
    const count = dodgeCount.current;
    dodgeCount.current += 1;
    if (count === 0) setDodgeClass("dodging-right");
    else if (count === 1) setDodgeClass("dodging-left");
    else setDodgeClass("resigning");
  }

  // Desktop: hover approach triggers the dodge
  function handleFwbMouseEnter() { triggerDodge(); }

  // Mobile: intercept the tap for the first 2 attempts so checkbox doesn't
  // check immediately — the third tap goes through normally
  function handleFwbClick(e: React.MouseEvent) {
    if (!isWest72 || fwbOptIn || dodgeCount.current >= 2) return;
    e.preventDefault();
    triggerDodge();
  }

  // Face price × qty until the intent exists; the server's real total after.
  const facePrice = eventSummary?.price ? eventSummary.price * quantity : null;
  const shownTotal = orderDetails?.total ?? facePrice;
  const totalIsAllIn = orderDetails != null;
  const payLabel = orderDetails ? `Pay $${orderDetails.total.toFixed(2)}` : "Pay Now";

  /* ── Storefront glass rebuild (step 6/8) ──
   * Restructured to the mockup's checkout screen (VenueCore.dc.html lines
   * 1491-1611): .sf-detail-grid with the .sf-art photo panel and a "before you
   * go in" note on the left, and one .sf-cart panel on the right carrying the
   * stepper, the order line, the buyer fields and the payment block.
   *
   * NOTHING ABOUT THE PAYMENT PATH CHANGED. loadStripe, the <Elements> options
   * (clientSecret + stripeAppearance), confirmCardPayment and its error
   * handling, /api/checkout/create-intent and its exact body, the
   * /api/promo-codes/validate call, every searchParams read (event, qty,
   * seat_ids, held_until, ref), both sessionStorage reads (vc_session,
   * vc_tracking_ref), getStoredUtmParams(), the trackFbEvent calls and the
   * router.push to /checkout/success are byte-identical. The .ic-stripe-field
   * wrappers are kept exactly as they were — that pairing with stripeAppearance
   * is what keeps Stripe's iframes dark.
   *
   * TWO DELIBERATE DEPARTURES FROM THE MOCKUP, both flagged rather than faked:
   *
   * 1. The mockup shows the buyer fields and the card fields together on one
   *    screen. Production cannot: the PaymentIntent is created from the buyer
   *    details, so clientSecret does not exist until Continue is pressed and
   *    the card fields have nothing to mount against. The mockup's single-panel
   *    SHAPE is kept — the payment block sits in the same panel, directly under
   *    the fields — and it swaps from the Continue button to the live Stripe
   *    fields once the intent exists. Matching it literally would mean creating
   *    a PaymentIntent before the buyer has entered anything.
   *
   * 2. The express-checkout block (Apple Pay / Google Pay, mockup line 1556)
   *    is NOT rendered. Production has no PaymentRequest wiring, so those
   *    buttons would be decorative — a dead Apple Pay button on a live
   *    checkout is worse than no button. It needs Stripe's PaymentRequest API,
   *    which is a feature, not a reskin. The .sf-or divider it introduced goes
   *    with it.
   */
  return (
    <>
      <div className="sf-detail-title">
        <div className="sf-eyebrow">Checkout</div>
        <h1>{eventSummary?.title ?? "Secure Checkout"}</h1>
      </div>

      <div className="sf-detail-grid">
        <div className="sf-detail-left">
          {eventSummary?.image_url && (
            <div className="sf-art">
              <div className="sf-art-media">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={eventSummary.image_url} alt={eventSummary.title} />
              </div>
              <div className="sf-art-scrim" />
              <div className="sf-art-badge sf-art-badge--l">{eventSummary.venue}</div>
              <div className="sf-art-facts">
                <div>
                  <div className="sf-fact-label">Date</div>
                  <div className="sf-fact-value">
                    {eventSummary.date ? formatEventDateFull(eventSummary.date) : ""}
                  </div>
                </div>
                <div>
                  <div className="sf-fact-label">Venue</div>
                  <div className="sf-fact-value">{eventSummary.venue}</div>
                </div>
                <div>
                  <div className="sf-fact-label">Tickets</div>
                  <div className="sf-fact-value">{quantity}</div>
                </div>
              </div>
            </div>
          )}

          <div className="sf-hosted-by">Hosted by {operator.copyright}</div>

          <div className="sf-note">
            <div className="sf-eyebrow">Before you go in</div>
            <div className="sf-note-body">
              Doors open an hour before the show. Bring the QR code in your
              confirmation email — a screenshot works. Check the event page for
              age policy, bag policy and parking before you head out.
            </div>
          </div>
        </div>

        <div className="sf-cart">
          <SfStepper current={2} />

          <div className="sf-checkout-head">
            <button type="button" className="sf-back" onClick={() => router.back()}>
              ← Back
            </button>
            <h2>Checkout</h2>
          </div>

          {heldUntilParam && <SeatHoldTimer heldUntil={heldUntilParam} />}

          <div className="sf-order-line">
            <span>General Admission × {quantity}</span>
            <span>{shownTotal != null ? `$${shownTotal.toFixed(2)}` : "—"}</span>
          </div>
          {/* The mockup's line reads "(Incl. Taxes & Fees)" because its figure
              is the all-in price. Ours is NOT: this page only fetches
              /api/events/{id}, which returns the face price — the real total is
              computed server-side by /api/checkout/create-intent. Claiming
              "included" here would understate what the buyer is about to be
              charged, so this keeps the previous page's honest "+ fees"
              wording. Showing a true all-in figure needs the venue fee data
              this route doesn't currently load. */}
          <p className="sf-order-note">
            {totalIsAllIn ? "(Incl. Taxes & Fees)" : "+ Taxes & Fees, calculated at payment"}
          </p>

          {/* Not in the mockup — kept. */}
          <div className="sf-promo">
            {!showPromo ? (
              <button type="button" className="sf-promo-toggle" onClick={() => setShowPromo(true)}>
                Have a promo code?
              </button>
            ) : promoValid ? (
              <div className="sf-promo--applied">
                <span>
                  ✓ {promoCode.toUpperCase()} — {promoValid.discount_type === "fixed"
                    ? `$${promoValid.discount_value.toFixed(2)} off`
                    : `${promoValid.discount_value}% off`}
                </span>
                <button type="button" className="sf-promo-remove" onClick={handleRemovePromo}>✕</button>
              </div>
            ) : (
              <>
                <div className="sf-promo-row">
                  <input
                    type="text"
                    className="sf-input"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Enter code"
                  />
                  <button
                    type="button"
                    className="sf-btn sf-btn--secondary sf-btn--sm"
                    onClick={handleApplyPromo}
                    disabled={promoLoading || !promoCode.trim()}
                  >
                    {promoLoading ? "..." : "Apply"}
                  </button>
                </div>
                {promoError && <p className="sf-promo-error">{promoError}</p>}
              </>
            )}
          </div>

          <div className="sf-fields">
            <div>
              <label className="sf-field-label" htmlFor="buyer-name">Full Name</label>
              <input
                id="buyer-name"
                className="sf-input"
                type="text"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Jane Doe"
                disabled={showCheckout}
                required
              />
            </div>

            <div>
              <label className="sf-field-label" htmlFor="buyer-email">Email</label>
              <input
                id="buyer-email"
                className="sf-input"
                type="email"
                value={buyerEmail}
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="jane@example.com"
                disabled={showCheckout}
                required
              />
            </div>

            <div className="sf-field-row">
              <div>
                <label className="sf-field-label" htmlFor="buyer-phone">Phone (optional)</label>
                <input
                  id="buyer-phone"
                  className="sf-input"
                  type="tel"
                  value={buyerPhone}
                  onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))}
                  placeholder="(555) 123-4567"
                  disabled={showCheckout}
                />
              </div>
              <div>
                <label className="sf-field-label" htmlFor="buyer-zip">ZIP Code (optional)</label>
                <input
                  id="buyer-zip"
                  className="sf-input"
                  type="text"
                  inputMode="numeric"
                  value={buyerZip}
                  onChange={(e) => setBuyerZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  placeholder="35630"
                  autoComplete="postal-code"
                  disabled={showCheckout}
                />
              </div>
            </div>

            <div
              className={`w72-fwb-dodge-wrap ${dodgeClass}`}
              onMouseEnter={handleFwbMouseEnter}
              onAnimationEnd={() => setDodgeClass("")}
            >
              <label className="sf-check" onClick={handleFwbClick}>
                <input
                  type="checkbox"
                  checked={fwbOptIn}
                  onChange={(e) => setFwbOptIn(e.target.checked)}
                  disabled={showCheckout}
                />
                <span>Sign me up for exclusive offers &amp; rewards</span>
              </label>
            </div>
            {isWest72 && fwbOptIn && (
              <p className="sf-check-note">
                We&apos;ll text you when there&apos;s a show, send the link first, and otherwise
                leave you alone. We&apos;re not gonna text you good morning. We have boundaries.
              </p>
            )}

            <label className="sf-check">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                disabled={showCheckout}
              />
              <span>
                I agree to the{" "}
                <a href="/faq" target="_blank" rel="noopener noreferrer">Terms of Sale</a>{" "}
                and acknowledge that all sales are final. I consent to receiving my ticket
                and order confirmation via email.
              </span>
            </label>
          </div>

          <div className="sf-divider" />

          <div className="sf-eyebrow sf-eyebrow--lg">🔒 Payment</div>

          {error && <p className="sf-error">{error}</p>}

          {showCheckout && clientSecret ? (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>
              <CheckoutPaymentForm
                clientSecret={clientSecret}
                paymentIntentId={paymentIntentId}
                buyerName={buyerName.trim()}
                buyerEmail={buyerEmail.trim()}
                buyerPhone={buyerPhone.trim()}
                buyerZip={buyerZip.trim()}
                payLabel={payLabel}
                walletLabel={eventSummary?.title ?? "Tickets"}
                totalCents={orderDetails ? Math.round(orderDetails.total * 100) : 0}
              />
            </Elements>
          ) : (
            <button
              type="button"
              className="sf-btn sf-btn--primary sf-btn--block"
              onClick={handleContinue}
              disabled={!buyerName.trim() || !buyerEmail.trim() || !agreed || creatingIntent}
            >
              {creatingIntent ? "Loading…" : "Continue to Payment"}
            </button>
          )}

          <p className="sf-cart-terms">
            All sales are final. Refunds only if event is cancelled.
          </p>
          <p className="sf-cart-trust">🔒 Secure Checkout · Instant confirmation</p>
        </div>
      </div>
    </>
  );
}

export default function CheckoutPage() {
  return (
    <div className="sf-page">
      <SfHeader />

      <Suspense
        fallback={<div className="sf-empty">Loading checkout...</div>}
      >
        <CheckoutContent />
      </Suspense>

      <SfFooter />
    </div>
  );
}
