"use client";

/**
 * Per-tier fee treatment and unlock code.
 *
 * Deliberately collapsed by default. Almost every tier inherits the event's
 * fees, and making the common case pay for the rare one would put six extra
 * controls on every row. So the row keeps a single chip that STATES the tier's
 * treatment — a waived fee should never be something you discover at
 * settlement — and the panel opens only when there is an exception to make.
 *
 * The preview at the bottom is the point of the whole thing. "Included" and
 * "waived" are identical to the buyer and opposite to the show, and no wording
 * makes that as obvious as showing both numbers.
 */

import { useState } from "react";
import { TicketTierDraft } from "@/lib/types/ticket";
import { resolveTierFees, type FeeMode, type InheritedFees } from "@/lib/fees/tierFees";
import { ratesFor } from "@/lib/fees/rates";

const MODES: { value: "" | FeeMode; label: string }[] = [
  { value: "", label: "Inherit from the show" },
  { value: "added", label: "Added on top" },
  { value: "included", label: "Included in the price" },
  { value: "waived", label: "Waived" },
];

const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

export type TierFeeContext = InheritedFees & { taxRate: number };

export default function TierFeePanel({
  tier,
  ctx,
  disabled,
  onChange,
}: {
  tier: TicketTierDraft;
  ctx: TierFeeContext;
  disabled?: boolean;
  onChange: (field: "service_fee_mode" | "facility_fee_mode" | "unlock_code", value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const face = parseFloat(tier.price || "0") || 0;
  const resolved = resolveTierFees(ctx, {
    service_fee_mode: (tier.service_fee_mode || null) as FeeMode | null,
    facility_fee_mode: (tier.facility_fee_mode || null) as FeeMode | null,
  });

  const code = (tier.unlock_code || "").trim();

  // What the chip says without being opened.
  const bits: string[] = [];
  if (resolved.anyWaived) bits.push("Fees waived");
  else if (resolved.service.mode === "included") bits.push("Fees included");
  else bits.push("Fees standard");
  if (code) bits.push("code");

  // Buyer and venue, both ways the ticket can be sold.
  const subtotal = face + resolved.addedToFace;
  const tax = Math.round(subtotal * (Number(ctx.taxRate) || 0) * 100) / 100;
  const buyerPays = Math.round((subtotal + tax) * 100) / 100;
  const card = (method: "online" | "terminal") => {
    const { pct, flatCents } = ratesFor(method);
    return Math.round((buyerPays * pct + flatCents / 100) * 100) / 100;
  };
  const nets = (method: "online" | "terminal") => Math.round((buyerPays - card(method)) * 100) / 100;

  return (
    <div className="tfp">
      <button
        type="button"
        className={`tfp-chip ${resolved.anyWaived ? "tfp-chip--waived" : ""} ${code ? "tfp-chip--coded" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {bits.join(" · ")} {open ? "▾" : "▸"}
      </button>

      {open && (
        <div className="tfp-panel">
          <label className="tfp-field">
            <span>Service fee {ctx.ticketingFee > 0 ? `(${usd(ctx.ticketingFee)})` : "(none set)"}</span>
            <select
              className="admin-form-input"
              value={tier.service_fee_mode || ""}
              disabled={disabled}
              onChange={(e) => onChange("service_fee_mode", e.target.value)}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>

          <label className="tfp-field">
            <span>Facility fee {ctx.facilityFee > 0 ? `(${usd(ctx.facilityFee)})` : "(none set)"}</span>
            <select
              className="admin-form-input"
              value={tier.facility_fee_mode || ""}
              disabled={disabled}
              onChange={(e) => onChange("facility_fee_mode", e.target.value)}
            >
              {MODES.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>

          <label className="tfp-field tfp-field--wide">
            <span>Unlock code</span>
            <input
              type="text"
              className="admin-form-input"
              placeholder="e.g. WRISTBAND — leave blank for an open tier"
              value={tier.unlock_code || ""}
              disabled={disabled}
              onChange={(e) => onChange("unlock_code", e.target.value)}
            />
          </label>

          <p className="tfp-note">
            {resolved.anyWaived
              ? "Waived means the fee is not charged and not earned — unlike included, where it still comes out of the face. Card processing and sales tax are never waivable."
              : "Inherit follows the show, then the venue. Included takes the fee out of the face; waived means nobody pays it and the show earns nothing from it."}
            {code ? " The tier shows locked until this code is entered — online and at the door." : ""}
          </p>

          <div className="tfp-preview">
            <div className="tfp-preview-row">
              <span>Face</span>
              <span>{usd(face)}</span>
            </div>
            {resolved.service.charged > 0 && (
              <div className="tfp-preview-row"><span>Service fee</span><span>+{usd(resolved.service.charged)}</span></div>
            )}
            {resolved.facility.charged > 0 && (
              <div className="tfp-preview-row"><span>Facility fee</span><span>+{usd(resolved.facility.charged)}</span></div>
            )}
            {tax > 0 && <div className="tfp-preview-row"><span>Sales tax</span><span>+{usd(tax)}</span></div>}
            <div className="tfp-preview-row tfp-preview-row--total"><span>Buyer pays</span><span>{usd(buyerPays)}</span></div>
            <div className="tfp-preview-row tfp-preview-sub">
              <span>Show nets online</span>
              <span>{usd(nets("online"))} <em>after {usd(card("online"))} card</em></span>
            </div>
            <div className="tfp-preview-row tfp-preview-sub">
              <span>Show nets at the door</span>
              <span>{usd(nets("terminal"))} <em>after {usd(card("terminal"))} reader</em></span>
            </div>
            {(resolved.service.earned > 0 || resolved.facility.earned > 0) && resolved.addedToFace === 0 && (
              <p className="tfp-preview-note">
                {usd(resolved.service.earned + resolved.facility.earned)} of that is fee revenue taken out of the face, not added to it.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
