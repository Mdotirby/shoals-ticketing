/**
 * OrderConfirmationPanel — ONE glass card: "Order Confirmed" label + order
 * number, the ticket line, the price breakdown/total, the QR-code notice,
 * and the ready/preparing status (checkout_success.png, .order-panel, plus
 * the two kept sections that live inside this card per the rewrite brief).
 * Deliberately one container — TicketCard's own box (.cs-order-ticket) sits
 * INSIDE this one, not glued on beside it.
 */
import { TicketCard } from "@/app/components/liquid-glass-components";
import TicketPreparingLoader from "@/app/components/TicketPreparingLoader";

export type TicketLine = {
  eventName: string;
  dateVenue: string;
  tierLabel: string;
  subLabel?: string;
  photoUrl?: string;
};

export type PriceLine = { label: string; amount: string };

export function OrderConfirmationPanel({
  orderNumber,
  ticket,
  priceLines,
  total,
  quantity,
  ticketReady,
  loading,
}: {
  orderNumber: string;
  ticket: TicketLine;
  priceLines: PriceLine[];
  total: string;
  quantity: number;
  ticketReady: boolean;
  loading: boolean;
}) {
  return (
    <div className="cs-order-card">
      <div className="cs-order-head">
        <span className="cs-order-label">Order Confirmed</span>
        <span className="cs-order-number">Order #{orderNumber}</span>
      </div>

      <TicketCard {...ticket} />

      <div className="cs-order-breakdown">
        {priceLines.map((line) => (
          <div key={line.label} className="cs-order-line">
            <span>{line.label}</span>
            <span>{line.amount}</span>
          </div>
        ))}
        <div className="cs-order-line cs-order-line--total">
          <span>Total Paid</span>
          <span>{total}</span>
        </div>
      </div>

      <div className="cs-order-qr-notice">
        <p className="cs-order-qr-title">Your QR Code Is Your Ticket</p>
        <p className="cs-order-qr-text">
          Present your QR code at the door for entry. Screenshot it, save it to your photos, or print a
          copy — just have it ready when you arrive.
        </p>
      </div>

      {ticketReady ? (
        <p className="cs-order-ready">Your {quantity > 1 ? "tickets are" : "ticket is"} ready.</p>
      ) : (
        <div className="cs-preparing">
          <TicketPreparingLoader
            label={loading ? "Preparing your tickets…" : "Still finishing up…"}
            sublabel={
              loading
                ? "This usually takes a few seconds."
                : "Your tickets are on their way — we've emailed them too."
            }
          />
        </div>
      )}
    </div>
  );
}
