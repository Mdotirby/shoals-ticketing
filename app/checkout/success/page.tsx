"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import SfHeader from "@/app/components/SfHeader";
import SfFooter from "@/app/components/SfFooter";
import SfStepper from "@/app/components/SfStepper";
import { trackFbEvent } from "@/lib/fbq";
import { useOperator } from "@/app/components/OperatorContext";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { HotelPartnerPanel } from "@/app/components/liquid-glass-components";
import { SuccessHeader } from "./_components/SuccessHeader";
import { OrderConfirmationPanel } from "./_components/OrderConfirmationPanel";
import { ActionRow } from "./_components/ActionRow";
import { CrossSellSection } from "./_components/CrossSellSection";
import { Event } from "@/lib/types/event";

type ConfirmationData = {
  order: {
    id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
    quantity: number;
    total_amount: number;
  };
  event: { id?: string; title: string; date: string; venue: string; image_url?: string | null } | null;
  ticket: { id: string; qr_code: string; qr_data_url: string } | null;
  /** Real ticket-tier name, e.g. "VIP Table" — resolved server-side from
   *  tickets.ticket_type_id, so it only arrives once the ticket itself
   *  does. Null until then; falls back to "General Admission" for display
   *  rather than showing nothing. */
  tierName?: string | null;
  breakdown?: { subtotal: number; feesAndTax: number } | null;
};

// Matches the webhook's typical lag; ~20s of headroom before we stop waiting
// and show what we have.
/* Lodging partner promo shown after the order actions.
 *
 * PLACEHOLDER DATA. The design brief expects these wired to a live partner
 * rate feed; that feed doesn't exist yet, so the values live here as named
 * constants — editable in one place, and obvious that they are static rather
 * than looked up. Set HOTEL_PARTNER to null to drop the panel entirely. */
const HOTEL_PARTNER: {
  name: string; rackRate: string; memberRate: string;
  promoCode: string; cutoffLabel: string; href: string;
} | null = {
  name: "Renaissance Shoals Resort & Spa",
  rackRate: "$189",
  memberRate: "$129",
  promoCode: "W72COLE",
  cutoffLabel: "Oct 30",
  href: "https://www.marriott.com/en-us/hotels/msltn-renaissance-shoals-resort-and-spa/overview/",
};

const CONFIRM_INTERVAL_MS = 800;
const CONFIRM_MAX_ATTEMPTS = 25;

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")); }

/** "W72-88421" style short reference taken from the order UUID — the full id
 *  is unwieldy on a confirmation and support only ever needs the tail. */
function shortOrderRef(id?: string) {
  if (!id) return "—";
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

/** Doors are conventionally an hour before the listed start. Returns null when
 *  the event has no time set, so we render nothing rather than a fake "Doors". */
function doorsLabel(d: string) {
  const start = safeDate(d);
  if (start.getHours() === 0 && start.getMinutes() === 0) return null;
  const doors = new Date(start.getTime() - 60 * 60 * 1000);
  return doors.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDateShort(d: string) {
  return safeDate(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  }) + " · " + safeDate(d).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

/** Builds an .ics as a data URI so "Add to Calendar" works without a round
 *  trip or a third-party service. Duration is a nominal 3 hours — we store a
 *  start time, not an end time. */
function calendarHref(event: { title: string; date: string; venue: string }) {
  const start = safeDate(event.date);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const escape = (v: string) => v.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VenueCore//Tickets//EN",
    "BEGIN:VEVENT",
    `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@venuecore`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape(event.venue)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

const PREVIEW_DATA: ConfirmationData = {
  order: {
    id: "preview-order",
    customer_name: "Matt Irby",
    customer_email: "matt@west72ent.com",
    customer_phone: "(256)-555-0172",
    quantity: 2,
    total_amount: 60.00,
  },
  event: { title: "Summer Throwdown 2026", date: "2026-07-19", venue: "The Shoals Theatre" },
  ticket: { id: "preview-ticket", qr_code: "PREVIEW", qr_data_url: "" },
  tierName: "General Admission",
};

function SuccessContent() {
  const operator = useOperator();
  const isWest72 = operator.slug === "west72";
  const searchParams = useSearchParams();
  // Three routes land here: the hosted Checkout Session redirect, the inline
  // card/wallet checkout (payment intent), and free registrations (order id).
  const sessionId = searchParams.get("session_id");
  const paymentIntentId = searchParams.get("payment_intent_id");
  const orderId = searchParams.get("order_id");
  const lookupQuery = sessionId
    ? `session_id=${sessionId}`
    : paymentIntentId
      ? `payment_intent_id=${paymentIntentId}`
      : orderId
        ? `order_id=${orderId}`
        : null;
  const isPreview = searchParams.get("preview") === "1";
  const [data, setData] = useState<ConfirmationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [layloPhone, setLayloPhone] = useState("");
  const [layloStatus, setLayloStatus] = useState<"idle" | "loading" | "success" | "dismissed">("idle");
  const [layloError, setLayloError] = useState<string | null>(null);
  const [alsoLike, setAlsoLike] = useState<Event[]>([]);

  useEffect(() => {
    if (isPreview) {
      setData(PREVIEW_DATA);
      setLayloPhone(formatPhoneNumber(PREVIEW_DATA.order.customer_phone!));
      setLoading(false);
      return;
    }
    if (!lookupQuery) { setLoading(false); return; }

    // The order and its ticket are created by the Stripe webhook, which runs
    // asynchronously — arriving straight from an inline checkout usually beats
    // it here. Poll until the ticket exists rather than showing "not found" to
    // someone who has just paid. Purchase is tracked once, on first resolve.
    let cancelled = false;
    let attempts = 0;
    let tracked = false;

    async function poll() {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/checkout/confirmation?${lookupQuery}`);
        if (res.ok) {
          const d = await res.json();
          if (!d.error) {
            if (!cancelled) {
              setData(d);
              if (d.order?.customer_phone) {
                setLayloPhone(formatPhoneNumber(d.order.customer_phone));
              }
              if (!tracked) {
                tracked = true;
                trackFbEvent("Purchase", {
                  value: d.order?.total_amount ?? 0,
                  currency: "USD",
                  content_type: "product",
                  num_items: d.order?.quantity ?? 1,
                });
              }
            }
            // Keep polling only while the ticket itself is still pending.
            if (d.ticket?.qr_code || attempts >= CONFIRM_MAX_ATTEMPTS) {
              if (!cancelled) setLoading(false);
              return;
            }
          }
        }
      } catch {
        // Non-fatal — retry below.
      }
      if (!cancelled) {
        if (attempts >= CONFIRM_MAX_ATTEMPTS) { setLoading(false); return; }
        setTimeout(poll, CONFIRM_INTERVAL_MS);
      }
    }

    poll();
    return () => { cancelled = true; };
  }, [lookupQuery]);

  // Cross-sell grid. Loaded independently of the confirmation itself so a slow
  // or failed events call can never hold up (or break) the order confirmation.
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((list) => {
        if (!Array.isArray(list)) return;
        setAlsoLike(list.filter((e: Event) => e.id !== data?.event?.id).slice(0, 3));
      })
      .catch(() => {});
  }, [data?.event?.id]);

  async function handleLayloOptIn() {
    if (!layloPhone.trim()) return;
    setLayloStatus("loading");
    setLayloError(null);
    const nameParts = (data?.order?.customer_name || "").split(" ");
    try {
      const res = await fetch("/api/laylo/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: layloPhone.trim(),
          firstName: nameParts[0] || undefined,
          lastName: nameParts.slice(1).join(" ") || undefined,
          source: "west72-post-checkout",
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        const msg = result?.error || "Could not subscribe. Please try again.";
        console.error("Laylo subscribe failed:", result);
        setLayloError(msg);
        setLayloStatus("idle");
        return;
      }
      setLayloStatus("success");
    } catch (err) {
      console.error("Laylo subscribe error:", err);
      setLayloError("Connection error. Please try again.");
      setLayloStatus("idle");
    }
  }

  const quantity = data?.order?.quantity || 1;
  const tierName = data?.tierName || "General Admission";
  const tierLabel = quantity > 1 ? `${tierName} × ${quantity}` : tierName;

  return (
    /* Storefront glass rebuild (step 7/8). Mockup order-complete screen,
       lines 1613-1717: stepper on DONE, then the "You're in" confirmation
       panel, the ticket card with its QR, the action row, and the cross-sell
       grid outside the receipt.

       DATA LAYER UNCHANGED: the /api/checkout/confirmation poll and its
       retry/backoff (CONFIRM_INTERVAL_MS / CONFIRM_MAX_ATTEMPTS), /api/events
       for cross-sell, /api/laylo/subscribe, every searchParams read
       (session_id, payment_intent_id, order_id, preview) and the trackFbEvent
       Purchase call are byte-identical.

       Two components are deliberately NOT restyled, per STOREFRONT_SPEC.md §5:
       CrossSellSection renders .event-card, "leave that component alone — it's
       already correct for this surface", and HotelPartnerPanel's glass rules
       already exist and are to be reused rather than rebuilt. */
    <section className="sf-success">
      <SfStepper current={3} />

      <div className="sf-cart sf-success-card">
        <SuccessHeader
          eventTitle={data?.event?.title}
          email={data?.order?.customer_email}
          quantity={quantity}
        />

        {/* Order card — event photo, tier, breakdown, QR notice and
            ready/preparing status all live inside this one card now. */}
        {!loading && data?.event && (
          <OrderConfirmationPanel
            orderNumber={shortOrderRef(data.order?.id)}
            quantity={quantity}
            ticketReady={!!data?.ticket?.qr_code}
            loading={loading}
            ticket={{
              eventName: data.event.title,
              dateVenue: `${formatDateShort(data.event.date)} · ${data.event.venue}`,
              tierLabel,
              subLabel: doorsLabel(data.event.date) ? `Doors ${doorsLabel(data.event.date)}` : undefined,
              photoUrl: data.event.image_url ?? undefined,
            }}
            priceLines={
              // The face-value/fees split only appears once the settlement
              // row exists. We never compute it here — a receipt showing a
              // wrong split is worse than one showing just the total.
              data.breakdown
                ? [
                    { label: tierLabel, amount: `$${data.breakdown.subtotal.toFixed(2)}` },
                    { label: "Taxes & Fees", amount: `$${data.breakdown.feesAndTax.toFixed(2)}` },
                  ]
                : [{ label: tierLabel, amount: `$${(data.order?.total_amount ?? 0).toFixed(2)}` }]
            }
            total={`$${(data.order?.total_amount ?? 0).toFixed(2)}`}
          />
        )}

        {/* Actions — primary ticket link plus Add to Calendar, side by side.
            There is deliberately no "Add to Apple Wallet": generating .pkpass
            files needs Apple Developer enrollment and a Pass Type ID cert,
            which isn't set up. */}
        <ActionRow
          ticketHref={data?.ticket?.qr_code ? `/tickets/${data.ticket.qr_code}` : null}
          ticketLabel={quantity > 1 ? "View My Tickets" : "View My Ticket"}
          calendarHref={data?.event ? calendarHref(data.event) : undefined}
          calendarFilename={data?.event ? `${data.event.title.replace(/[^\w]+/g, "-").toLowerCase()}.ics` : undefined}
        />

        {/* Lodging partner — placed right after the actions, while commitment
            is highest. See HOTEL_PARTNER above: static promo, not a live rate. */}
        {HOTEL_PARTNER && (
          <HotelPartnerPanel
            partnerName={HOTEL_PARTNER.name}
            cutoffLabel={HOTEL_PARTNER.cutoffLabel}
            rackRate={HOTEL_PARTNER.rackRate}
            memberRate={HOTEL_PARTNER.memberRate}
            promoCode={HOTEL_PARTNER.promoCode}
            ctaHref={HOTEL_PARTNER.href}
          />
        )}

        {/* Laylo SMS opt-in — west72 only, shown after purchase confirmed */}
        {isWest72 && layloStatus !== "dismissed" && (
          <div className="cs-laylo">
            {layloStatus === "success" ? (
              <>
                <svg className="cs-laylo-success-icon" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12.5l2.5 2.5L16 9.5" />
                </svg>
                <p className="cs-laylo-title">You&apos;re on the list!</p>
                <p className="cs-laylo-text">We&apos;ll text you first for presales and upcoming shows.</p>
              </>
            ) : (
              <>
                <svg className="cs-laylo-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="7" y="2" width="10" height="18" rx="2" />
                  <path d="M11 17h2" />
                </svg>
                <p className="cs-laylo-title">Want early access to future shows?</p>
                <p className="cs-laylo-text">Get presale texts before tickets go public. One tap, no spam.</p>
                <input
                  type="tel"
                  className="cs-laylo-input"
                  value={layloPhone}
                  onChange={(e) => setLayloPhone(formatPhoneNumber(e.target.value))}
                  placeholder="(555)-555-5555"
                  inputMode="tel"
                />
                <button
                  type="button"
                  className="lg-btn lg-btn--md lg-btn--primary cs-laylo-submit"
                  onClick={handleLayloOptIn}
                  disabled={layloStatus === "loading" || layloPhone.replace(/\D/g, "").length < 10}
                >
                  {layloStatus === "loading" ? "Joining..." : "Yes, Text Me"}
                </button>
                {layloError && <p className="cs-laylo-error">{layloError}</p>}
                <button type="button" className="cs-laylo-decline" onClick={() => setLayloStatus("dismissed")}>
                  No thanks
                </button>
                <p className="cs-laylo-fineprint">
                  By tapping &quot;Yes&quot; you agree to receive recurring automated texts from West72 Entertainment.
                  Reply STOP to unsubscribe. Msg &amp; data rates may apply.
                </p>
              </>
            )}
          </div>
        )}

        {/* Fine print */}
        <p className="checkout-success-terms">
          All sales are final. Refunds are issued only if the event is cancelled by the organizer.
          By completing your purchase you agreed to our{" "}
          <Link href="/faq" className="checkout-success-terms-link">Terms of Sale</Link>.
          Questions? Email{" "}
          <a href={`mailto:${operator.supportEmail}`} className="checkout-success-terms-link">
            {operator.supportEmail}
          </a>
        </p>
      </div>

      {/* Cross-sell — sits outside the confirmation card so it reads as a
          separate invitation rather than part of the receipt. */}
      <CrossSellSection shows={alsoLike} />
    </section>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <div className="sf-page">
      <SfHeader />
      <Suspense fallback={<div className="sf-empty">Loading…</div>}>
        <SuccessContent />
      </Suspense>
      <SfFooter />
    </div>
  );
}
