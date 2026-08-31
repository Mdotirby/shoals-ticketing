"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import TicketPreparingLoader from "@/app/components/TicketPreparingLoader";
import { loadStripe } from "@stripe/stripe-js";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { onlineSurchargeDollars } from "@/lib/fees/rates";
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
import { trackFbEvent } from "@/lib/fbq";
import { getStoredUtmParams } from "@/lib/clientAttribution";

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
  presaleCode?: string | null;
  selectedSeatIds?: string[];
  isFreeEvent?: boolean;
  onBack: () => void;
  // Fee breakdown (from venue settings, same as OrderSummary)
  ticketingFee?: number;
  facilityFee?: number;
  taxRate?: number;
  taxMethod?: "multiplier" | "divisor";
  /** Ticketing fee + facility fee are already baked into ticketPrice — don't add them again. */
  feesIncludedInPrice?: boolean;
  /**
   * Called when the server rejects the selected seats as no longer available
   * (someone else bought them while this buyer was filling in the form).
   * Receives the seat ids the server flagged so the parent can drop them from
   * the selection and re-pull the map — otherwise a retry re-sends the same
   * dead seats and fails identically every time.
   */
  onSeatsUnavailable?: (unavailableSeatIds: string[]) => void;
};

// ── Stripe loader (singleton) ────────────────────────────────────────────────

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ""
);

// ── Stripe Appearance API config (dark theme) ────────────────────────────────

const stripeAppearance = {
  theme: "night" as const,
  variables: {
    colorPrimary: "rgb(var(--vc-gold-rgb))",
    colorBackground: "rgba(255, 255, 255, 0.04)",
    colorText: "#ffffff",
    colorTextSecondary: "rgba(255, 255, 255, 0.5)",
    colorTextPlaceholder: "rgba(255, 255, 255, 0.3)",
    colorDanger: "#ef4444",
    fontFamily: "var(--font-urbanist), system-ui, sans-serif",
    fontSizeBase: "16px",
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
      fontSize: "16px",
      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
    },
    ".Input:focus": {
      borderColor: "rgba(var(--vc-gold-rgb), 0.5)",
      boxShadow: "0 0 0 2px rgba(var(--vc-gold-rgb), 0.15)",
    },
    ".Input--invalid": {
      borderColor: "#ef4444",
      boxShadow: "0 0 0 2px rgba(239, 68, 68, 0.15)",
    },
    // Chrome/Safari autofill forces its own black text color on the input
    // (via -webkit-text-fill-color), overriding the color set above — this
    // pins it back to white when a saved card gets autofilled.
    ".Input:-webkit-autofill": {
      "-webkit-text-fill-color": "#ffffff",
      "-webkit-box-shadow": "0 0 0 1000px rgba(255, 255, 255, 0.04) inset",
      caretColor: "#ffffff",
    } as Record<string, string>,
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
  presaleCode,
  selectedSeatIds,
  isFreeEvent,
  onBack,
  ticketingFee = 0,
  facilityFee = 0,
  taxRate = 0,
  taxMethod = "multiplier",
  feesIncludedInPrice = false,
  onSeatsUnavailable,
}: InlineCheckoutProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerZip, setBuyerZip] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const router = useRouter();
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const [cardError, setCardError] = useState("");
  const [orderDetails, setOrderDetails] = useState<OrderDetails | null>(null);
  // Price details disclosure — collapsed by default, matches the all-inclusive
  // price shown above it; expanding reveals the itemized fee/tax breakdown.
  const [showDetails, setShowDetails] = useState(false);
  const [addedPaymentInfo, setAddedPaymentInfo] = useState(false);
  const [fwbOptIn, setFwbOptIn] = useState(false);

  // Ticket link for the success modal — known immediately for free checkout,
  // resolved via polling for paid (ticket is created async by the Stripe webhook).
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  // Free registrations never create a payment intent, so the confirmation
  // page is keyed on the order id instead.
  const [freeOrderId, setFreeOrderId] = useState<string | null>(null);

  // Apple Pay / Google Pay via Stripe PaymentRequest
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

  // ── Fee calculation matching OrderSummary + create-intent API ────────────
  // Divisor = tax baked into face price; don't add it again at checkout.
  const rate = taxMethod === "divisor" ? 0 : normalizeTaxRate(taxRate);
  const subtotal = ticketPrice * quantity;
  const totalTicketingFee = ticketingFee * quantity;
  const totalFacilityFee = facilityFee * quantity;
  const tax = Math.round(subtotal * rate * 100) / 100;
  const subtotalBeforeStripe = feesIncludedInPrice
    ? subtotal + tax
    : subtotal + totalTicketingFee + totalFacilityFee + tax;
  // When fees are baked into the price, the venue absorbs the card
  // processing fee too — the customer is charged exactly subtotalBeforeStripe.
  const processingFee = feesIncludedInPrice
    ? 0
    : onlineSurchargeDollars(subtotalBeforeStripe);
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

  // Apple Pay / Google Pay — set up PaymentRequest once stripe is loaded
  useEffect(() => {
    if (!stripe || isFullyFree) return;

    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: eventTitle, amount: Math.round(estimatedTotal * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true,
    });

    pr.on("paymentmethod", async (ev) => {
      setIsProcessing(true);
      setPaymentError("");
      try {
        const res = await fetch("/api/checkout/create-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId,
            tierId: tierId || undefined,
            quantity,
            buyerName: ev.payerName || "",
            buyerEmail: ev.payerEmail || "",
            buyerPhone: ev.payerPhone || "",
            fwbOptIn: false,
            promoCode: promoCode || undefined,
            presaleCode: presaleCode || undefined,
            selectedSeats: selectedSeatIds?.length ? selectedSeatIds : undefined,
            sessionId: typeof sessionStorage !== "undefined" ? (sessionStorage.getItem("vc_session") || undefined) : undefined,
            trackingRef: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : undefined,
            ...getStoredUtmParams(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          ev.complete("fail");
          if (res.status === 409 && Array.isArray(data.unavailable)) {
            setPaymentError("Those seats were just taken by another buyer. We've cleared them — please pick again from the map.");
            setIsProcessing(false);
            onSeatsUnavailable?.(data.unavailable as string[]);
            return;
          }
          setPaymentError(data.error || "Payment failed. Please try again.");
          setIsProcessing(false);
          return;
        }
        setOrderDetails(data.orderDetails);
        setPaymentIntentId(data.paymentIntentId ?? null);
        const { error: confirmError } = await stripe.confirmCardPayment(
          data.clientSecret,
          { payment_method: ev.paymentMethod.id },
          { handleActions: false }
        );
        if (confirmError) {
          ev.complete("fail");
          setPaymentError(confirmError.message || "Payment failed. Please try again.");
          setIsProcessing(false);
          return;
        }
        ev.complete("success");
        trackFbEvent("Purchase", {
          content_name: eventTitle,
          content_ids: [eventId],
          value: data.orderDetails.total,
          currency: "USD",
          num_items: quantity,
        });
        setPaymentSuccess(true);
      } catch {
        ev.complete("fail");
        setPaymentError("An unexpected error occurred. Please try again.");
        setIsProcessing(false);
      }
    });

    pr.canMakePayment().then((result) => {
      if (result) setPaymentRequest(pr);
    });

    return () => { setPaymentRequest(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripe]);

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
            presale_code: presaleCode || undefined,
            seat_ids: selectedSeatIds?.length ? selectedSeatIds : undefined,
            tracking_ref: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : undefined,
            ...getStoredUtmParams(),
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
        setTicketUrl(data.ticket_url ?? null);
        setFreeOrderId(data.order_id ?? null);
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
          buyerZip: buyerZip.trim() || undefined,
          fwbOptIn,
          promoCode: promoCode || undefined,
          presaleCode: presaleCode || undefined,
          selectedSeats: selectedSeatIds?.length ? selectedSeatIds : undefined,
          sessionId: typeof sessionStorage !== "undefined" ? (sessionStorage.getItem("vc_session") || undefined) : undefined,
          trackingRef: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : undefined,
          ...getStoredUtmParams(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Seats were taken while this buyer was filling in the form — hand the
        // ids back so the map refreshes and the dead seats leave the selection,
        // instead of leaving them to retry the same doomed purchase.
        if (res.status === 409 && Array.isArray(data.unavailable)) {
          setPaymentError("Those seats were just taken by another buyer. We've cleared them — please pick again from the map.");
          setIsProcessing(false);
          onSeatsUnavailable?.(data.unavailable as string[]);
          return;
        }
        setPaymentError(data.error || "Failed to create payment. Please try again.");
        setIsProcessing(false);
        return;
      }

      setOrderDetails(data.orderDetails);
      setPaymentIntentId(data.paymentIntentId ?? null);

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
              address: buyerZip.trim() ? { postal_code: buyerZip.trim() } : undefined,
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

  // Navigate to the confirmation page once payment settles. Kept in an effect
  // rather than called inline at the point of success so it runs after render
  // and cannot fire during React's commit phase.
  useEffect(() => {
    if (!paymentSuccess) return;
    const key = paymentIntentId
      ? `payment_intent_id=${paymentIntentId}`
      : freeOrderId
        ? `order_id=${freeOrderId}`
        : null;
    // With no key there is nothing for the confirmation page to look up; send
    // them straight to the ticket instead of a page that can only error.
    router.push(key ? `/checkout/success?${key}` : (ticketUrl ?? "/events"));
  }, [paymentSuccess, paymentIntentId, freeOrderId, ticketUrl, router]);

  // ── Success State ──────────────────────────────────────────────────────────
  // Confirmation is its own page now, not a modal over the checkout form. The
  // order may not exist yet — the Stripe webhook creates it asynchronously —
  // so we hand the confirmation page the key it can poll on: the payment
  // intent for card/wallet, or the order id for free registrations, which
  // never touch Stripe.
  if (paymentSuccess) {
    return (
      <div className="ic-form-wrap ic-redirecting">
        <TicketPreparingLoader sublabel="Payment confirmed — hang tight." />
      </div>
    );
  }

  // ── Checkout Form ──────────────────────────────────────────────────────────
  return (
    <div className="ic-form-wrap">
      {/* Step progress indicator */}
      <div className="ic-progress-bar">
        <div className="ic-progress-step ic-progress-done">
          <span className="ic-progress-dot" />
          <span className="ic-progress-label">Tickets</span>
        </div>
        <div className="ic-progress-connector ic-progress-connector-done" />
        <div className={`ic-progress-step ${paymentSuccess ? "ic-progress-done" : "ic-progress-active"}`}>
          <span className="ic-progress-dot" />
          <span className="ic-progress-label">Checkout</span>
        </div>
        <div className={`ic-progress-connector ${paymentSuccess ? "ic-progress-connector-done" : ""}`} />
        <div className={`ic-progress-step ${paymentSuccess ? "ic-progress-active" : ""}`}>
          <span className="ic-progress-dot" />
          <span className="ic-progress-label">Done</span>
        </div>
      </div>

      <div className="ic-form-header">
        <button type="button" className="ic-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h3 className="ic-form-title">Checkout</h3>
      </div>

      {/* Order summary — all-inclusive price by default, itemized breakdown behind a toggle */}
      <div className="ic-order-breakdown">
        <div className="ic-order-line">
          <span>{tierName} &times; {quantity}</span>
          <span>{isFullyFree ? <span style={{ color: "#22c55e", fontWeight: 800 }}>FREE</span> : `$${estimatedTotal.toFixed(2)}`}</span>
        </div>
        {!isFullyFree && (
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            (Incl. Taxes &amp; Fees)
          </p>
        )}

        {!isFullyFree && (totalTicketingFee > 0 || totalFacilityFee > 0 || tax > 0 || processingFee > 0) && (
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            style={{
              background: "none", border: "none", color: "rgb(var(--vc-gold-rgb))", cursor: "pointer",
              fontSize: 12, padding: 0, margin: "6px 0", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {showDetails ? "Hide" : "Show"} price details
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ transform: showDetails ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {showDetails && (
        <>
        <div className="ic-order-line ic-order-line-fee">
          <span>{tierName} &times; {quantity}</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        {totalTicketingFee > 0 && (
          <div className="ic-order-line ic-order-line-fee">
            <span>Ticketing fee</span>
            {feesIncludedInPrice ? (
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Included in ticket price</span>
            ) : (
              <span>${totalTicketingFee.toFixed(2)}</span>
            )}
          </div>
        )}
        {totalFacilityFee > 0 && (
          <div className="ic-order-line ic-order-line-fee">
            <span>Facility fee</span>
            {feesIncludedInPrice ? (
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Included in ticket price</span>
            ) : (
              <span>${totalFacilityFee.toFixed(2)}</span>
            )}
          </div>
        )}
        {taxMethod === "divisor" && normalizeTaxRate(taxRate) > 0 ? (
          <div className="ic-order-line ic-order-line-fee">
            <span>Sales tax</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Included in ticket price</span>
          </div>
        ) : tax > 0 ? (
          <div className="ic-order-line ic-order-line-fee">
            <span>Sales tax</span>
            <span>${tax.toFixed(2)}</span>
          </div>
        ) : null}
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
        </>
        )}
      </div>

      <form className="ic-form" onSubmit={handleSubmit} noValidate>
        {/* Apple Pay / Google Pay — up top so it's seen before people manually
            type their info; only appears when the browser supports it and
            Stripe is configured for the domain */}
        {paymentRequest && !isFullyFree && (
          <div className="ic-wallet-section">
            <PaymentRequestButtonElement
              options={{
                paymentRequest,
                style: {
                  paymentRequestButton: { theme: "dark", height: "48px", type: "buy" },
                },
              }}
            />
            <div className="ic-wallet-divider"><span>or pay by card</span></div>
          </div>
        )}

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

        <div className="ic-field">
          <label className="ic-label" htmlFor="ic-zip">
            ZIP Code <span className="ic-optional">(optional)</span>
          </label>
          <input
            id="ic-zip"
            type="text"
            inputMode="numeric"
            className="ic-input"
            placeholder="35630"
            value={buyerZip}
            onChange={(e) => setBuyerZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
            autoComplete="postal-code"
          />
        </div>

        {/* FWB opt-in */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginBottom: 4 }}>
          <input
            type="checkbox"
            checked={fwbOptIn}
            onChange={(e) => setFwbOptIn(e.target.checked)}
            style={{ marginTop: 2, accentColor: "rgb(var(--vc-gold-rgb))", width: 16, height: 16, flexShrink: 0 }}
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
