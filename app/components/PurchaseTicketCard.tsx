"use client";

import { TicketType } from "@/lib/types/ticket";

type PurchaseTicketCardProps = {
  ticketType: TicketType;
  isSelected: boolean;
  onSelect: (id: string) => void;
  venueName?: string;
  imageUrl?: string;
};

export default function PurchaseTicketCard({
  ticketType,
  isSelected,
  onSelect,
  venueName,
  imageUrl,
}: PurchaseTicketCardProps) {
  const isSoldOut = ticketType.quantity_sold >= ticketType.quantity_available;

  return (
    <button
      type="button"
      className={`purchase-ticket-card ${isSelected ? "selected" : ""} ${isSoldOut ? "sold-out" : ""}`}
      onClick={() => !isSoldOut && onSelect(ticketType.id)}
      disabled={isSoldOut}
      aria-pressed={isSelected}
    >
      {/* Top row: selection bubble + name + price */}
      <div className="ptc-header">
        <span className="ptc-bubble" aria-hidden="true" />
        <h3 className="ptc-name">{ticketType.name}</h3>
        <span className="ptc-price">
          $ {ticketType.price.toLocaleString()}
        </span>
      </div>

      {/* Event image */}
      {imageUrl && (
        <div className="ptc-image-wrapper">
          <img src={imageUrl} alt="" className="ptc-image" />
        </div>
      )}

      {/* Venue / location row */}
      <div className="ptc-venue-row">
        <svg
          className="ptc-venue-icon"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="1"
            y="3"
            width="14"
            height="11"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path d="M4 1v4M8 1v4M12 1v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
        <span className="ptc-venue-text">{venueName || "Venue"}</span>
      </div>

      {/* Perks / badges */}
      <div className="ptc-perks-section">
        <span className="ptc-perks-label">Included with every ticket</span>
        <div className="ptc-perks-badges">
          {(ticketType.perks && ticketType.perks.length > 0
            ? ticketType.perks
            : ["General Admission", "Full Event Access", "Venue Amenities"]
          ).map((perk, i) => (
            <span key={i} className="ptc-perk-badge">
              <span className="ptc-perk-emoji">
                {i === 0 ? "🎯" : i === 1 ? "☕" : "👥"}
              </span>
              {perk}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom gradient bar */}
      <div className="ptc-bottom-bar" />

      {isSoldOut && <div className="ptc-sold-out-overlay">SOLD OUT</div>}
    </button>
  );
}
