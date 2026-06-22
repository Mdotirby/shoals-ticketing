"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import Footer from "@/app/components/Footer";
import { trackFbEvent } from "@/lib/fbq";
import { useOperator } from "@/app/components/OperatorContext";
import { safeDate, formatEventDateFull } from "@/lib/dates";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

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
      <span style={{ fontSize: 16 }}>{expired ? "⚠" : "🔒"}</span>
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

  const handleContinue = () => {
    if (!buyerName.trim() || !buyerEmail.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the terms to continue.");
      return;
    }
    setError(null);
    // Fire Meta Pixel InitiateCheckout when buyer moves from info form → Stripe
    trackFbEvent("InitiateCheckout");
    setShowCheckout(true);
  };

  // Fire AddPaymentInfo when Stripe embedded checkout becomes visible
  useEffect(() => {
    if (showCheckout) {
      trackFbEvent("AddPaymentInfo");
    }
  }, [showCheckout]);

  // Get seat_ids from URL params (for assigned seating)
  const seatIdsParam = searchParams.get("seat_ids");
  const seatIds = seatIdsParam ? seatIdsParam.split(",").filter(Boolean) : [];

  // Seat hold expiry (only present for assigned-seating purchases)
  const heldUntilParam = searchParams.get("held_until");

  // Get trackable link ref from URL params (for conversion attribution)
  const trackingRef = searchParams.get("ref") || (typeof window !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : null);

  const fetchClientSecret = useCallback(async () => {
    if (!eventId) {
      setError("No event selected.");
      return "";
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        quantity: quantity,
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        buyer_phone: buyerPhone.trim(),
        buyer_zip: buyerZip.trim() || undefined,
        fwb_opt_in: fwbOptIn,
        promo_code: promoValid ? promoCode.trim() : undefined,
        seat_ids: seatIds.length > 0 ? seatIds : undefined,
        session_id: typeof window !== "undefined" ? sessionStorage.getItem("vc_session") : undefined,
        tracking_ref: trackingRef || undefined,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to start checkout.");
      return "";
    }

    const data = await res.json();
    return data.clientSecret;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, quantity, buyerName, buyerEmail, buyerPhone, fwbOptIn]);

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

  // Shared step bar + event context rendered above both checkout steps
  const stepBar = (
    <div className="co-step-bar">
      <div className={`co-step ${!showCheckout ? "co-step-active" : "co-step-done"}`}>
        <span className="co-step-num">{!showCheckout ? "1" : "✓"}</span>
        <span className="co-step-label">Your Info</span>
      </div>
      <div className={`co-step-line ${showCheckout ? "co-step-line-done" : ""}`} />
      <div className={`co-step ${showCheckout ? "co-step-active" : ""}`}>
        <span className="co-step-num">2</span>
        <span className="co-step-label">Payment</span>
      </div>
      <div className="co-step-line" />
      <div className="co-step">
        <span className="co-step-num">3</span>
        <span className="co-step-label">Done</span>
      </div>
    </div>
  );

  const eventContextCard = eventSummary ? (
    <div className="co-event-context">
      {eventSummary.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={eventSummary.image_url} alt={eventSummary.title} className="co-event-thumb" />
      )}
      <div className="co-event-details">
        <p className="co-event-title">{eventSummary.title}</p>
        <p className="co-event-meta">
          {eventSummary.date ? formatEventDateFull(eventSummary.date) : ""} · {eventSummary.venue}
        </p>
        <p className="co-event-qty">
          {quantity} ticket{quantity !== 1 ? "s" : ""}
          {eventSummary.price ? ` · $${(eventSummary.price * quantity).toFixed(2)} + fees` : ""}
        </p>
      </div>
    </div>
  ) : null;

  // Show buyer info form first
  if (!showCheckout) {
    return (
      <section className="checkout-embed-section">
        {stepBar}
        {eventContextCard}
        <div className="pre-checkout-form">
          {heldUntilParam && <SeatHoldTimer heldUntil={heldUntilParam} />}
          <h3>Your Information</h3>

          <div className="pre-checkout-field">
            <label htmlFor="buyer-name">Full Name *</label>
            <input
              id="buyer-name"
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="pre-checkout-field">
            <label htmlFor="buyer-email">Email Address *</label>
            <input
              id="buyer-email"
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="pre-checkout-field">
            <label htmlFor="buyer-phone">Phone Number</label>
            <input
              id="buyer-phone"
              type="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))}
              placeholder="(555)-555-1234"
            />
          </div>

          <div className="pre-checkout-field">
            <label htmlFor="buyer-zip">ZIP Code <span style={{ fontWeight: 400, opacity: 0.55 }}>(optional)</span></label>
            <input
              id="buyer-zip"
              type="text"
              inputMode="numeric"
              value={buyerZip}
              onChange={(e) => setBuyerZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="35630"
              autoComplete="postal-code"
            />
          </div>

          {/* Promo Code Section */}
          <div style={{ margin: "16px 0 12px" }}>
            {!showPromo ? (
              <button
                type="button"
                onClick={() => setShowPromo(true)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(208,194,144,0.7)",
                  fontSize: 13,
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                }}
              >
                Have a promo code?
              </button>
            ) : (
              <div>
                <label style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 6 }}>
                  Promo Code
                </label>
                {promoValid ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "rgba(80,200,120,0.08)",
                    border: "1px solid rgba(80,200,120,0.3)",
                    borderRadius: 8, padding: "8px 12px",
                  }}>
                    <span style={{ color: "#50c878", fontSize: 13, fontWeight: 600, flex: 1 }}>
                      ✓ {promoCode.toUpperCase()} — {promoValid.discount_type === "fixed"
                        ? `$${promoValid.discount_value.toFixed(2)} off`
                        : `${promoValid.discount_value}% off`}
                    </span>
                    <button
                      type="button"
                      onClick={handleRemovePromo}
                      style={{
                        background: "transparent", border: "none",
                        color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 13,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 8,
                        border: "1px solid rgba(208,194,144,0.2)",
                        background: "rgba(255,255,255,0.05)",
                        color: "#fff", fontSize: 14, textTransform: "uppercase",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleApplyPromo}
                      disabled={promoLoading || !promoCode.trim()}
                      style={{
                        padding: "8px 16px", borderRadius: 8,
                        border: "1px solid rgba(208,194,144,0.3)",
                        background: "rgba(208,194,144,0.1)",
                        color: "#d0c290", fontSize: 13, fontWeight: 600,
                        cursor: promoLoading || !promoCode.trim() ? "not-allowed" : "pointer",
                        opacity: promoLoading || !promoCode.trim() ? 0.5 : 1,
                      }}
                    >
                      {promoLoading ? "..." : "Apply"}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p style={{ color: "#ff6b6b", fontSize: 12, margin: "6px 0 0" }}>{promoError}</p>
                )}
              </div>
            )}
          </div>

          <div
            className={`w72-fwb-dodge-wrap ${dodgeClass}`}
            onMouseEnter={handleFwbMouseEnter}
            onAnimationEnd={() => setDodgeClass("")}
          >
            <label className="pre-checkout-checkbox" onClick={handleFwbClick}>
              <input
                type="checkbox"
                checked={fwbOptIn}
                onChange={(e) => setFwbOptIn(e.target.checked)}
              />
              <span>
                Yes, sign me up for <strong>Friends with Benefits</strong> — get early access to tickets,
                exclusive offers, and event updates via email and text. You can unsubscribe at any time.
              </span>
            </label>
          </div>
          {isWest72 && fwbOptIn && (
            <p style={{
              fontSize: 12,
              color: "rgba(255,255,255,0.4)",
              margin: "-6px 0 0 28px",
              lineHeight: 1.6,
              fontStyle: "italic",
            }}>
              We&apos;ll text you when there&apos;s a show, send the link first, and otherwise leave you alone.
              We&apos;re not gonna text you good morning. We have boundaries.
            </p>
          )}

          <label className="pre-checkout-checkbox">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I agree to the <a href="/faq" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "underline" }}>Terms of Sale</a> and 
              acknowledge that all sales are final. I consent to receiving my ticket and order 
              confirmation via email.
            </span>
          </label>

          {error && (
            <p style={{ color: "#ff6b6b", fontSize: 13, margin: "12px 0 0" }}>{error}</p>
          )}

          <button
            type="button"
            className="pre-checkout-continue-btn"
            onClick={handleContinue}
            disabled={!buyerName.trim() || !buyerEmail.trim() || !agreed}
          >
            Continue to Payment
          </button>
        </div>
      </section>
    );
  }

  if (error) {
    return <div className="ticket-page-loading">{error}</div>;
  }

  return (
    <section className="checkout-embed-section">
      {stepBar}
      {eventContextCard}
      {heldUntilParam && <SeatHoldTimer heldUntil={heldUntilParam} />}
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ fetchClientSecret }}
      >
        <EmbeddedCheckout className="checkout-embed" />
      </EmbeddedCheckoutProvider>
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">Secure Checkout</h1>
        </section>

        <Suspense
          fallback={
            <div className="ticket-page-loading">Loading checkout...</div>
          }
        >
          <CheckoutContent />
        </Suspense>
      </main>

      <Footer />
    </>
  );
}
