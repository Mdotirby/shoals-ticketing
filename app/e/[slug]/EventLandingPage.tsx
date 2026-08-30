"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { trackFbEvent } from "@/lib/fbq";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { onlineSurchargeDollars } from "@/lib/fees/rates";
import { formatEventDateFull, formatEventTime } from "@/lib/dates";
import { loadStripe } from "@stripe/stripe-js";
import TrackingPixels from "@/app/components/TrackingPixels";
import CheckoutSuccessModal from "@/app/components/CheckoutSuccessModal";
import { persistUtmParams, getStoredUtmParams } from "@/lib/clientAttribution";
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

// ── Types ────────────────────────────────────────────────────────────────────

type TicketType = {
  id: string;
  name: string;
  basePrice: number;
  allInPrice: number;
  capacity: number;
  quantitySold: number;
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
  externalTicketUrl: string | null;
  externalTicketLabel: string | null;
};

type FeaturedArtist = {
  id: string;
  name: string;
  avatar_url?: string;
  website_url?: string;
};

type VenueInfo = {
  address?: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  directions_car?: string;
  parking_info?: string;
  directions_transit?: string;
};

type Fees = {
  ticketingFee: number;   // flat dollars per ticket
  facilityFee: number;    // flat dollars per ticket
  taxRate: number;        // decimal (e.g. 0.095)
  taxMethod: "multiplier" | "divisor";
  /** Ticketing fee + facility fee are already baked into the ticket price. */
  feesIncludedInPrice?: boolean;
};

type OtherEvent = {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
  image_url?: string;
  is_free: boolean;
};

type Props = {
  event: EventData;
  ticketTypes: TicketType[];
  attendeeCount: number;
  featuredArtists?: FeaturedArtist[];
  venueInfo?: VenueInfo;
  fees?: Fees;
  slug?: string;
  presaleAvailable?: boolean;
  otherEvents?: OtherEvent[];
  metaPixelId?: string | null;
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
      borderColor: "rgba(208, 194, 144, 0.5)",
      boxShadow: "0 0 0 2px rgba(208, 194, 144, 0.15)",
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

function CheckoutForm({
  event,
  selectedTier,
  quantity,
  displayPrice,
  isFree,
  onBack,
  fees,
  otherEvents = [],
  presaleCode,
}: {
  event: EventData;
  selectedTier: TicketType;
  quantity: number;
  displayPrice: number;
  isFree: boolean;
  onBack: () => void;
  fees?: Fees;
  otherEvents?: OtherEvent[];
  presaleCode?: string | null;
}) {
  const stripe = useStripe();
  const elements = useElements();

  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerZip, setBuyerZip] = useState("");
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

  // Ticket link for the success modal — known immediately for free checkout,
  // resolved via polling for paid (ticket is created async by the Stripe webhook).
  const [ticketUrl, setTicketUrl] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);

  // Apple Pay / Google Pay via Stripe PaymentRequest — this form is a
  // separate hand-maintained copy of InlineCheckout.tsx's checkout form and
  // never received this feature when it was added there (PR "Move Apple
  // Pay/Google Pay button to the top of the checkout form"); ported here
  // with the same shape, adapted to this file's own promo-code/field names.
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

  // Correct total: flat CC fee applied once per transaction, not once per ticket.
  // Use basePrice so the $0.30 flat fee isn't baked in per-ticket like allInPrice is.
  // Divisor: tax baked in — don't add it again to the estimated total.
  const effectiveTaxRateForTotal = fees?.taxMethod === "divisor" ? 0 : (fees?.taxRate ?? 0);
  const feesIncludedInPrice = fees?.feesIncludedInPrice === true;
  const basePreStripe =
    selectedTier.basePrice > 0
      ? (
          selectedTier.basePrice +
          (feesIncludedInPrice ? 0 : (fees?.ticketingFee ?? 0)) +
          (feesIncludedInPrice ? 0 : (fees?.facilityFee ?? 0)) +
          Math.round(selectedTier.basePrice * effectiveTaxRateForTotal * 100) / 100
        ) * quantity
      : displayPrice * quantity;
  // When fees are baked into the price, the venue absorbs the card
  // processing fee too — the customer is charged exactly the pre-Stripe amount.
  const estimatedTotal =
    basePreStripe > 0
      ? feesIncludedInPrice
        ? Math.round(basePreStripe * 100) / 100
        : Math.round((basePreStripe + onlineSurchargeDollars(basePreStripe)) * 100) / 100
      : 0;

  // Discounted total — apply promo to base price, then recalculate fees + CC fee once
  const discountedBasePerTicket =
    promoApplied && discountType
      ? discountType === "percentage"
        ? selectedTier.basePrice * (1 - discountValue / 100)
        : Math.max(0, selectedTier.basePrice - discountValue)
      : selectedTier.basePrice;
  const discountedPreStripe =
    discountedBasePerTicket > 0
      ? (
          discountedBasePerTicket +
          (feesIncludedInPrice ? 0 : (fees?.ticketingFee ?? 0)) +
          (feesIncludedInPrice ? 0 : (fees?.facilityFee ?? 0)) +
          Math.round(discountedBasePerTicket * effectiveTaxRateForTotal * 100) / 100
        ) * quantity
      : 0;
  const discountedTotal =
    discountedPreStripe > 0
      ? feesIncludedInPrice
        ? Math.round(discountedPreStripe * 100) / 100
        : Math.round((discountedPreStripe + onlineSurchargeDollars(discountedPreStripe)) * 100) / 100
      : 0;
  const isFullyFree = isFree || (promoApplied && discountedBasePerTicket <= 0);

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

  // Apple Pay / Google Pay — set up PaymentRequest once stripe is loaded
  useEffect(() => {
    if (!stripe || isFullyFree) return;

    const pr = stripe.paymentRequest({
      country: "US",
      currency: "usd",
      total: { label: event.title, amount: Math.round(estimatedTotal * 100) },
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
            eventId: event.id,
            tierId: selectedTier.id,
            quantity,
            buyerName: ev.payerName || "",
            buyerEmail: ev.payerEmail || "",
            buyerPhone: ev.payerPhone || "",
            promoCode: promoApplied ? promoCode.trim() : undefined,
            presaleCode: presaleCode || undefined,
            trackingRef: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : undefined,
            ...getStoredUtmParams(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          ev.complete("fail");
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
          content_name: event.title,
          content_ids: [event.id],
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
            presale_code: presaleCode || undefined,
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
          content_name: event.title,
          content_ids: [event.id],
          value: 0,
          currency: "USD",
          num_items: quantity,
        });

        setOrderDetails({ subtotal: 0, ticketingFee: 0, facilityFee: 0, tax: 0, processingFee: 0, discount: estimatedTotal, total: 0 });
        setTicketUrl(data.ticket_url ?? null);
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
          buyerZip: buyerZip.trim() || undefined,
          promoCode: promoApplied ? promoCode.trim() : undefined,
          presaleCode: presaleCode || undefined,
          trackingRef: typeof sessionStorage !== "undefined" ? sessionStorage.getItem("vc_tracking_ref") : undefined,
          ...getStoredUtmParams(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
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
      <>
        <CheckoutSuccessModal
          eventTitle={event.title}
          eventDate={eventDate}
          eventVenue={event.venue}
          quantity={quantity}
          totalAmount={finalTotal}
          buyerName={buyerName}
          buyerEmail={buyerEmail}
          buyerPhone={buyerPhone}
          ticketUrl={ticketUrl}
          paymentIntentId={paymentIntentId}
        />

        {/* You May Also Like — normal page content behind the modal overlay */}
        {otherEvents.length > 0 && (
          <div style={{ marginTop: 36, width: "100%", textAlign: "center" }}>
            <style>{`
              @keyframes lp-ymal-in {
                from { opacity: 0; transform: translateY(18px); }
                to   { opacity: 1; transform: none; }
              }
              .lp-ymal-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
              .lp-ymal-card {
                box-sizing:border-box; aspect-ratio:3/2;
                display:flex; flex-direction:column; justify-content:flex-start; align-items:flex-start;
                padding:8px; box-shadow:inset 0 0 1px 1px #2d3139; overflow:hidden; gap:4px;
                background-size:cover; background-repeat:no-repeat; background-position:center; background-color:#1a1c2e;
                position:relative; border-radius:13px; isolation:isolate; text-decoration:none; color:inherit;
                transform:translateY(0); transition:transform 180ms ease,box-shadow 180ms ease;
                animation:lp-ymal-in 0.42s cubic-bezier(0.22,1,0.36,1) both;
              }
              .lp-ymal-card:nth-child(1){animation-delay:0.05s;}
              .lp-ymal-card:nth-child(2){animation-delay:0.12s;}
              .lp-ymal-card:nth-child(3){animation-delay:0.19s;}
              .lp-ymal-card:nth-child(4){animation-delay:0.26s;}
              .lp-ymal-card:hover { transform:translateY(-4px); box-shadow:inset 0 0 1px 1px #2d3139,0 8px 20px rgba(0,0,0,0.35); }
              .lp-ymal-glow { width:200%; height:80%; display:block; filter:blur(18px); background:radial-gradient(50% 50% at 50% 50%,rgba(208,194,144,0.7) 0%,rgba(0,76,255,0.02) 100%); z-index:0; border-radius:100%; position:absolute; left:50%; bottom:-55%; transform:translateX(-50%); pointer-events:none; }
              .lp-ymal-venue { max-width:calc(100% - 8px); display:flex; align-items:center; padding:2px 6px; background-color:rgba(208,194,144,0.5); border-radius:3px; position:relative; z-index:2; font-size:9px; font-weight:700; color:#0b0d1d; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
              .lp-ymal-content { width:100%; margin-top:auto; display:flex; flex-direction:column; align-items:flex-start; gap:4px; position:relative; z-index:2; }
              .lp-ymal-title { width:100%; font-family:var(--font-bayon),sans-serif; font-size:clamp(14px,4vw,20px); line-height:1.05; color:#fff; margin:0; text-align:left; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; text-shadow:0 1px 6px rgba(0,0,0,0.6); }
              .lp-ymal-badges { display:flex; flex-wrap:nowrap; gap:4px; }
              .lp-ymal-badge { display:inline-flex; align-items:center; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08); padding:3px 8px; border-radius:999px; font-size:9px; font-weight:600; color:rgba(255,255,255,0.85); white-space:nowrap; }
            `}</style>
            <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 14px" }}>
              You May Also Like
            </p>
            <div className="lp-ymal-grid">
              {otherEvents.map((ev) => {
                const isFree = ev.is_free || ev.price === 0;
                const dateObj = ev.date && ev.date.length === 10 ? new Date(`${ev.date}T12:00:00`) : new Date(ev.date);
                const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <a
                    key={ev.id}
                    href={`/events/${ev.id}`}
                    className="lp-ymal-card"
                    style={{
                      backgroundImage: ev.image_url
                        ? `url(${ev.image_url})`
                        : "linear-gradient(145deg, #202045 0%, #0b0d1d 100%)",
                    }}
                  >
                    <span className="lp-ymal-glow" />
                    <div className="lp-ymal-venue">{ev.venue}</div>
                    <div className="lp-ymal-content">
                      <p className="lp-ymal-title">{ev.title}</p>
                      <div className="lp-ymal-badges">
                        <span className="lp-ymal-badge">{isFree ? "Free" : `$${ev.price.toFixed(2)}`}</span>
                        <span className="lp-ymal-badge">{dateStr}</span>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Checkout Form ──────────────────────────────────────────────────────────
  return (
    <form className="lp-checkout-form" onSubmit={handleSubmit} noValidate>
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
          onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))}
          autoComplete="tel"
        />
      </div>

      <div className="lp-checkout-field">
        <label className="lp-checkout-label" htmlFor="lp-zip">ZIP Code</label>
        <input
          id="lp-zip"
          type="text"
          inputMode="numeric"
          className="lp-checkout-input"
          placeholder="12345"
          value={buyerZip}
          onChange={(e) => setBuyerZip(e.target.value.replace(/\D/g, "").slice(0, 10))}
          autoComplete="postal-code"
          maxLength={10}
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

export default function EventLandingPage({ event, ticketTypes, attendeeCount, featuredArtists = [], venueInfo, fees, slug = "", presaleAvailable = false, otherEvents = [], metaPixelId = null }: Props) {
  // Fall back to sensible defaults if the server didn't pass fees (older
  // callers / unit tests).
  const resolvedFees: Fees = fees ?? { ticketingFee: 0, facilityFee: 0, taxRate: 0, taxMethod: "multiplier" };
  const searchParams = useSearchParams();
  const [quantity, setQuantity] = useState(1);
  const [selectedTierId, setSelectedTierId] = useState(
    (ticketTypes.find((t) => t.quantitySold < t.capacity) ?? ticketTypes[0])?.id ?? ""
  );
  const [onSaleCountdown, setOnSaleCountdown] = useState<string | null>(null);
  const [ticketsOnSale, setTicketsOnSale] = useState(true);
  const [isCtaVisible, setIsCtaVisible] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const checkoutRef = useRef<HTMLDivElement>(null);

  // Presale unlock state
  const [presaleUnlocked, setPresaleUnlocked] = useState(false);
  const [presalePanelVisible, setPresalePanelVisible] = useState(false);
  const [presaleCodeInput, setPresaleCodeInput] = useState("");
  const [presaleError, setPresaleError] = useState<string | null>(null);
  const [presaleLoading, setPresaleLoading] = useState(false);
  const [presaleShake, setPresaleShake] = useState(false);
  const [presaleType, setPresaleType] = useState<"artist" | "venue" | null>(null);
  const [presaleCode, setPresaleCode] = useState<string | null>(null);

  const selectedTier = ticketTypes.find((t) => t.id === selectedTierId) ?? ticketTypes[0];
  const displayPrice = selectedTier ? selectedTier.allInPrice : 0;
  const isFree = event.isFree || displayPrice === 0;
  const selectedTierSoldOut = selectedTier
    ? selectedTier.quantitySold >= selectedTier.capacity
    : false;

  // Total for the CTA — fee applied once per transaction, not per ticket.
  // allInPrice already bakes in a per-ticket flat fee, so multiplying by quantity
  // over-charges on the flat portion. Compute from basePrice instead.
  const ctaEffectiveTaxRate = resolvedFees.taxMethod === "divisor" ? 0 : resolvedFees.taxRate;
  const ctaPreStripe = selectedTier
    ? (selectedTier.basePrice +
        (resolvedFees.feesIncludedInPrice ? 0 : resolvedFees.ticketingFee + resolvedFees.facilityFee) +
        Math.round(selectedTier.basePrice * ctaEffectiveTaxRate * 100) / 100) * quantity
    : 0;
  const ctaTotal = ctaPreStripe > 0
    ? resolvedFees.feesIncludedInPrice
      ? Math.round(ctaPreStripe * 100) / 100
      : Math.round((ctaPreStripe + onlineSurchargeDollars(ctaPreStripe)) * 100) / 100
    : 0;

  // ── Restore presale session ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`vc_presale_${event.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.unlocked) {
          setPresaleUnlocked(true);
          setPresaleType(parsed.type ?? null);
          setPresaleCode(parsed.code ?? null);
        }
      }
    } catch { /* ignore */ }
  }, [event.id]);

  // ── Persist tracking ref ──────────────────────────────────────────────────
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      sessionStorage.setItem("vc_tracking_ref", ref);
    }
    persistUtmParams(searchParams);
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

  // ── Scroll-triggered reveals ───────────────────────────────────────────────
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("lp-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -32px 0px" }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // ── Track external ticket click-through ───────────────────────────────────
  const handleExternalTicketClick = useCallback(() => {
    trackFbEvent("InitiateCheckout", {
      content_name: event.title,
      content_ids: [event.id],
      value: displayPrice,
      currency: "USD",
      num_items: 1,
    });
    // Record in event_views with external_ticket_click source so reports can separate
    // click-throughs from page views
    const sessionId = sessionStorage.getItem("vc_session") || "";
    fetch(`/api/landing/${event.id}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        utm_source: "external_ticket_click",
        referrer_url: window.location.href,
      }),
    }).catch(() => {});
  }, [event.id, event.title, displayPrice]);

  // ── CTA click handler — opens inline checkout ──────────────────────────────
  const handleGetTickets = useCallback(() => {
    if (!ticketsOnSale && !presaleUnlocked) return;

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

  // ── Presale code validation ───────────────────────────────────────────────
  const handlePresaleUnlock = useCallback(async () => {
    const code = presaleCodeInput.trim().toUpperCase();
    if (!code) return;
    setPresaleLoading(true);
    setPresaleError(null);

    try {
      const res = await fetch(`/api/events/${event.id}/presale/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (data.valid) {
        // Store in session so refresh doesn't re-lock
        try {
          sessionStorage.setItem(
            `vc_presale_${event.id}`,
            JSON.stringify({ unlocked: true, type: data.type, code })
          );
        } catch { /* ignore */ }
        setPresaleType(data.type);
        setPresaleCode(code);
        setPresaleUnlocked(true);
      } else {
        setPresaleError(data.message || "That code isn't valid or the presale window isn't open yet");
        setPresaleShake(true);
        setTimeout(() => setPresaleShake(false), 500);
      }
    } catch {
      setPresaleError("Unable to validate code. Please try again.");
      setPresaleShake(true);
      setTimeout(() => setPresaleShake(false), 500);
    } finally {
      setPresaleLoading(false);
    }
  }, [event.id, presaleCodeInput]);

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
      {metaPixelId && <TrackingPixels metaPixelId={metaPixelId} />}

      {/* ── Presale animation styles — hoisted so they survive the unlock transition ── */}
      {presaleAvailable && (
        <style>{`
          @keyframes lp-presale-panel-in {
            0%   { transform: translateY(-18px) scale(0.95); opacity: 0; filter: blur(10px); }
            60%  { transform: translateY(4px)   scale(1.01); opacity: 1; filter: blur(0);   }
            100% { transform: translateY(0)     scale(1);    opacity: 1; filter: blur(0);   }
          }
          @keyframes lp-presale-shake {
            0%   { transform: translateX(0)    rotate(0deg);    }
            10%  { transform: translateX(-10px) rotate(-1.4deg); }
            22%  { transform: translateX(10px)  rotate(1.4deg);  }
            35%  { transform: translateX(-7px)  rotate(-0.8deg); }
            48%  { transform: translateX(7px)   rotate(0.8deg);  }
            60%  { transform: translateX(-4px)  rotate(-0.3deg); }
            72%  { transform: translateX(4px)   rotate(0.3deg);  }
            85%  { transform: translateX(-1px);                  }
            100% { transform: translateX(0)    rotate(0deg);    }
          }
          @keyframes lp-presale-badge-in {
            0%   { transform: scale(0.68) translateY(12px); opacity: 0; }
            55%  { transform: scale(1.09) translateY(-3px); opacity: 1; }
            78%  { transform: scale(0.97) translateY(0);                }
            100% { transform: scale(1)   translateY(0);    opacity: 1; }
          }
          @keyframes lp-presale-badge-shimmer {
            0%   { background-position: -220% center; }
            100% { background-position: 220% center;  }
          }
          @keyframes lp-presale-link-breathe {
            0%, 100% { opacity: 0.55; }
            50%       { opacity: 0.92; }
          }
          .lp-presale-link {
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            color: rgba(208, 194, 144, 0.7);
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.01em;
            position: relative;
            display: inline-block;
            animation: lp-presale-link-breathe 2.6s ease-in-out infinite;
            transition: color 0.2s ease;
          }
          .lp-presale-link:hover {
            color: rgba(208, 194, 144, 1);
            animation: none;
          }
          .lp-presale-link::after {
            content: "";
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 0;
            height: 1px;
            background: rgba(208, 194, 144, 0.7);
            transition: width 0.28s ease;
          }
          .lp-presale-link:hover::after { width: 100%; }
          .lp-presale-input:focus {
            border-color: rgba(208, 194, 144, 0.45) !important;
            box-shadow: 0 0 0 3px rgba(208, 194, 144, 0.07) !important;
            outline: none;
          }
        `}</style>
      )}

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
            {isPast
              ? "This event has passed"
              : slug === "payton-howie"
                ? "A girl with 4 million streams, a Garth Brooks tour credit, and a Saturday night in June."
                : event.isFree
                  ? `Free live music at ${event.venue || "the venue"} \u2014 grab your spot.`
                  : `Live at ${event.venue || "the venue"} \u2014 don\u2019t miss it.`}
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
          {event.externalTicketUrl ? (
            <a
              href={event.externalTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-cta-btn"
              style={{ textAlign: "center", textDecoration: "none" }}
              onClick={handleExternalTicketClick}
            >
              {event.externalTicketLabel || "Get Tickets"} →
            </a>
          ) : isPast ? (
            <div className="lp-past-banner">This event has already taken place</div>
          ) : !ticketsOnSale && !presaleUnlocked ? (
            <>
              <div className="lp-countdown">
                <span className="lp-countdown-label">Tickets on sale in</span>
                <span className="lp-countdown-timer">{onSaleCountdown}</span>
              </div>

              {presaleAvailable && (
                <div style={{ marginTop: 18, textAlign: "center" }}>
                  <button
                    type="button"
                    className="lp-presale-link"
                    onClick={() => { setPresalePanelVisible((v) => !v); setPresaleError(null); }}
                  >
                    Have a presale code?
                  </button>

                  {presalePanelVisible && (
                    <div style={{
                      marginTop: 14,
                      padding: "18px 20px",
                      borderRadius: 12,
                      background: "rgba(20, 20, 24, 0.97)",
                      border: "1px solid rgba(255, 255, 255, 0.1)",
                      boxShadow: "0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
                      animation: "lp-presale-panel-in 0.42s cubic-bezier(0.34,1.4,0.64,1) both",
                      textAlign: "left",
                    }}>
                      <label style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 600, display: "block", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Presale Code
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          className="lp-presale-input"
                          value={presaleCodeInput}
                          onChange={(e) => { setPresaleCodeInput(e.target.value.toUpperCase()); setPresaleError(null); }}
                          onKeyDown={(e) => { if (e.key === "Enter") handlePresaleUnlock(); }}
                          placeholder="Enter code"
                          maxLength={15}
                          style={{
                            flex: 1,
                            background: "rgba(255,255,255,0.04)",
                            border: `1px solid ${presaleError ? "rgba(239,68,68,0.65)" : "rgba(255,255,255,0.12)"}`,
                            borderRadius: 8,
                            padding: "11px 14px",
                            color: "#fff",
                            fontSize: 16,
                            fontFamily: "monospace",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                            animation: presaleShake ? "lp-presale-shake 0.52s ease-out" : "none",
                          }}
                        />
                        <button
                          type="button"
                          onClick={handlePresaleUnlock}
                          disabled={presaleLoading || !presaleCodeInput.trim()}
                          style={{
                            padding: "11px 20px",
                            borderRadius: 8,
                            border: "1px solid rgba(208,194,144,0.35)",
                            background: "rgba(208,194,144,0.09)",
                            color: "#d0c290",
                            fontSize: 13,
                            fontWeight: 700,
                            letterSpacing: "0.03em",
                            cursor: presaleLoading || !presaleCodeInput.trim() ? "not-allowed" : "pointer",
                            opacity: presaleLoading || !presaleCodeInput.trim() ? 0.45 : 1,
                            transition: "opacity 0.2s ease, background 0.2s ease",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {presaleLoading ? "Checking..." : "Unlock"}
                        </button>
                      </div>
                      {presaleError && (
                        <p style={{ margin: "9px 0 0", fontSize: 12, color: "rgba(239,68,68,0.85)" }}>
                          {presaleError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Presale unlocked badge */}
              {presaleUnlocked && presaleType && (
                <div style={{
                  display: "inline-block",
                  marginBottom: 16,
                  padding: "6px 20px",
                  borderRadius: 20,
                  background: "linear-gradient(90deg, rgba(208,194,144,0.07) 0%, rgba(208,194,144,0.18) 40%, rgba(255,248,220,0.16) 50%, rgba(208,194,144,0.18) 60%, rgba(208,194,144,0.07) 100%)",
                  backgroundSize: "220% auto",
                  border: "1px solid rgba(208,194,144,0.3)",
                  color: "#d0c290",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  animation: "lp-presale-badge-in 0.48s cubic-bezier(0.34,1.4,0.64,1) both, lp-presale-badge-shimmer 1.6s 0.45s ease-out both",
                }}>
                  {presaleType === "artist" ? "Artist Presale" : "Venue Presale"}
                </div>
              )}

              {/* Tier selector (only if multiple tiers) */}
              {ticketTypes.length > 1 && (
                <div className="lp-tier-selector">
                  {ticketTypes.map((t) => {
                    const tierSoldOut = t.quantitySold >= t.capacity;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`lp-tier-btn ${t.id === selectedTierId ? "lp-tier-btn-active" : ""} ${tierSoldOut ? "lp-tier-btn-sold-out" : ""}`}
                        disabled={tierSoldOut}
                        onClick={() => {
                          if (tierSoldOut) return;
                          setSelectedTierId(t.id);
                          if (checkoutOpen) setCheckoutOpen(false);
                        }}
                      >
                        <span className="lp-tier-name">{t.name}</span>
                        {tierSoldOut
                          ? <span className="lp-tier-sold-out-label">Sold Out</span>
                          : <span className="lp-tier-price">${t.allInPrice.toFixed(2)}</span>
                        }
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Dynamic total price above CTA */}
              {!isFree && !checkoutOpen && (
                <div className="lp-checkout-price-display">
                  <span className="lp-checkout-price-amount">
                    ${ctaTotal.toFixed(2)}
                  </span>
                  <span className="lp-checkout-price-label">
                    {quantity > 1 ? "total" : "per ticket"} &middot; Price
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
                    disabled={quantity <= 1 || selectedTierSoldOut}
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
                    disabled={selectedTierSoldOut}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="lp-cta-btn"
                  onClick={handleGetTickets}
                  disabled={checkoutOpen || selectedTierSoldOut}
                >
                  {selectedTierSoldOut ? "Sold Out" : isFree ? "Get Free Tickets" : "Get Tickets"}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── INLINE CHECKOUT SECTION ─────────────────────────────────────── */}
      {checkoutOpen && !isPast && ticketsOnSale && !event.externalTicketUrl && (
        <section
          className="lp-checkout-section"
          ref={checkoutRef}
        >
          <div className="lp-checkout-section-inner">
            <h2 className="lp-checkout-heading">Checkout</h2>

            {/* Itemized order summary — matches server-side pricing in
                app/e/[slug]/page.tsx so buyers can see exactly what they
                owe, including any facility fee. */}
            {!isFree && selectedTier && (() => {
              const isDivisor = resolvedFees.taxMethod === "divisor";
              const effectiveTaxRate = isDivisor ? 0 : resolvedFees.taxRate;
              const basePrice = selectedTier.basePrice || 0;
              const subtotal = basePrice * quantity;
              const totalTicketingFee = resolvedFees.ticketingFee * quantity;
              const totalFacilityFee = resolvedFees.facilityFee * quantity;
              const taxPerTicket = Math.round(basePrice * effectiveTaxRate * 100) / 100;
              const totalTax = taxPerTicket * quantity;
              const preStripe = resolvedFees.feesIncludedInPrice
                ? subtotal + totalTax
                : subtotal + totalTicketingFee + totalFacilityFee + totalTax;
              // When fees are baked into the price, the venue absorbs the card
              // processing fee too — don't add it to the customer's total.
              const processingFee = resolvedFees.feesIncludedInPrice
                ? 0
                : onlineSurchargeDollars(preStripe);
              const total = preStripe + processingFee;
              const row = (label: string, value: number, accent = false): React.ReactNode => (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: accent ? 16 : 13,
                    fontWeight: accent ? 700 : 500,
                    color: accent ? "#ffffff" : "rgba(255,255,255,0.72)",
                    padding: "4px 0",
                  }}
                >
                  <span>{label}</span>
                  <span>${value.toFixed(2)}</span>
                </div>
              );
              return (
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 12,
                    padding: "14px 16px",
                    marginBottom: 20,
                  }}
                >
                  {row(`${selectedTier.name ?? "Ticket"}${quantity > 1 ? ` \u00d7 ${quantity}` : ""}`, subtotal)}
                  {totalTicketingFee > 0 && (
                    resolvedFees.feesIncludedInPrice ? (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 500, padding: "4px 0" }}>
                        <span style={{ color: "rgba(255,255,255,0.72)" }}>Ticketing service fee</span>
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Included in ticket price</span>
                      </div>
                    ) : row("Ticketing service fee", totalTicketingFee)
                  )}
                  {totalFacilityFee > 0 && (
                    resolvedFees.feesIncludedInPrice ? (
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 500, padding: "4px 0" }}>
                        <span style={{ color: "rgba(255,255,255,0.72)" }}>Facility fee</span>
                        <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Included in ticket price</span>
                      </div>
                    ) : row("Facility fee", totalFacilityFee)
                  )}
                  {isDivisor && resolvedFees.taxRate > 0 ? (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 500, padding: "4px 0" }}>
                      <span style={{ color: "rgba(255,255,255,0.72)" }}>Sales tax</span>
                      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>Included in ticket price</span>
                    </div>
                  ) : totalTax > 0 ? row("Sales tax", totalTax) : null}
                  {processingFee > 0 && row("Processing fee", processingFee)}
                  <div style={{ height: 1, background: "rgba(255,255,255,0.1)", margin: "8px 0" }} />
                  {row("Total", total, true)}
                </div>
              );
            })()}
            {isFree && (
              <p className="lp-checkout-summary">
                {quantity} &times; {selectedTier?.name ?? "Ticket"} &middot; <strong>Free</strong>
              </p>
            )}

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
                fees={resolvedFees}
                otherEvents={otherEvents}
                presaleCode={presaleUnlocked ? presaleCode : undefined}
              />
            </Elements>
          </div>
        </section>
      )}

      {/* ── MID SECTION — Why you can’t miss this ─────────────────────── */}
      {!isPast && (
        <section className="lp-mid">
          <h2 className="lp-mid-heading lp-reveal">Why You Can&apos;t Miss This</h2>
          <div className="lp-bullets">
            {/* Bullet 1 — live experience / intimacy */}
            <div className="lp-bullet lp-reveal" style={{ transitionDelay: "0s" }}>
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                {slug === "payton-howie" ? (
                  <>
                    <div className="lp-bullet-title">No Jumbotron</div>
                    <div className="lp-bullet-desc">Someone who&apos;s shared stages with Lainey Wilson, Parker McCollum, and Ashley McBryde is playing a room where you can actually see her face.</div>
                  </>
                ) : (
                  <>
                    <div className="lp-bullet-title">Up Close &amp; Personal</div>
                    <div className="lp-bullet-desc">
                      {event.venue
                        ? `${event.venue} is a room where you actually feel it — no screens between you and the stage.`
                        : "A live event where you can actually feel the music — no jumbotrons, no distance."}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Bullet 2 — price or urgency */}
            <div className="lp-bullet lp-reveal" style={{ transitionDelay: "0.12s" }}>
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                {slug === "payton-howie" ? (
                  <>
                    <div className="lp-bullet-title">Not a Gamble</div>
                    <div className="lp-bullet-desc">Four million career streams and a tour history that reads like a country radio playlist — you&apos;re not taking a chance on an unknown, you&apos;re catching someone on the way up.</div>
                  </>
                ) : !event.isFree && displayPrice > 0 ? (
                  <>
                    <div className="lp-bullet-title">${displayPrice.toFixed(0)}. All In.</div>
                    <div className="lp-bullet-desc">
                      Straightforward pricing — no surprise fees when you get to checkout.
                    </div>
                  </>
                ) : event.isFree ? (
                  <>
                    <div className="lp-bullet-title">Free to Attend</div>
                    <div className="lp-bullet-desc">
                      No ticket price, no catch — just grab your spot and show up.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lp-bullet-title">Limited Availability</div>
                    <div className="lp-bullet-desc">Capacity is limited — don&apos;t wait until it&apos;s sold out.</div>
                  </>
                )}
              </div>
            </div>

            {/* Bullet 3 — social proof */}
            <div className="lp-bullet lp-reveal" style={{ transitionDelay: "0.24s" }}>
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                {slug === "payton-howie" ? (
                  <>
                    <div className="lp-bullet-title">$29. All In.</div>
                    <div className="lp-bullet-desc">Saturday night, live country music in Florence, no service fee math — the whole ticket is twenty-nine dollars.</div>
                  </>
                ) : (
                  <>
                    <div className="lp-bullet-title">
                      {attendeeCount >= 10 ? "People Are Coming" : "Secure Your Spot"}
                    </div>
                    <div className="lp-bullet-desc">{socialProofText}</div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Artist / description */}
          {(event.description || slug === "payton-howie") && (
            <div className="lp-about lp-reveal" style={{ transitionDelay: "0.12s" }}>
              <h3 className="lp-about-heading">About the Event</h3>
              {slug === "payton-howie" && (
                <p className="lp-about-text" style={{ fontStyle: "italic", marginBottom: "0.75em" }}>
                  There&apos;s a version of this where you watch Payton Howie headline an amphitheater in a few years and kick yourself for skipping the $29 show at a brewery in Florence.
                </p>
              )}
              {event.description && (
                <p className="lp-about-text">{event.description}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── FEATURED ARTISTS ───────────────────────────────────────────── */}
      {featuredArtists.length > 0 && (
        <section className="lp-artists-section">
          <h2 className="lp-artists-heading lp-reveal">Featured Artists</h2>
          <div className="lp-artists-grid">
            {featuredArtists.map((artist, artistIdx) => {
              const Wrapper = artist.website_url ? "a" : "div";
              const wrapperProps = artist.website_url
                ? { href: artist.website_url, target: "_blank", rel: "noopener noreferrer", style: { textDecoration: "none" } as React.CSSProperties }
                : {};
              return (
                <Wrapper key={artist.id} className="lp-artist-card lp-reveal" style={{ transitionDelay: `${artistIdx * 0.08}s` }} {...wrapperProps}>
                  <div className="lp-artist-avatar">
                    {artist.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={artist.avatar_url} alt={artist.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                    ) : (
                      <div className="lp-artist-avatar-placeholder">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <span className="lp-artist-name">{artist.name}</span>
                </Wrapper>
              );
            })}
          </div>
        </section>
      )}

      {/* ── VENUE MAP / DIRECTIONS ────────────────────────────────────── */}
      {venueInfo && (venueInfo.lat || venueInfo.address) && (
        <section className="lp-venue-section lp-reveal">
          <h2 className="lp-venue-heading">Getting Here</h2>
          <div className="lp-venue-layout">
            {/* Map */}
            {(venueInfo.lat && venueInfo.lng) || venueInfo.address ? (
              <div className="lp-venue-map-wrap">
                <iframe
                  title="Venue location"
                  src={
                    venueInfo.lat && venueInfo.lng
                      ? `https://maps.google.com/maps?q=${venueInfo.lat},${venueInfo.lng}&z=15&output=embed`
                      : `https://maps.google.com/maps?q=${encodeURIComponent(venueInfo.address || "")}&z=15&output=embed`
                  }
                  className="lp-venue-map-iframe"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>
            ) : null}

            {/* Venue Details */}
            <div className="lp-venue-details">
              <div className="lp-venue-detail-card">
                <h3 className="lp-venue-detail-title">{event.venue}</h3>
                {venueInfo.address && (
                  <p className="lp-venue-detail-text">{venueInfo.address}</p>
                )}
                {venueInfo.phone && (
                  <a href={`tel:${venueInfo.phone}`} className="lp-venue-detail-link">{venueInfo.phone}</a>
                )}
                {venueInfo.email && (
                  <a href={`mailto:${venueInfo.email}`} className="lp-venue-detail-link">{venueInfo.email}</a>
                )}
              </div>

              {(venueInfo.directions_car || venueInfo.parking_info || venueInfo.directions_transit) && (
                <div className="lp-venue-detail-card">
                  {venueInfo.directions_car && (
                    <div className="lp-venue-info-block">
                      <strong className="lp-venue-info-label">By Car</strong>
                      <p className="lp-venue-detail-text">{venueInfo.directions_car}</p>
                    </div>
                  )}
                  {venueInfo.parking_info && (
                    <div className="lp-venue-info-block">
                      <strong className="lp-venue-info-label">Parking</strong>
                      <p className="lp-venue-detail-text">{venueInfo.parking_info}</p>
                    </div>
                  )}
                  {venueInfo.directions_transit && (
                    <div className="lp-venue-info-block">
                      <strong className="lp-venue-info-label">Public Transport</strong>
                      <p className="lp-venue-detail-text">{venueInfo.directions_transit}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── SOCIAL PROOF BANNER ───────────────────────────────────────── */}
      {!isPast && attendeeCount >= 5 && (
        <section className="lp-social-proof lp-reveal">
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
      {!isPast && ticketsOnSale && !checkoutOpen && !selectedTierSoldOut && (
        <section className="lp-bottom-cta lp-reveal">
          <p className="lp-bottom-cta-text">Ready to secure your spot?</p>
          <button type="button" className="lp-cta-btn lp-cta-btn-lg" onClick={handleGetTickets}>
            Get Tickets
          </button>
        </section>
      )}

      {/* ── STICKY MOBILE CTA ────────────────────────────────────────── */}
      {!isPast && (ticketsOnSale || event.externalTicketUrl) && !checkoutOpen && (
        <div className={`lp-sticky-bar ${isCtaVisible ? "lp-sticky-bar-visible" : ""}`}>
          <div className="lp-sticky-price">
            {event.externalTicketUrl
              ? (event.externalTicketLabel || "Get Tickets")
              : selectedTierSoldOut
                ? "Sold Out"
                : isFree
                  ? "Free"
                  : `$${ctaTotal.toFixed(2)}`}
            {!event.externalTicketUrl && !isFree && !selectedTierSoldOut && (
              <span className="lp-sticky-price-label">
                {quantity > 1 ? "total" : "per ticket"} · Price
              </span>
            )}
          </div>
          {event.externalTicketUrl ? (
            <a
              href={event.externalTicketUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="lp-sticky-cta"
              style={{ textDecoration: "none", textAlign: "center" }}
              onClick={handleExternalTicketClick}
            >
              Get Tickets →
            </a>
          ) : (
            <button type="button" className="lp-sticky-cta" onClick={handleGetTickets} disabled={selectedTierSoldOut}>
              {selectedTierSoldOut ? "Sold Out" : "Get Tickets"}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
