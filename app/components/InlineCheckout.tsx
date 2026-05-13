"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { formatPhoneNumber } from "@/lib/formatPhone";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { trackFbEvent } from "@/lib/fbq";

// ── Types ────────────────────────────────────────────────────────────────────

type OrderDetails = {
  subtotal: number;
  ticketingFee: number;
  facilityFee: number;
  tax: number;
  processingFee: number;
  discount: number;
  total: number;
};

type InlineCheckoutProps = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventVenue: string;
  tierId?: string;
  tierName: string;
  ticketPrice: number;
  quantity: number;
  promoCode?: string | null;
  selectedSeatIds?: string[];
  isFreeEvent?: boolean;
  onBack: () => void;
  // Fee breakdown (from venue settings, same as OrderSummary)
  ticketingFee?: number;
  facilityFee?: number;
  taxRate?: number;
  taxMethod?: "multiplier" | "divisor";
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

// Fee constants — same as OrderSummary and create-intent API
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FLAT_FEE = 0.30;

function normalizeTaxRate(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

function CheckoutForm({
  eventId,
  eventTitle,
  eventDate,
  eventVenue,
  tierId,
  tierName,
  ticketPrice,
  quantity,
  promoCode,
  selectedSeatIds,
  isFreeEvent,
  onBack,
  ticketingFee = 0,
  facilityFee = 0,
  taxRate = 0,
  taxMethod = "multiplier",
}: InlineCheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardError, setCardError] = useState("");
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  const [addedPaymentInfo, setAddedPaymentInfo] = useState(false);
  const [fwbOptIn, setFwbOptIn] = useState(false);

  // FWB signup state (post-payment one-click)
  const [fwbStatus, setFwbStatus] = useState<"idle" | "loading" | "done">("idle");

  // ── Fee calculation matching OrderSummary + create-intent API ────────────
  // Divisor = tax baked into face price; don't add it again at checkout.
  const rate = taxMethod === "divisor" ? 0 : normalizeTaxRate(taxRate);
  const subtotal = ticketPrice * quantity;
  const totalTicketingFee = ticketingFee * quantity;
  const totalFacilityFee = facilityFee * quantity;
  const tax = Math.round(subtotal * rate * 100) / 100;
  const subtotalBeforeStripe = subtotal + totalTicketingFee + totalFacilityFee + tax;
  const processingFee = Math.round((subtotalBeforeStripe * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE) * 100) / 100;
  const estimatedTotal = isFreeEvent ? 0 : subtotalBeforeStripe + processingFee;
  const isFullyFree = isFreeEvent || ticketPrice === 0;

  // Fire AddPaymentInfo when all card fields are complete
  useEffect(() => {
    if (cardNumberComplete && cardExpiryComplete && cardCvcComplete && !addedPaymentInfo) {
      setAddedPaymentInfo(true);
      trackFbEvent("AddPaymentInfo", {
        content_name: eventTitle,
        content_ids: [eventId],
        value: estimatedTotal,
        currency: "USD",
      });
    }
  }, [cardNumberComplete, cardExpiryComplete, cardCvcComplete, addedPaymentInfo, eventTitle, eventId, estimatedTotal]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!buyerName.trim()) { setPaymentError("Please enter your full name."); return; }
    if (!buyerEmail.trim() || !buyerEmail.includes("@")) { setPaymentError("Please enter a valid email."); return; }

    setIsProcessing(true);
    setPaymentError("");

    try {
      // ── Free checkout ──
      if (isFullyFree) {
        const res = await fetch("/api/checkout/free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            buyer_name: buyerName.trim(),
            buyer_email: buyerEmail.trim(),
            buyer_phone: buyerPhone.trim() || undefined,
            quantity,
            promo_code: promoCode || undefined,
            seat_ids: selectedSeatIds?.length ? selectedSeatIds : undefined,
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
          content_name: eventTitle,
          content_ids: [eventId],
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
          eventId,
          tierId: tierId || undefined,
          quantity,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          fwbOptIn,
          promoCode: promoCode || undefined,
          selectedSeats: selectedSeatIds?.length ? selectedSeatIds : undefined,
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
        trackFbEvent("Purchase", {
          content_name: eventTitle,
          content_ids: [eventId],
          value: data.orderDetails.total,
          currency: "USD",
          num_items: quantity,
        });

        setPaymentSuccess(true);
      }
    } catch {
      setPaymentError("An unexpected error occurred. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  // ── FWB one-click signup ──
  const handleFWBSignup = async () => {
    if (fwbStatus !== "idle") return;
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

      // 409 = already subscribed, treat as success
      if (res.ok || res.status === 409) {
        setFwbStatus("done");
      } else {
        setFwbStatus("done"); // still show done, don't block
      }
    } catch {
      setFwbStatus("done");
    }
  };

  // ── Success State ──────────────────────────────────────────────────────────
  if (paymentSuccess) {
    const finalTotal = orderDetails?.total ?? estimatedTotal;

    return (
      <div className="ic-success">
        <div className="ic-success-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="24" fill="rgba(16, 185, 129, 0.15)" />
            <path d="M14 24L21 31L34 18" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 className="ic-success-heading">You&apos;re In!</h2>
        <p className="ic-success-event">{eventTitle}</p>
        <p className="ic-success-meta">{eventDate} &middot; {eventVenue}</p>
        <p className="ic-success-detail">
          {quantity} ticket{quantity > 1 ? "s" : ""} &middot; ${finalTotal.toFixed(2)} paid
        </p>
        <p className="ic-success-email">
          Check your email at <strong>{buyerEmail}</strong> for your ticket{quantity > 1 ? "s" : ""} and confirmation.
        </p>

        {/* ── FWB Signup Prompt ── */}
        <div className="ic-fwb-prompt">
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
              <div className="ic-fwb-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="ic-fwb-heading">Don&apos;t Miss a Thing</h3>
              <p className="ic-fwb-desc">
                Get presale access, exclusive offers, and be first to know about new shows.
              </p>
              <button
                type="button"
                className="ic-fwb-join-btn"
                onClick={handleFWBSignup}
                disabled={fwbStatus === "loading"}
              >
                {fwbStatus === "loading" ? "Joining..." : "Count Me In"}
              </button>
              <p className="ic-fwb-fine-print">No spam. Unsubscribe anytime.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Checkout Form ──────────────────────────────────────────────────────────
  return (
    <div className="ic-form-wrap">
      <div className="ic-form-header">
        <button type="button" className="ic-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h3 className="ic-form-title">Checkout</h3>
      </div>

      {/* Order summary with full fee breakdown */}
      <div className="ic-order-breakdown">
        <div className="ic-order-line">
          <span>{tierName} &times; {quantity}</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        {totalTicketingFee > 0 && (
          <div className="ic-order-line ic-order-line-fee">
            <span>Ticketing fee</span>
            <span>${totalTicketingFee.toFixed(2)}</span>
          </div>
        )}
        {totalFacilityFee > 0 && (
          <div className="ic-order-line ic-order-line-fee">
            <span>Facility fee</span>
            <span>${totalFacilityFee.toFixed(2)}</span>
          </div>
        )}
        {tax > 0 && (
          <div className="ic-order-line ic-order-line-fee">
            <span>Tax</span>
            <span>${tax.toFixed(2)}</span>
          </div>
        )}
        {!isFullyFree && processingFee > 0 && (
          <div className="ic-order-line ic-order-line-fee">
            <span>Processing fee</span>
            <span>${processingFee.toFixed(2)}</span>
          </div>
        )}
        <div className="ic-order-line ic-order-total">
          <span>Total</span>
          <span>{isFullyFree ? <span style={{ color: "#22c55e", fontWeight: 800 }}>FREE</span> : `$${estimatedTotal.toFixed(2)}`}</span>
        </div>
      </div>

      <form className="ic-form" onSubmit={handleSubmit} noValidate>
        <div className="ic-field">
          <label className="ic-label" htmlFor="ic-name">Full Name</label>
          <input
            id="ic-name"
            type="text"
            className="ic-input"
            placeholder="Jane Doe"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>

        <div className="ic-field">
          <label className="ic-label" htmlFor="ic-email">Email</label>
          <input
            id="ic-email"
            type="email"
            className="ic-input"
            placeholder="jane@example.com"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>

        <div className="ic-field">
          <label className="ic-label" htmlFor="ic-phone">
            Phone <span className="ic-optional">(optional)</span>
          </label>
          <input
            id="ic-phone"
            type="tel"
            className="ic-input"
            placeholder="(555) 123-4567"
            value={buyerPhone}
            onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))}
            autoComplete="tel"
          />
        </div>

        {/* FWB opt-in */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={fwbOptIn}
            onChange={(e) => setFwbOptIn(e.target.checked)}
            style={{ marginTop: 2, accentColor: "#d0c290", width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.4 }}>
            Sign me up for exclusive offers &amp; rewards
          </span>
        </label>

        {/* Stripe Card Fields (only for paid checkout) */}
        {!isFullyFree && (
          <>
            <div className="ic-field">
              <label className="ic-label">Card Number</label>
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

            <div className="ic-card-row">
              <div className="ic-field" style={{ flex: 1 }}>
                <label className="ic-label">Expiry</label>
                <div className="ic-stripe-field">
                  <CardExpiryElement
                    onChange={(e) => {
                      setCardExpiryComplete(e.complete);
                      if (e.error) setCardError(e.error.message);
                    }}
                  />
                </div>
              </div>
              <div className="ic-field" style={{ flex: 1 }}>
                <label className="ic-label">CVC</label>
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
          </>
        )}

        {cardError && <p className="ic-error">{cardError}</p>}
        {paymentError && <p className="ic-error">{paymentError}</p>}

        <button
          type="submit"
          className="ic-pay-btn"
          disabled={isProcessing || (!isFullyFree && (!cardNumberComplete || !cardExpiryComplete || !cardCvcComplete))}
        >
          {isProcessing
            ? "Processing..."
            : isFullyFree
              ? "Claim Free Ticket" + (quantity > 1 ? "s" : "")
              : `Pay $${estimatedTotal.toFixed(2)}`
          }
        </button>

        <p className="ic-terms">
          All sales are final. Refunds only if event is cancelled.
        </p>
      </form>
    </div>
  );
}

// ── Main Export (wraps CheckoutForm in Elements) ─────────────────────────────

export default function InlineCheckout(props: InlineCheckoutProps) {
  return (
    <Elements stripe={stripePromise} options={{ appearance: stripeAppearance }}>
      <CheckoutForm {...props} />
    </Elements>
  );
}
