"use client";

import { useState } from "react";
import { TicketType } from "@/lib/types/ticket";
import { onlineSurchargeDollars } from "@/lib/fees/rates";


/** Normalize tax rate: accepts 9.5 (percent) or 0.095 (decimal). Returns decimal. */
function normalizeTaxRate(rate: number): number {
  return rate > 1 ? rate / 100 : rate;
}

type OrderSummaryProps = {
  selectedTicket: TicketType | null;
  quantity: number;
  ticketingFee: number;   // flat dollar per ticket (venue_ticket_fee)
  facilityFee: number;    // flat dollar per ticket (venue facility_fee)
  taxRate: number;        // venue_tax_rate — accepts 9.5 or 0.095
  taxMethod?: "multiplier" | "divisor"; // divisor = tax baked into face price, don't add at checkout
  /** Ticketing fee + facility fee are already baked into the ticket price — don't add them again. */
  feesIncludedInPrice?: boolean;
  onCheckout: () => void;
  /** Called when a promo code is applied or removed. Passes the code string or null. */
  onPromoApplied?: (promoCode: string | null) => void;
  /** Called when total is $0 and user claims free tickets */
  onFreeCheckout?: (name: string, email: string) => void;
  /** External override to disable the checkout button (e.g. reserved seating with no seats selected, sold-out tier) */
  checkoutDisabled?: boolean;
  /** Message to show instead of the empty-cart state when checkoutDisabled is true */
  checkoutDisabledMessage?: string;

  /** ── Tier + quantity picker, rendered inside this card ──
   * event_detail.png shows the tier name and quantity stepper as part of
   * the Order Summary card itself, not a separate element above it — a
   * CSS-only "fusion" of two adjacent boxes was tried first and still read
   * as two things, so the picker genuinely lives in this component now.
   * Omit `ticketTypes` (or pass an empty array) to hide the row entirely —
   * used by callers that render their own standalone picker instead (the
   * mockup only covers the states below need it in-card).
   */
  ticketTypes?: TicketType[];
  selectedTicketId?: string | null;
  onSelectTicket?: (id: string) => void;
  computeAllInPrice?: (price: number) => number;
  isTierSoldOut?: (ticket: TicketType) => boolean;
  onQuantityChange?: (updater: (quantity: number) => number) => void;
  /** Drives the qty stepper's disabled state — distinct from checkoutDisabled,
   * which can also be true for reasons (unpicked seats) that shouldn't block
   * changing the quantity itself. */
  selectedTicketSoldOut?: boolean;
};

export default function OrderSummary({
  selectedTicket,
  quantity,
  ticketingFee,
  facilityFee,
  taxRate,
  taxMethod = "multiplier",
  feesIncludedInPrice = false,
  onCheckout,
  onPromoApplied,
  onFreeCheckout,
  checkoutDisabled = false,
  checkoutDisabledMessage,
  ticketTypes,
  selectedTicketId,
  onSelectTicket,
  computeAllInPrice,
  isTierSoldOut,
  onQuantityChange,
  selectedTicketSoldOut = false,
}: OrderSummaryProps) {
  // Divisor = tax baked into face price; don't charge it again at checkout.
  const rate = taxMethod === "divisor" ? 0 : normalizeTaxRate(taxRate);
  // Sold-out is decided by the parent (EventDetailClient) and arrives via
  // checkoutDisabled/checkoutDisabledMessage. This component used to recompute
  // it from quantity_sold >= quantity_available, which double-counted
  // mixed-section orders and falsely blocked sections that still had seats —
  // one source of truth avoids the two drifting apart again.
  const hasSelection = selectedTicket !== null && quantity > 0;

  // ── Free checkout state ──
  const [freeName, setFreeName] = useState("");
  const [freeEmail, setFreeEmail] = useState("");
  const [freeLoading, setFreeLoading] = useState(false);

  // ── Price details disclosure — collapsed by default, matches the all-inclusive
  // price shown above it; expanding reveals the itemized fee/tax breakdown. ──
  const [showDetails, setShowDetails] = useState(false);

  // ── Promo code state ──
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discount_type: "fixed" | "percentage";
    discount_value: number;
  } | null>(null);

  const eventId = selectedTicket?.event_id ?? "";

  const validatePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoLoading(true);
    setPromoError("");
    try {
      const res = await fetch("/api/promo-codes/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim(), event_id: eventId }),
      });
      const data = await res.json();
      if (data.valid) {
        const promo = {
          code: promoCode.trim().toUpperCase(),
          discount_type: data.discount_type as "fixed" | "percentage",
          discount_value: parseFloat(data.discount_value),
        };
        setAppliedPromo(promo);
        setPromoError("");
        onPromoApplied?.(promo.code);
      } else {
        setPromoError(data.error || "Invalid promo code");
        setAppliedPromo(null);
        onPromoApplied?.(null);
      }
    } catch {
      setPromoError("Failed to validate code");
    } finally {
      setPromoLoading(false);
    }
  };

  const removePromo = () => {
    setAppliedPromo(null);
    setPromoCode("");
    setPromoError("");
    onPromoApplied?.(null);
  };

  // ── Discount calculation ──
  const discountPerTicket = appliedPromo
    ? appliedPromo.discount_type === "fixed"
      ? appliedPromo.discount_value
      : (selectedTicket?.price || 0) * (appliedPromo.discount_value / 100)
    : 0;
  const totalDiscount = hasSelection ? discountPerTicket * quantity : 0;

  // ── Totals ──
  const subtotal = hasSelection ? selectedTicket.price * quantity : 0;
  const discountedSubtotal = Math.max(subtotal - totalDiscount, 0);
  const isFreeOrder = discountedSubtotal <= 0 && appliedPromo !== null;

  const totalTicketingFee = isFreeOrder ? 0 : (hasSelection ? ticketingFee * quantity : 0);
  const totalFacilityFee = isFreeOrder ? 0 : (hasSelection ? facilityFee * quantity : 0);
  const tax = isFreeOrder ? 0 : (hasSelection
    ? Math.round(discountedSubtotal * rate * 100) / 100
    : 0);
  const subtotalBeforeStripe = feesIncludedInPrice
    ? discountedSubtotal + tax
    : discountedSubtotal + totalTicketingFee + totalFacilityFee + tax;
  // When fees are baked into the price, the venue absorbs the card
  // processing fee too — the customer is charged exactly subtotalBeforeStripe.
  const processingFee = isFreeOrder || feesIncludedInPrice ? 0 : (hasSelection
    ? onlineSurchargeDollars(subtotalBeforeStripe)
    : 0);
  const total = isFreeOrder ? 0 : subtotalBeforeStripe + processingFee;

  /* ── Storefront glass rebuild ──
   * Markup restructured to the mockup's .sf-cart (VenueCore.dc.html lines
   * 1436-1485): "Select tickets" heading, one .sf-tier row per ticket type
   * with its own .sf-qty stepper, a .sf-summary block, a block primary CTA
   * and the hold note.
   *
   * NOTHING ABOUT THE MONEY CHANGED. Every prop, the promo fetch to
   * /api/promo-codes/validate, and every line of the fee/tax/discount/total
   * math above is byte-identical. This is markup and class names only.
   *
   * One mapping worth stating: the mockup draws a quantity stepper on EVERY
   * tier row, which reads as a multi-tier cart. Production sells ONE tier per
   * order — InlineCheckout takes a single tierId and quantity, and so does the
   * payment intent. So the layout matches (every row has a stepper) while the
   * semantics do not change: the active row's stepper edits quantity, and
   * pressing + on another row selects that tier at quantity 1. Rendering a
   * real multi-tier cart would have meant changing what gets charged.
   *
   * Two production features the mockup has no equivalent for are kept per
   * Matt's rule, placed above the summary: the promo code entry and the
   * free-order name/email capture. The "Show price details" disclosure is
   * gone — the mockup's .sf-summary shows the itemised lines unconditionally,
   * so there is nothing left to disclose.
   */
  const tiers = ticketTypes && ticketTypes.length > 0
    ? ticketTypes
    : (selectedTicket ? [selectedTicket] : []);

  const qtyStepper = (tt: TicketType, isActive: boolean, soldOut: boolean) => (
    <div className="sf-qty">
      <button
        type="button"
        aria-label={`Decrease ${tt.name} quantity`}
        disabled={!isActive || quantity <= 1 || selectedTicketSoldOut}
        onClick={() => onQuantityChange?.((q) => Math.max(1, q - 1))}
      >
        −
      </button>
      <output>{isActive ? quantity : 0}</output>
      <button
        type="button"
        aria-label={`Increase ${tt.name} quantity`}
        disabled={soldOut || (isActive && selectedTicketSoldOut)}
        onClick={() => {
          if (!isActive) {
            onSelectTicket?.(tt.id);
            return;
          }
          onQuantityChange?.((q) => Math.min(10, q + 1));
        }}
      >
        +
      </button>
    </div>
  );

  return (
    <div className="sf-cart">
      <h2>Select tickets</h2>

      {checkoutDisabled && checkoutDisabledMessage ? (
        <p className="sf-cart-notice">{checkoutDisabledMessage}</p>
      ) : (
        <>
          <div className="sf-tier-list">
            {tiers.map((tt) => {
              const isActive = tt.id === (selectedTicketId ?? selectedTicket?.id);
              const soldOut = isTierSoldOut?.(tt) ?? false;
              const allIn = tt.price === 0 ? 0 : (computeAllInPrice?.(tt.price) ?? tt.price);
              return (
                <div
                  key={tt.id}
                  className={`sf-tier${isActive ? " sf-tier--active" : ""}`}
                  onClick={() => { if (!soldOut) onSelectTicket?.(tt.id); }}
                >
                  <div className="sf-tier-top">
                    <div className="sf-tier-info">
                      <div className="sf-tier-name">{tt.name}</div>
                      <div className="sf-tier-note">
                        {soldOut ? "Sold out" : (tt.perks?.[0] ?? "Full event access")}
                      </div>
                    </div>
                    <div className="sf-tier-price">
                      {tt.price === 0 ? "FREE" : `$${allIn.toFixed(2)}`}
                    </div>
                  </div>
                  {/* The mockup has a remaining-inventory count here ("18
                      left"). Removed at Matt's request — it publishes how much
                      stock is left on every tier, and it read as scarcity
                      pressure rather than information. Sold-out state is still
                      conveyed by the tier note and the disabled stepper, so
                      nothing about availability is hidden. */}
                  <div className="sf-tier-bottom">
                    {qtyStepper(tt, isActive, soldOut)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Not in the mockup — kept. */}
          {!appliedPromo ? (
            <div className="sf-promo">
              {!showPromoInput ? (
                <button type="button" className="sf-promo-toggle" onClick={() => setShowPromoInput(true)}>
                  Use Promo Code
                </button>
              ) : (
                <div className="sf-promo-row">
                  <input
                    type="text"
                    className="sf-input"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); validatePromo(); }
                    }}
                    placeholder="Enter code"
                  />
                  <button
                    type="button"
                    className="sf-btn sf-btn--secondary sf-btn--sm"
                    onClick={validatePromo}
                    disabled={promoLoading || !promoCode.trim()}
                  >
                    {promoLoading ? "…" : "Apply"}
                  </button>
                </div>
              )}
              {promoError && <p className="sf-promo-error">{promoError}</p>}
            </div>
          ) : (
            <div className="sf-promo sf-promo--applied">
              <span>✓ {appliedPromo.code} applied — ${totalDiscount.toFixed(2)} off</span>
              <button type="button" className="sf-promo-remove" onClick={removePromo}>Remove</button>
            </div>
          )}

          {hasSelection && (
            <div className="sf-summary">
              {/* Collapsed by default. The itemised lines sit behind "Show
                  price details", the way the mockup's checkout draws it and the
                  way this component behaved before the glass rebuild — the
                  rebuild made them unconditional, which put five fee lines in
                  front of every buyer before they had asked for them. The
                  total is always visible; only the breakdown toggles. */}
              <button
                type="button"
                className="sf-details-toggle"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((v) => !v)}
              >
                {showDetails ? "Hide" : "Show"} price details
                <svg width="8" height="6" viewBox="0 0 8 6" aria-hidden="true"
                  style={{ transform: showDetails ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
                  <path d="M0 0L8 0L4 6Z" fill="currentColor" />
                </svg>
              </button>

              {showDetails && (
                <>
              <div className="sf-summary-row">
                <span>{selectedTicket.name}{quantity > 1 ? ` × ${quantity}` : ""}</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              {totalDiscount > 0 && (
                <div className="sf-summary-row sf-summary-row--credit">
                  <span>Discount</span>
                  <span>-${totalDiscount.toFixed(2)}</span>
                </div>
              )}

              {totalTicketingFee > 0 && (
                <div className="sf-summary-row">
                  <span>Ticketing Service Fee</span>
                  <span>{feesIncludedInPrice ? "Included" : `$${totalTicketingFee.toFixed(2)}`}</span>
                </div>
              )}

              {totalFacilityFee > 0 && (
                <div className="sf-summary-row">
                  <span>Facility fee</span>
                  <span>{feesIncludedInPrice ? "Included" : `$${totalFacilityFee.toFixed(2)}`}</span>
                </div>
              )}

              {taxMethod === "divisor" && normalizeTaxRate(taxRate) > 0 ? (
                <div className="sf-summary-row">
                  <span>Sales tax</span>
                  <span>Included</span>
                </div>
              ) : tax > 0 ? (
                <div className="sf-summary-row">
                  <span>Sales tax</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
              ) : null}

              {processingFee > 0 && (
                <div className="sf-summary-row">
                  <span>Processing fee</span>
                  <span>${processingFee.toFixed(2)}</span>
                </div>
              )}
                </>
              )}

              <div className="sf-summary-row sf-summary-row--total">
                <span>Total</span>
                <span>{isFreeOrder ? "FREE" : `$${total.toFixed(2)}`}</span>
              </div>
            </div>
          )}

          {isFreeOrder && hasSelection ? (
            <div className="sf-fields">
              <input
                type="text"
                className="sf-input"
                placeholder="Your name"
                value={freeName}
                onChange={(e) => setFreeName(e.target.value)}
              />
              <input
                type="email"
                className="sf-input"
                placeholder="Your email"
                value={freeEmail}
                onChange={(e) => setFreeEmail(e.target.value)}
              />
              <button
                type="button"
                className="sf-btn sf-btn--primary sf-btn--block"
                disabled={!freeName.trim() || !freeEmail.trim() || freeLoading}
                onClick={async () => {
                  setFreeLoading(true);
                  try {
                    await onFreeCheckout?.(freeName.trim(), freeEmail.trim());
                  } finally {
                    setFreeLoading(false);
                  }
                }}
              >
                {freeLoading ? "Claiming..." : "Claim Free Tickets"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="sf-btn sf-btn--primary sf-btn--block"
              disabled={!hasSelection || checkoutDisabled}
              onClick={onCheckout}
            >
              Continue to Checkout
            </button>
          )}

          <p className="sf-hold-note">Seats held for 10:00 while you check out</p>
        </>
      )}

      <p className="sf-cart-terms">
        By completing your purchase you agree to our{" "}
        <a href="/faq">Terms of Sale</a>.
        All sales are final. Refunds only if event is cancelled.
      </p>

      <p className="sf-cart-trust">Secure Checkout &bull; Instant confirmation</p>
    </div>
  );
}
