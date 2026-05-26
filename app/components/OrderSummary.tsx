"use client";

import { useState } from "react";
import { TicketType } from "@/lib/types/ticket";

// Stripe charges 2.7% + $0.30 per transaction
const STRIPE_PERCENT_FEE = 0.027;
const STRIPE_FLAT_FEE = 0.3;

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
  onCheckout: () => void;
  /** Called when a promo code is applied or removed. Passes the code string or null. */
  onPromoApplied?: (promoCode: string | null) => void;
  /** Called when total is $0 and user claims free tickets */
  onFreeCheckout?: (name: string, email: string) => void;
};

export default function OrderSummary({
  selectedTicket,
  quantity,
  ticketingFee,
  facilityFee,
  taxRate,
  taxMethod = "multiplier",
  onCheckout,
  onPromoApplied,
  onFreeCheckout,
}: OrderSummaryProps) {
  // Divisor = tax baked into face price; don't charge it again at checkout.
  const rate = taxMethod === "divisor" ? 0 : normalizeTaxRate(taxRate);
  const hasSelection = selectedTicket !== null && quantity > 0;

  // ── Free checkout state ──
  const [freeName, setFreeName] = useState("");
  const [freeEmail, setFreeEmail] = useState("");
  const [freeLoading, setFreeLoading] = useState(false);

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
  const subtotalBeforeStripe = discountedSubtotal + totalTicketingFee + totalFacilityFee + tax;
  const processingFee = isFreeOrder ? 0 : (hasSelection
    ? Math.round((subtotalBeforeStripe * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE) * 100) / 100
    : 0);
  const total = isFreeOrder ? 0 : subtotalBeforeStripe + processingFee;

  return (
    <div className="order-summary">
      <h2 className="order-summary-title">Order Summary</h2>

      {!hasSelection ? (
        <div className="order-summary-empty">
          <svg
            className="order-summary-cart-icon"
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="order-summary-empty-text">Select a ticket to continue</p>
        </div>
      ) : (
        <div className="order-summary-details">
          <div className="order-summary-line">
            <span className="order-summary-line-label">
              {selectedTicket.name}
              {quantity > 1 ? ` × ${quantity}` : ""}
            </span>
            <span className="order-summary-line-value">${subtotal.toFixed(2)}</span>
          </div>

          <div className="order-summary-divider" />

          <div className="order-summary-line order-summary-line-sub">
            <span className="order-summary-line-label">Subtotal</span>
            <span className="order-summary-line-value">${subtotal.toFixed(2)}</span>
          </div>

          {/* ── Promo Code Section ── */}
          {!appliedPromo ? (
            <div style={{ margin: "8px 0" }}>
              {!showPromoInput ? (
                <button
                  type="button"
                  onClick={() => setShowPromoInput(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#d0c290",
                    cursor: "pointer",
                    fontSize: 13,
                    padding: 0,
                    textDecoration: "underline",
                    fontFamily: "inherit",
                  }}
                >
                  Use Promo Code
                </button>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        validatePromo();
                      }
                    }}
                    placeholder="Enter code"
                    className="admin-form-input"
                    style={{
                      flex: 1,
                      padding: "6px 10px",
                      fontSize: 13,
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: 6,
                      color: "#fff",
                    }}
                  />
                  <button
                    type="button"
                    onClick={validatePromo}
                    disabled={promoLoading || !promoCode.trim()}
                    style={{
                      padding: "6px 14px",
                      fontSize: 13,
                      background: "#d0c290",
                      color: "#1a1a2e",
                      border: "none",
                      borderRadius: 6,
                      cursor: promoLoading || !promoCode.trim() ? "not-allowed" : "pointer",
                      fontWeight: 600,
                      opacity: promoLoading || !promoCode.trim() ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {promoLoading ? "…" : "Apply"}
                  </button>
                </div>
              )}
              {promoError && (
                <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0" }}>{promoError}</p>
              )}
            </div>
          ) : (
            <div style={{ margin: "8px 0", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#22c55e", fontSize: 13 }}>
                ✓ {appliedPromo.code} applied — ${totalDiscount.toFixed(2)} off
              </span>
              <button
                type="button"
                onClick={removePromo}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ef4444",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: 0,
                  textDecoration: "underline",
                  fontFamily: "inherit",
                }}
              >
                Remove
              </button>
            </div>
          )}

          {totalDiscount > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label" style={{ color: "#22c55e" }}>
                Discount
              </span>
              <span className="order-summary-line-value" style={{ color: "#22c55e" }}>
                -${totalDiscount.toFixed(2)}
              </span>
            </div>
          )}

          {totalTicketingFee > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label">Ticketing Service Fee</span>
              <span className="order-summary-line-value">${totalTicketingFee.toFixed(2)}</span>
            </div>
          )}
          {totalFacilityFee > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label">Facility fee</span>
              <span className="order-summary-line-value">${totalFacilityFee.toFixed(2)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label">
                Sales tax
              </span>
              <span className="order-summary-line-value">${tax.toFixed(2)}</span>
            </div>
          )}
          {processingFee > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label">
                Processing fee
              </span>
              <span className="order-summary-line-value">${processingFee.toFixed(2)}</span>
            </div>
          )}

          <div className="order-summary-divider" />

          <div className="order-summary-line order-summary-total">
            <span className="order-summary-line-label">Total</span>
            <span className="order-summary-line-value">
              {isFreeOrder ? (
                <span style={{ color: "#22c55e", fontWeight: 800 }}>FREE</span>
              ) : (
                `$${total.toFixed(2)}`
              )}
            </span>
          </div>
        </div>
      )}

      {isFreeOrder && hasSelection ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          <input
            type="text"
            placeholder="Your name"
            value={freeName}
            onChange={(e) => setFreeName(e.target.value)}
            className="admin-form-input"
            style={{
              padding: "10px 14px",
              fontSize: 14,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "#fff",
            }}
          />
          <input
            type="email"
            placeholder="Your email"
            value={freeEmail}
            onChange={(e) => setFreeEmail(e.target.value)}
            className="admin-form-input"
            style={{
              padding: "10px 14px",
              fontSize: 14,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 8,
              color: "#fff",
            }}
          />
          <button
            type="button"
            className="order-summary-checkout-btn"
            disabled={!freeName.trim() || !freeEmail.trim() || freeLoading}
            onClick={async () => {
              setFreeLoading(true);
              try {
                await onFreeCheckout?.(freeName.trim(), freeEmail.trim());
              } finally {
                setFreeLoading(false);
              }
            }}
            style={{ opacity: (!freeName.trim() || !freeEmail.trim() || freeLoading) ? 0.5 : 1 }}
          >
            {freeLoading ? "Claiming..." : "Claim Free Tickets"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="order-summary-checkout-btn"
          disabled={!hasSelection}
          onClick={onCheckout}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          Secure Your Spot
        </button>
      )}

      <p className="order-summary-terms">
        By completing your purchase you agree to our{" "}
        <a href="/faq" className="order-summary-terms-link">Terms of Sale</a>.
        All sales are final. Refunds only if event is cancelled.
      </p>

      <p className="order-summary-trust">Secure Checkout &bull; Instant confirmation</p>
    </div>
  );
}
