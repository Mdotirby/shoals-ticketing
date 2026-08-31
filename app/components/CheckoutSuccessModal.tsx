"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOperator } from "@/app/components/OperatorContext";

type FwbStatus = "idle" | "loading" | "done" | "dismissed";

type Props = {
  eventTitle: string;
  eventDate: string; // pre-formatted display string
  eventVenue: string;
  quantity: number;
  totalAmount: number;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  /** Free checkout: the ticket already exists, pass its URL directly. */
  ticketUrl?: string | null;
  /** Paid checkout: ticket is created asynchronously by the Stripe webhook —
   *  poll /api/checkout/confirmation with this until it resolves. */
  paymentIntentId?: string | null;
};

const POLL_INTERVAL_MS = 800;
const POLL_MAX_ATTEMPTS = 12; // ~10s

export default function CheckoutSuccessModal({
  eventTitle,
  eventDate,
  eventVenue,
  quantity,
  totalAmount,
  buyerName,
  buyerEmail,
  buyerPhone,
  ticketUrl = null,
  paymentIntentId = null,
}: Props) {
  const operator = useOperator();
  const isWest72 = operator.slug === "west72";

  const [revealed, setRevealed] = useState(false);
  const [resolvedTicketUrl, setResolvedTicketUrl] = useState<string | null>(ticketUrl);
  const [fwbStatus, setFwbStatus] = useState<FwbStatus>("idle");

  // Curtain-panel reveal — trigger on the next frame so the transition runs
  // from the initial (covered) state instead of snapping straight to open.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Poll for the ticket on paid checkouts — it doesn't exist yet at the
  // moment this modal appears, since the Stripe webhook creates it
  // asynchronously after confirmCardPayment() resolves client-side.
  useEffect(() => {
    if (resolvedTicketUrl || !paymentIntentId) return;
    let cancelled = false;
    let attempts = 0;

    async function poll() {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/checkout/confirmation?payment_intent_id=${paymentIntentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data?.ticket?.qr_code) {
            setResolvedTicketUrl(`/tickets/${data.ticket.qr_code}`);
            return;
          }
        }
      } catch {
        // Non-fatal — retry
      }
      if (!cancelled && attempts < POLL_MAX_ATTEMPTS) {
        setTimeout(poll, POLL_INTERVAL_MS);
      }
    }
    poll();
    return () => { cancelled = true; };
  }, [resolvedTicketUrl, paymentIntentId]);

  async function handleOptIn() {
    if (fwbStatus !== "idle") return;
    setFwbStatus("loading");

    const nameParts = buyerName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || firstName;
    const phone = buyerPhone?.trim() || undefined;

    const tasks: Promise<unknown>[] = [
      fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email: buyerEmail.trim(), phone, source: "checkout" }),
      }),
    ];
    // Laylo SMS needs a real phone number — only fire it when we have one.
    // No extra prompt for a missing number: email-only signup still succeeds.
    if (phone) {
      tasks.push(
        fetch("/api/laylo/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, firstName, lastName, source: "checkout" }),
        }),
      );
    }

    await Promise.allSettled(tasks);
    setFwbStatus("done");
  }

  return (
    <div className={`checkout-success-overlay${revealed ? " is-revealed" : ""}`}>
      <div className="checkout-success-backdrop" />

      <div className={`checkout-success-card${isWest72 ? " checkout-success-card-west72" : ""}`}>
        <div className="checkout-success-icon">
          {isWest72 ? (
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="28" fill="rgb(var(--vc-gold-rgb))" />
              <path d="M16 28.5L24 36.5L40 19.5" stroke="#0a0a0a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="24" fill="rgba(16, 185, 129, 0.15)" />
              <path d="M14 24L21 31L34 18" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>

        <h2 className="checkout-success-heading">
          {isWest72 ? "You’re in" : "You’re In!"}
        </h2>
        <p className="checkout-success-event">{eventTitle}</p>
        <p className="checkout-success-meta">{eventDate} &middot; {eventVenue}</p>
        <p className="checkout-success-detail">
          {quantity} ticket{quantity !== 1 ? "s" : ""} &middot; ${totalAmount.toFixed(2)} paid
        </p>

        {resolvedTicketUrl ? (
          <Link href={resolvedTicketUrl} className="checkout-success-cta">
            {quantity > 1 ? "View My Tickets" : "View My Ticket"}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        ) : (
          <div className="checkout-success-cta checkout-success-cta-pending">
            Finalizing your ticket&hellip;
          </div>
        )}

        {/* FWB / Laylo opt-in */}
        {fwbStatus !== "dismissed" && (
          <div className="checkout-success-fwb">
            {fwbStatus === "done" ? (
              <div className="checkout-success-fwb-done">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="10" fill="rgba(16, 185, 129, 0.15)" />
                  <path d="M6 10L9 13L14 7" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Got you down!</span>
              </div>
            ) : (
              <>
                <div className="checkout-success-fwb-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.65 3.35 2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.91 6.91l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                </div>
                <h3 className="checkout-success-fwb-heading">Find out what&apos;s next before everyone else</h3>
                <p className="checkout-success-fwb-desc">
                  We text FWB members when a new show drops. One text. That&apos;s it.
                </p>
                <button
                  type="button"
                  className="checkout-success-fwb-btn"
                  disabled={fwbStatus === "loading"}
                  onClick={handleOptIn}
                >
                  {fwbStatus === "loading" ? "Just a sec..." : "Count me in"}
                </button>
                <button
                  type="button"
                  className="checkout-success-fwb-decline"
                  onClick={() => setFwbStatus("dismissed")}
                >
                  No thanks
                </button>
                <p className="checkout-success-fwb-fine-print">Unsubscribe anytime.</p>
              </>
            )}
          </div>
        )}
      </div>

      <div className="checkout-success-curtain checkout-success-curtain-top" />
      <div className="checkout-success-curtain checkout-success-curtain-bottom" />
    </div>
  );
}
