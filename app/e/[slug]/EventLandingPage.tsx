"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { trackFbEvent } from "@/lib/fbq";
import { formatEventDateFull, formatEventTime } from "@/lib/dates";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// ── Types ────────────────────────────────────────────────────────────────────

type TicketType = {
  id: string;
  name: string;
  basePrice: number;
  allInPrice: number;
  capacity: number;
};

type EventData = {
  id: string;
  title: string;
  venue: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  imageUrl: string | null;
  description: string | null;
  isFree: boolean;
  onSaleAt: string | null;
};

type Props = {
  event: EventData;
  ticketTypes: TicketType[];
  attendeeCount: number;
};

type OrderDetails = {
  subtotal: number;
  ticketingFee: number;
  facilityFee: number;
  tax: number;
  processingFee: number;
  discount: number;
  total: number;
};

// ── Stripe loader (singleton) ────────────────────────────────────────────────

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

// ── Stripe Appearance API config (dark theme) ────────────────────────────────

const stripeAppearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#d0c290",
    colorBackground: "rgba(255, 255, 255, 0.04)",
    colorText: "#ffffff",
    colorTextSecondary: "rgba(255, 255, 255, 0.5)",
    colorTextPlaceholder: "rgba(255, 255, 255, 0.3)",
    colorDanger: "#ef4444",
    fontFamily: "var(--font-urbanist), system-ui, sans-serif",
    fontSizeBase: "15px",
    spacingUnit: "4px",
    borderRadius: "12px",
    colorIconCardError: "#ef4444",
  },
  rules: {
    ".Input": {
      backgroundColor: "rgba(255, 255, 255, 0.04)",
      border: "1px solid rgba(255, 255, 255, 0.1)",
      color: "#ffffff",
      padding: "14px 16px",
      fontSize: "15px",
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    },
    ".Input:focus": {
      borderColor: "rgba(208, 194, 144, 0.5)",
      boxShadow: "0 0 0 2px rgba(208, 194, 144, 0.15)",
    },
    ".Input--invalid": {
      borderColor: "#ef4444",
      boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.15)",
    },
    ".Label": {
      color: "rgba(255, 255, 255, 0.7)",
      fontSize: "13px",
      fontWeight: "600",
    },
    ".Error": {
      color: "#ef4444",
      fontSize: "12px",
    },
  },
};

// ── Checkout Form (inside Elements provider) ─────────────────────────────────

function CheckoutForm({
  event,
  selectedTier,
  quantity,
  displayPrice,
  isFree,
  onBack,
}: {
  event: EventData;
  selectedTier: TicketType;
  quantity: number;
  displayPrice: number;
  isFree: boolean;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage" | null>(null);
  const [discountValue, setDiscountValue] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardError, setCardError] = useState("");
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [addedPaymentInfo, setAddedPaymentInfo] = useState(false);
  const [fwbStatus, setFwbStatus] = useState<"idle" | "loading" | "done">("idle");

  const estimatedTotal = displayPrice * quantity;

  // Calculate discounted total
  const discountedPerTicket = promoApplied && discountType
    ? discountType === "percentage"
      ? displayPrice * (1 - discountValue / 100)
      : Math.max(0, displayPrice - discountValue)
    : displayPrice;
  const discountedTotal = Math.max(0, discountedPerTicket * quantity);
  const isFullyFree = isFree || (promoApplied && discountedTotal === 0);

  // Promo code validation handler
  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setPromoValidating(true);
    setPromoError("");
    setPromoApplied(false);
    setDiscountType(null);
    setDiscountValue(0);

    try {
      const res = await fetch("/api/promo-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), event_id: event.id }),
      });
      const data = await res.json();

      if (data.valid) {
        setDiscountType(data.discount_type);
        setDiscountValue(data.discount_value);
        setPromoApplied(true);
      } else {
        setPromoError(data.error || "Invalid promo code");
      }
    } catch {
      setPromoError("Failed to validate promo code. Please try again.");
    } finally {
      setPromoValidating(false);
    }
  };

  // Fire AddPaymentInfo when all card fields are complete
  useEffect(() => {
    if (cardNumberComplete && cardExpiryComplete && cardCvcComplete && !addedPaymentInfo) {
      setAddedPaymentInfo(true);
      trackFbEvent("AddPaymentInfo", {
        content_name: event.title,
        content_ids: [event.id],
        value: estimatedTotal,
        currency: "USD",
      });
    }
  }, [cardNumberComplete, cardExpiryComplete, cardCvcComplete, addedPaymentInfo, event.title, event.id, estimatedTotal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!buyerName.trim()) { setPaymentError("Please enter your full name."); return; }
    if (!buyerEmail.trim() || !buyerEmail.includes("@")) { setPaymentError("Please enter a valid email."); return; }

    setIsProcessing(true);
    setPaymentError("");

    try {
      // ── Free checkout (100% promo or truly free event) ──
      if (isFullyFree) {
        const res = await fetch("/api/checkout/free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: event.id,
            buyer_name: buyerName.trim(),
            buyer_email: buyerEmail.trim(),
            buyer_phone: buyerPhone.trim() || undefined,
            quantity,
            promo_code: promoApplied ? promoCode.trim() : undefined,
            tracking_ref: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : undefined,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setPaymentError(data.error || "Failed to claim tickets. Please try again.");
          setIsProcessing(false);
          return;
        }

        trackFbEvent("Purchase", {
          content_name: event.title,
          content_ids: [event.id],
          value: 0,
          currency: "USD",
          num_items: quantity,
        });

        setOrderDetails({ subtotal: 0, ticketingFee: 0, facilityFee: 0, tax: 0, processingFee: 0, discount: estimatedTotal, total: 0 });
        setPaymentSuccess(true);
        return;
      }

      // ── Paid checkout ──
      if (!stripe || !elements) { setPaymentError("Payment system is loading. Please wait."); setIsProcessing(false); return; }

      const cardNumberElement = elements.getElement(CardNumberElement);
      if (!cardNumberElement) { setPaymentError("Card fields not ready."); setIsProcessing(false); return; }

      // 1. Create PaymentIntent
      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          tierId: selectedTier.id,
          quantity,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          promoCode: promoApplied ? promoCode.trim() : undefined,
          trackingRef: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPaymentError(data.error || "Failed to create payment. Please try again.");
        setIsProcessing(false);
        return;
      }

      setOrderDetails(data.orderDetails);

      // 2. Confirm card payment
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        data.clientSecret,
        {
          payment_method: {
            card: cardNumberElement,
            billing_details: {
              name: buyerName.trim(),
              email: buyerEmail.trim(),
              phone: buyerPhone.trim() || undefined,
            },
          },
        }
      );

      if (confirmError) {
        setPaymentError(confirmError.message || "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        // Fire Purchase pixel
        trackFbEvent("Purchase", {
          content_name: event.title,
          content_ids: [event.id],
          value: data.orderDetails.total,
          currency: "USD",
          num_items: quantity,
        });

        setPaymentSuccess(true);
      }
    } catch (err) {
      setPaymentError("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Success State ──────────────────────────────────────────────────────────
  if (paymentSuccess) {
    const eventDate = formatEventDateFull(event.date);
    const finalTotal = orderDetails?.total ?? estimatedTotal;

    return (
      <div className="lp-checkout-success">
        <div className="lp-checkout-success-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="rgba(16, 185, 129, 0.15)" />
            <path
              d="M14 24L21 31L34 18"
              stroke="#10b981"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h2 className="lp-checkout-success-heading">You&apos;re In!</h2>
        <p className="lp-checkout-success-event">{event.title}</p>
        <p className="lp-checkout-success-date">{eventDate} &middot; {event.venue}</p>
        <p className="lp-checkout-success-detail">
          {quantity} ticket{quantity > 1 ? "s" : ""} &middot; ${finalTotal.toFixed(2)} paid
        </p>
        <p className="lp-checkout-success-email">
          Check your email for your ticket{quantity > 1 ? "s" : ""} and confirmation details.
        </p>

        {/* FWB Opt-in */}
        <div className="lp-checkout-fwb">
          {fwbStatus === "done" ? (
            <div className="ic-fwb-done">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="rgba(16, 185, 129, 0.15)" />
                <path d="M6 10L9 13L14 7" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>You&apos;re a Friend with Benefits now!</span>
            </div>
          ) : (
            <>
              <div className="lp-checkout-fwb-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="lp-checkout-fwb-heading">Don&apos;t Miss a Thing</h3>
              <p className="lp-checkout-fwb-desc">
                Get presale access, exclusive offers, and be first to know about new shows.
              </p>
              <button
                type="button"
                className="ic-fwb-join-btn"
                disabled={fwbStatus === "loading"}
                onClick={async () => {
                  setFwbStatus("loading");
                  const nameParts = buyerName.trim().split(/\s+/);
                  const firstName = nameParts[0] || "";
                  const lastName = nameParts.slice(1).join(" ") || firstName;
                  try {
                    const res = await fetch("/api/newsletter", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        firstName,
                        lastName,
                        email: buyerEmail.trim(),
                        phone: buyerPhone.trim() || undefined,
                        source: "checkout",
                      }),
                    });
                    if (res.ok || res.status === 409) setFwbStatus("done");
                    else setFwbStatus("done");
                  } catch { setFwbStatus("done"); }
                }}
              >
                {fwbStatus === "loading" ? "Joining..." : "Count Me In"}
              </button>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", margin: "4px 0 0" }}>No spam. Unsubscribe anytime.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Checkout Form ──────────────────────────────────────────────────────────
  return (
    <form className="lp-checkout-form" onSubmit={handleSubmit} noValidate>
      <div className="lp-checkout-field">
        <label className="lp-checkout-label" htmlFor="lp-name">Full Name</label>
        <input
          id="lp-name"
          type="text"
          className="lp-checkout-input"
          placeholder="Jane Doe"
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          autoComplete="name"
          required
        />
      </div>

      <div className="lp-checkout-field">
        <label className="lp-checkout-label" htmlFor="lp-email">Email</label>
        <input
          id="lp-email"
          type="email"
          className="lp-checkout-input"
          placeholder="jane@example.com"
          value={buyerEmail}
          onChange={(e) => setBuyerEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </div>

      <div className="lp-checkout-field">
        <label className="lp-checkout-label" htmlFor="lp-phone">Phone</label>
        <input
          id="lp-phone"
          type="tel"
          className="lp-checkout-input"
          placeholder="(555) 123-4567"
          value={buyerPhone}
          onChange={(e) => setBuyerPhone(e.target.value)}
          autoComplete="tel"
        />
      </div>

      {/* Promo Code — above card fields so user can apply first */}
      <div className="lp-checkout-promo">
        <label className="lp-checkout-label">Promo Code (optional)</label>
        <div className="lp-checkout-promo-row">
          <input
            type="text"
            className="lp-checkout-input"
            placeholder="Enter code"
            value={promoCode}
            onChange={(e) => {
              setPromoCode(e.target.value.toUpperCase());
              setPromoApplied(false);
              setPromoError("");
              setDiscountType(null);
              setDiscountValue(0);
            }}
            disabled={promoValidating}
          />
          <button
            type="button"
            className="lp-checkout-promo-btn"
            disabled={!promoCode.trim() || promoValidating}
            onClick={handleApplyPromo}
          >
            {promoValidating ? "Checking..." : "Apply"}
          </button>
        </div>
        {promoApplied && discountType && (
          <div className="lp-checkout-promo-applied">
            {discountType === "percentage" && discountValue >= 100 ? (
              <span>🎉 100% off — your tickets are free!</span>
            ) : discountType === "percentage" ? (
              <span>{discountValue}% off applied — new total: ${discountedTotal.toFixed(2)}</span>
            ) : (
              <span>${discountValue.toFixed(2)} off per ticket — new total: ${discountedTotal.toFixed(2)}</span>
            )}
          </div>
        )}
        {promoError && <p className="lp-checkout-error">{promoError}</p>}
      </div>

      {/* Card fields — hidden when fully free (100% promo or free event) */}
      {!isFullyFree && (
        <>
          <div className="lp-checkout-field">
            <label className="lp-checkout-label">Card Number</label>
            <div className="lp-checkout-card-element">
              <CardNumberElement
                options={{ showIcon: true }}
                onChange={(e) => {
                  setCardNumberComplete(e.complete);
                  setCardError(e.error?.message ?? "");
                }}
              />
            </div>
          </div>

          <div className="lp-checkout-card-row">
            <div className="lp-checkout-field lp-checkout-field-half">
              <label className="lp-checkout-label">Expiry</label>
              <div className="lp-checkout-card-element">
                <CardExpiryElement
                  onChange={(e) => {
                    setCardExpiryComplete(e.complete);
                    if (e.error) setCardError(e.error.message);
                  }}
                />
              </div>
            </div>
            <div className="lp-checkout-field lp-checkout-field-half">
              <label className="lp-checkout-label">CVC</label>
              <div className="lp-checkout-card-element">
                <CardCvcElement
                  onChange={(e) => {
                    setCardCvcComplete(e.complete);
                    if (e.error) setCardError(e.error.message);
                  }}
                />
              </div>
            </div>
          </div>

          {cardError && (
            <p className="lp-checkout-error">{cardError}</p>
          )}
        </>
      )}

      {paymentError && (
        <div className="lp-checkout-error">{paymentError}</div>
      )}

      <button
        type="submit"
        className="lp-checkout-pay-btn"
        disabled={isProcessing || (!isFullyFree && !stripe)}
      >
        {isProcessing ? (
          <>
            <span className="lp-checkout-spinner" />
            Processing...
          </>
        ) : isFullyFree ? (
          "Claim Free Tickets"
        ) : promoApplied && discountedTotal < estimatedTotal ? (
          <>
            <span style={{ textDecoration: "line-through", opacity: 0.5, marginRight: 8 }}>
              ${estimatedTotal.toFixed(2)}
            </span>
            Pay ${discountedTotal.toFixed(2)}
          </>
        ) : (
          `Pay $${estimatedTotal.toFixed(2)}`
        )}
      </button>

      <button type="button" className="lp-checkout-back-btn" onClick={onBack} disabled={isProcessing}>
        &larr; Change selection
      </button>

      {!isFullyFree && (
        <p className="lp-checkout-trust">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "-2px", marginRight: "4px" }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Secured by Stripe. Your payment info is encrypted.
        </p>
      )}
    </form>
  );
}

// ── Main Landing Page Component ──────────────────────────────────────────────

export default function EventLandingPage({ event, ticketTypes, attendeeCount }: Props) {
  const searchParams = useSearchParams();
  const [quantity, setQuantity] = useState(1);
  const [selectedTierId, setSelectedTierId] = useState(ticketTypes[0]?.id ?? "");
  const [onSaleCountdown, setOnSaleCountdown] = useState<string | null>(null);
  const [ticketsOnSale, setTicketsOnSale] = useState(true);
  const [isCtaVisible, setIsCtaVisible] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const checkoutRef = useRef<HTMLDivElement>(null);

  const selectedTier = ticketTypes.find((t) => t.id === selectedTierId) ?? ticketTypes[0];
  const displayPrice = selectedTier ? selectedTier.allInPrice : 0;
  const isFree = event.isFree || displayPrice === 0;

  // ── Persist tracking ref ──────────────────────────────────────────────────
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      sessionStorage.setItem("vc_tracking_ref", ref);
    }
  }, [searchParams]);

  // ── Track page view ───────────────────────────────────────────────────────
  useEffect(() => {
    let sessionId = sessionStorage.getItem("vc_session");
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("vc_session", sessionId);
    }

    const urlParams = new URLSearchParams(window.location.search);

    // Record landing page view
    fetch(`/api/landing/${event.id}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        referrer_url: document.referrer || null,
        utm_source: urlParams.get("utm_source") || null,
        utm_medium: urlParams.get("utm_medium") || null,
        utm_campaign: urlParams.get("utm_campaign") || null,
        ref: urlParams.get("ref") || null,
      }),
    }).catch(() => {});

    // Fire Meta Pixel ViewContent
    trackFbEvent("ViewContent", {
      content_name: event.title,
      content_ids: [event.id],
      content_type: "product",
      value: displayPrice,
      currency: "USD",
    });
  }, [event.id, event.title, displayPrice]);

  // ── On-sale countdown timer ───────────────────────────────────────────────
  useEffect(() => {
    if (!event.onSaleAt) {
      setTicketsOnSale(true);
      return;
    }
    const onSaleTime = new Date(event.onSaleAt).getTime();

    function updateCountdown() {
      const now = Date.now();
      const diff = onSaleTime - now;
      if (diff <= 0) {
        setTicketsOnSale(true);
        setOnSaleCountdown(null);
        return;
      }
      setTicketsOnSale(false);
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      setOnSaleCountdown(parts.join(" "));
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [event.onSaleAt]);

  // ── Sticky CTA visibility on scroll ───────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      setIsCtaVisible(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── CTA click handler — opens inline checkout ──────────────────────────────
  const handleGetTickets = useCallback(() => {
    if (!ticketsOnSale) return;

    // Fire Meta Pixel
    trackFbEvent("InitiateCheckout", {
      content_name: event.title,
      content_ids: [event.id],
      value: displayPrice * quantity,
      currency: "USD",
      num_items: quantity,
    });

    setCheckoutOpen(true);

    // Scroll to checkout section
    setTimeout(() => {
      checkoutRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }, [event.id, event.title, displayPrice, quantity, ticketsOnSale]);

  const handleBackFromCheckout = useCallback(() => {
    setCheckoutOpen(false);
    // Scroll back to hero
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const showTime = formatEventTime(event.date);
  const eventDate = formatEventDateFull(event.date);

  // Social proof text
  const socialProofText =
    attendeeCount >= 10
      ? `${attendeeCount}+ people already going`
      : attendeeCount > 0
        ? "Selling fast"
        : "Be the first to get tickets";

  // Check if event is in the past
  const isPast = new Date(event.date) < new Date();

  return (
    <main className="lp-main">
      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="lp-hero">
        {event.imageUrl ? (
          <div className="lp-hero-image-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.imageUrl}
              alt={event.title}
              className="lp-hero-image"
            />
            <div className="lp-hero-gradient" />
          </div>
        ) : (
          <div className="lp-hero-fallback" />
        )}

        <div className="lp-hero-content">
          <h1 className="lp-headline">{event.title}</h1>
          <p className="lp-subheadline">
            {isPast ? "This event has passed" : "Don\u2019t miss out \u2014 limited availability"}
          </p>

          <div className="lp-meta">
            <span className="lp-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {eventDate}
            </span>
            {showTime && (
              <span className="lp-meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {showTime}
              </span>
            )}
            <span className="lp-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {event.venue}
            </span>
          </div>

          {/* Countdown or CTA */}
          {isPast ? (
            <div className="lp-past-banner">This event has already taken place</div>
          ) : !ticketsOnSale ? (
            <div className="lp-countdown">
              <span className="lp-countdown-label">Tickets on sale in</span>
              <span className="lp-countdown-timer">{onSaleCountdown}</span>
            </div>
          ) : (
            <>
              {/* Tier selector (only if multiple tiers) */}
              {ticketTypes.length > 1 && (
                <div className="lp-tier-selector">
                  {ticketTypes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`lp-tier-btn ${t.id === selectedTierId ? "lp-tier-btn-active" : ""}`}
                      onClick={() => {
                        setSelectedTierId(t.id);
                        if (checkoutOpen) setCheckoutOpen(false);
                      }}
                    >
                      <span className="lp-tier-name">{t.name}</span>
                      <span className="lp-tier-price">${t.allInPrice.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Dynamic total price above CTA */}
              {!isFree && !checkoutOpen && (
                <div className="lp-checkout-price-display">
                  <span className="lp-checkout-price-amount">
                    ${(displayPrice * quantity).toFixed(2)}
                  </span>
                  <span className="lp-checkout-price-label">
                    {quantity > 1 ? "total" : "per ticket"} &middot; ALL-IN
                  </span>
                </div>
              )}

              {/* Quantity + CTA */}
              <div className="lp-cta-row">
                <div className="lp-qty-control">
                  <button
                    type="button"
                    className="lp-qty-btn"
                    onClick={() => {
                      setQuantity((q) => Math.max(1, q - 1));
                      if (checkoutOpen) setCheckoutOpen(false);
                    }}
                    disabled={quantity <= 1}
                  >
                    &minus;
                  </button>
                  <span className="lp-qty-value">{quantity}</span>
                  <button
                    type="button"
                    className="lp-qty-btn"
                    onClick={() => {
                      setQuantity((q) => Math.min(10, q + 1));
                      if (checkoutOpen) setCheckoutOpen(false);
                    }}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="lp-cta-btn"
                  onClick={handleGetTickets}
                  disabled={checkoutOpen}
                >
                  {isFree ? "Get Free Tickets" : "Get Tickets"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── INLINE CHECKOUT SECTION ─────────────────────────────────────── */}
      {checkoutOpen && !isPast && ticketsOnSale && (
        <section
          className="lp-checkout-section"
          ref={checkoutRef}
        >
          <div className="lp-checkout-section-inner">
            <h2 className="lp-checkout-heading">Checkout</h2>
            <p className="lp-checkout-summary">
              {quantity} &times; {selectedTier?.name ?? "Ticket"} &middot;{" "}
              {!isFree && <strong>${(displayPrice * quantity).toFixed(2)}</strong>}
              {isFree && <strong>Free</strong>}
            </p>

            <Elements
              stripe={stripePromise}
              options={{
                appearance: stripeAppearance,
                locale: "en",
              }}
            >
              <CheckoutForm
                event={event}
                selectedTier={selectedTier}
                quantity={quantity}
                displayPrice={displayPrice}
                isFree={isFree}
                onBack={handleBackFromCheckout}
              />
            </Elements>
          </div>
        </section>
      )}

      {/* ── MID SECTION — Why you can't miss this ─────────────────────── */}
      {!isPast && (
        <section className="lp-mid">
          <h2 className="lp-mid-heading">Why You Can&apos;t Miss This</h2>
          <div className="lp-bullets">
            <div className="lp-bullet">
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <div className="lp-bullet-title">Unforgettable Experience</div>
                <div className="lp-bullet-desc">A live event you&apos;ll be talking about for weeks</div>
              </div>
            </div>
            <div className="lp-bullet">
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <div className="lp-bullet-title">Limited Availability</div>
                <div className="lp-bullet-desc">Tickets are going fast &mdash; don&apos;t wait</div>
              </div>
            </div>
            <div className="lp-bullet">
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <div className="lp-bullet-title">Join the Crowd</div>
                <div className="lp-bullet-desc">{socialProofText}</div>
              </div>
            </div>
          </div>

          {/* Artist / description */}
          {event.description && (
            <div className="lp-about">
              <h3 className="lp-about-heading">About the Event</h3>
              <p className="lp-about-text">{event.description}</p>
            </div>
          )}
        </section>
      )}

      {/* ── SOCIAL PROOF BANNER ───────────────────────────────────────── */}
      {!isPast && attendeeCount >= 5 && (
        <section className="lp-social-proof">
          <div className="lp-social-proof-inner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>{attendeeCount}+ people already have their tickets</span>
          </div>
        </section>
      )}

      {/* ── BOTTOM CTA SECTION ─────────────────────────────────────── */}
      {!isPast && ticketsOnSale && !checkoutOpen && (
        <section className="lp-bottom-cta">
          <p className="lp-bottom-cta-text">Ready to secure your spot?</p>
          <button type="button" className="lp-cta-btn lp-cta-btn-lg" onClick={handleGetTickets}>
            Get Tickets
          </button>
        </section>
      )}

      {/* ── STICKY MOBILE CTA ────────────────────────────────────────── */}
      {!isPast && ticketsOnSale && !checkoutOpen && (
        <div className={`lp-sticky-bar ${isCtaVisible ? "lp-sticky-bar-visible" : ""}`}>
          <div className="lp-sticky-price">
            {isFree ? "Free" : `$${(displayPrice * quantity).toFixed(2)}`}
            {!isFree && (
              <span className="lp-sticky-price-label">
                {quantity > 1 ? "total" : "per ticket"} · ALL-IN
              </span>
            )}
          </div>
          <button type="button" className="lp-sticky-cta" onClick={handleGetTickets}>
            Get Tickets
          </button>
        </div>
      )}
    </main>
  );
}
