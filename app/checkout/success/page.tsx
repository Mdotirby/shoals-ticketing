"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Footer from "@/app/components/Footer";
import { trackFbEvent } from "@/lib/fbq";
import { useOperator } from "@/app/components/OperatorContext";
import { formatPhoneNumber } from "@/lib/formatPhone";
import EventCard from "@/app/components/EventCard";
import TicketPreparingLoader from "@/app/components/TicketPreparingLoader";
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

function formatDate(d: string) {
  return safeDate(d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
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

  return (
    <section className="checkout-success-section">
      <div className="checkout-success-card">
        {/* Success badge — a checkmark in a ring, per checkout_success.png.
            (This was a ticket glyph before; the tick reads as "done", which is
            what this moment is.) */}
        <div className="checkout-success-icon cs-check" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <path
              d="M5 13.5 L10.5 19 L21 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <h2 className="checkout-success-heading">You&apos;re In.</h2>

        <p className="checkout-success-text cs-lede">
          {data?.event?.title ? (
            <>Your spot for <strong>{data.event.title}</strong> is locked in.</>
          ) : (
            <>Your spot is locked in.</>
          )}{" "}
          {data?.order?.customer_email ? (
            <>
              A confirmation and your {(data?.order?.quantity || 1) > 1 ? "tickets are" : "ticket is"}{" "}
              headed to <strong>{data.order.customer_email}</strong> — try not to lose them before the show.
            </>
          ) : (
            <>Your {(data?.order?.quantity || 1) > 1 ? "tickets are" : "ticket is"} on the way by email.</>
          )}
        </p>

        {/* Order card — event photo, tier, breakdown and order number */}
        {!loading && data?.event && (
          <div className="cs-order-card">
            <div className="cs-order-head">
              <span className="cs-order-label">Order Confirmed</span>
              <span className="cs-order-number">Order #{shortOrderRef(data.order?.id)}</span>
            </div>

            <div className="cs-order-ticket">
              <div
                className="cs-order-photo"
                style={
                  data.event.image_url
                    ? { backgroundImage: `url(${data.event.image_url})` }
                    : undefined
                }
              />
              <div className="cs-order-ticket-body">
                <div className="cs-order-event">{data.event.title}</div>
                <div className="cs-order-when">
                  {formatDateShort(data.event.date)} · {data.event.venue}
                </div>
              </div>
              <div className="cs-order-tier">
                <div className="cs-order-tier-name">
                  General Admission &times; {data.order?.quantity ?? 1}
                </div>
                {doorsLabel(data.event.date) && (
                  <div className="cs-order-doors">Doors {doorsLabel(data.event.date)}</div>
                )}
              </div>
            </div>

            {data.order && (
              <div className="cs-order-breakdown">
                {/* The face-value/fees split only appears once the settlement
                    row exists. We never compute it here — a receipt showing a
                    wrong split is worse than one showing just the total. */}
                {data.breakdown ? (
                  <>
                    <div className="cs-order-line">
                      <span>General Admission &times; {data.order.quantity}</span>
                      <span>${data.breakdown.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="cs-order-line">
                      <span>Taxes &amp; Fees</span>
                      <span>${data.breakdown.feesAndTax.toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="cs-order-line">
                    <span>General Admission &times; {data.order.quantity}</span>
                    <span>${data.order.total_amount.toFixed(2)}</span>
                  </div>
                )}
                <div className="cs-order-line cs-order-line--total">
                  <span>Total Paid</span>
                  <span>${data.order.total_amount.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* QR code removed — available on the ticket page via "View My Tickets" */}

        {/* Thank you */}
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, margin: "8px 0 20px" }}>
          Thank you for your purchase. We can&apos;t wait to see you there —
          get ready for an unforgettable night!
        </p>

        {/* QR Code Entry Notice */}
        <div style={{
          margin: "16px 0",
          padding: "14px 20px",
          background: "rgba(var(--vc-gold-rgb), 0.06)",
          border: "1px solid rgba(var(--vc-gold-rgb), 0.12)",
          borderRadius: 10,
          textAlign: "center",
        }}>
          <p style={{ color: "rgb(var(--vc-gold-rgb))", fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>
            Your QR Code Is Your Ticket
          </p>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Present your QR code at the door for entry. Screenshot it, save it to your photos, or print a copy — just have it ready when you arrive.
          </p>
        </div>

        {/* While the webhook is still creating the ticket, this is a real wait
            for someone who has just paid — show progress, not a dead button.
            Once it lands, the state flips to "ready" with the ticket link. */}
        {data?.ticket?.qr_code ? (
          <p className="cs-ready">Your {(data?.order?.quantity || 1) > 1 ? "tickets are" : "ticket is"} ready.</p>
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

        {/* Actions — primary ticket link plus Add to Calendar, side by side.
            There is deliberately no "Add to Apple Wallet": generating .pkpass
            files needs Apple Developer enrollment and a Pass Type ID cert,
            which isn't set up. */}
        <div className="checkout-success-actions cs-actions">
          {data?.ticket?.qr_code ? (
            <Link href={`/tickets/${data.ticket.qr_code}`} className="checkout-success-btn">
              {(data?.order?.quantity || 1) > 1 ? "View My Tickets" : "View My Ticket"}
            </Link>
          ) : (
            <span className="checkout-success-btn cs-btn--pending" aria-hidden="true">
              {(data?.order?.quantity || 1) > 1 ? "View My Tickets" : "View My Ticket"}
            </span>
          )}

          {data?.event && (
            <a
              className="checkout-success-btn cs-btn--outline"
              href={calendarHref(data.event)}
              download={`${data.event.title.replace(/[^\w]+/g, "-").toLowerCase()}.ics`}
            >
              Add to Calendar
            </a>
          )}
        </div>

        {/* Lodging partner — placed right after the actions, while commitment
            is highest. See HOTEL_PARTNER above: static promo, not a live rate. */}
        {HOTEL_PARTNER && (
          <div className="hotel-panel">
            <div className="hotel-photo">
              <span>{HOTEL_PARTNER.name}</span>
            </div>
            <div className="hotel-body">
              <div className="hotel-top">
                <span className="hotel-badge">&#10022; Unlocked By Your Ticket</span>
                <span className="hotel-cutoff">Room block holds through {HOTEL_PARTNER.cutoffLabel}</span>
              </div>
              <h3>You Bought The Ticket. We Got You The Room.</h3>
              <div className="hotel-partner-name">In partnership with {HOTEL_PARTNER.name}</div>
              <p className="hotel-desc">
                Ticket holders only. Not listed on their site, not open to the public.
                Skip the drive home.
              </p>
              <div className="hotel-bottom">
                <div>
                  <div className="hotel-price-row">
                    <span className="hotel-price-old">{HOTEL_PARTNER.rackRate}</span>
                    <span className="hotel-price-new">{HOTEL_PARTNER.memberRate}</span>
                    <span className="hotel-price-unit">/ night</span>
                  </div>
                  <div className="hotel-code-note">
                    Code <b>{HOTEL_PARTNER.promoCode}</b> applied automatically &mdash; no account needed
                  </div>
                </div>
                <a
                  className="checkout-success-btn"
                  href={HOTEL_PARTNER.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Unlock Our Rate
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Laylo SMS opt-in — west72 only, shown after purchase confirmed */}
        {isWest72 && layloStatus !== "dismissed" && (
          <div style={{
            margin: "20px 0 0",
            padding: "20px",
            background: "rgba(var(--vc-gold-rgb), 0.06)",
            border: "1px solid rgba(var(--vc-gold-rgb), 0.18)",
            borderRadius: 12,
            textAlign: "center",
          }}>
            {layloStatus === "success" ? (
              <>
                <p style={{ fontSize: 22, margin: "0 0 6px" }}>📱</p>
                <p style={{ color: "rgb(var(--vc-gold-rgb))", fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>You&apos;re on the list!</p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>
                  We&apos;ll text you first for presales and upcoming shows.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 20, margin: "0 0 8px" }}>🎟️</p>
                <p style={{ color: "rgb(var(--vc-gold-rgb))", fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>
                  Want early access to future shows?
                </p>
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: "0 0 14px", lineHeight: 1.5 }}>
                  Get presale texts before tickets go public. One tap, no spam.
                </p>
                <input
                  type="tel"
                  value={layloPhone}
                  onChange={(e) => setLayloPhone(formatPhoneNumber(e.target.value))}
                  placeholder="(555)-555-5555"
                  inputMode="tel"
                  style={{
                    width: "100%", padding: "11px 14px", marginBottom: 10,
                    background: "rgba(0,0,0,0.3)", border: "1px solid rgba(var(--vc-gold-rgb), 0.2)",
                    borderRadius: 8, color: "#fff", fontSize: 15, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={handleLayloOptIn}
                  disabled={layloStatus === "loading" || layloPhone.replace(/\D/g,"").length < 10}
                  style={{
                    width: "100%", padding: "13px", borderRadius: 8, border: "none",
                    background: layloStatus === "loading" ? "rgba(var(--vc-gold-rgb), 0.4)" : "rgb(var(--vc-gold-rgb))",
                    color: "#111", fontWeight: 700, fontSize: 15, cursor: "pointer",
                    marginBottom: 8, opacity: layloPhone.replace(/\D/g,"").length < 10 ? 0.5 : 1,
                  }}
                >
                  {layloStatus === "loading" ? "Joining..." : "Yes, Text Me 📱"}
                </button>
                {layloError && (
                  <p style={{ color: "#f87171", fontSize: 12, margin: "0 0 8px", textAlign: "center" }}>
                    {layloError}
                  </p>
                )}
                <button
                  onClick={() => setLayloStatus("dismissed")}
                  style={{
                    background: "none", border: "none", color: "rgba(255,255,255,0.3)",
                    fontSize: 12, cursor: "pointer", padding: "4px",
                  }}
                >
                  No thanks
                </button>
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: "10px 0 0", lineHeight: 1.5 }}>
                  By tapping &quot;Yes&quot; you agree to receive recurring automated texts from West72 Entertainment.
                  Reply STOP to unsubscribe. Msg &amp; data rates may apply.
                </p>
              </>
            )}
          </div>
        )}

        {/* Fine print */}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 24, lineHeight: 1.6 }}>
          All sales are final. Refunds are issued only if the event is cancelled by the organizer.
          By completing your purchase you agreed to our{" "}
          <Link href="/faq" style={{ color: "rgba(var(--vc-gold-rgb), 0.6)", textDecoration: "underline" }}>
            Terms of Sale
          </Link>.
          Questions? Email{" "}
          <a href={`mailto:${operator.supportEmail}`} style={{ color: "rgba(var(--vc-gold-rgb), 0.6)" }}>
            {operator.supportEmail}
          </a>
        </p>
      </div>

      {/* Cross-sell — sits outside the confirmation card so it reads as a
          separate invitation rather than part of the receipt. */}
      {alsoLike.length > 0 && (
        <div className="cs-crosssell">
          <p className="cs-crosssell-eyebrow">While You&apos;re Here</p>
          <h3 className="cs-crosssell-heading">
            More Nights Worth Clearing Your Calendar For
          </h3>
          <div className="cs-crosssell-grid">
            {alsoLike.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <>
      <main className="ticket-page">
        <Suspense fallback={<div className="ticket-page-loading">Loading…</div>}>
          <SuccessContent />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
