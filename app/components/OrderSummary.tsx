"use client";

import { TicketType } from "@/lib/types/ticket";

// Stripe charges 2.9% + $0.30 per transaction
const STRIPE_PERCENT_FEE = 0.029;
const STRIPE_FLAT_FEE = 0.3;

type OrderSummaryProps = {
  selectedTicket: TicketType | null;
  quantity: number;
  ticketingFee: number; // flat dollar amount per ticket
  taxRate: number; // decimal e.g. 0.09 for 9%
  onCheckout: () => void;
};

export default function OrderSummary({
  selectedTicket,
  quantity,
  ticketingFee,
  taxRate,
  onCheckout,
}: OrderSummaryProps) {
  const hasSelection = selectedTicket !== null && quantity > 0;
  const subtotal = hasSelection ? selectedTicket.price * quantity : 0;
  const totalTicketingFee = hasSelection ? ticketingFee * quantity : 0;
  const tax = hasSelection
    ? Math.round(subtotal * taxRate * 100) / 100
    : 0;
  const subtotalBeforeStripe = subtotal + totalTicketingFee + tax;
  const processingFee = hasSelection
    ? Math.round((subtotalBeforeStripe * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE) * 100) / 100
    : 0;
  const total = subtotalBeforeStripe + processingFee;

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
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="order-summary-empty-text">
            Select a ticket to continue
          </p>
        </div>
      ) : (
        <div className="order-summary-details">
          <div className="order-summary-line">
            <span className="order-summary-line-label">
              {selectedTicket.name}
              {quantity > 1 ? ` × ${quantity}` : ""}
            </span>
            <span className="order-summary-line-value">
              $ {subtotal.toFixed(2)}
            </span>
          </div>

          <div className="order-summary-divider" />

          <div className="order-summary-line order-summary-line-sub">
            <span className="order-summary-line-label">Subtotal</span>
            <span className="order-summary-line-value">
              $ {subtotal.toFixed(2)}
            </span>
          </div>
          {totalTicketingFee > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label">Ticketing fee</span>
              <span className="order-summary-line-value">
                $ {totalTicketingFee.toFixed(2)}
              </span>
            </div>
          )}
          {tax > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label">
                Sales tax ({(taxRate * 100).toFixed(1)}%)
              </span>
              <span className="order-summary-line-value">
                $ {tax.toFixed(2)}
              </span>
            </div>
          )}
          {processingFee > 0 && (
            <div className="order-summary-line order-summary-line-sub">
              <span className="order-summary-line-label">Processing fee</span>
              <span className="order-summary-line-value">
                $ {processingFee.toFixed(2)}
              </span>
            </div>
          )}

          <div className="order-summary-divider" />

          <div className="order-summary-line order-summary-total">
            <span className="order-summary-line-label">Total</span>
            <span className="order-summary-line-value">
              $ {total.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        className="order-summary-checkout-btn"
        disabled={!hasSelection}
        onClick={onCheckout}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="2"
            y="4"
            width="20"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M2 10h20" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        Buy Ticket
      </button>

      <p className="order-summary-trust">
        Secure Checkout &bull; Instant confirmation
      </p>
    </div>
  );
}
