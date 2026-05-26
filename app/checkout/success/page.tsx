"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Footer from "@/app/components/Footer";
import { trackFbEvent } from "@/lib/fbq";
import { useOperator } from "@/app/components/OperatorContext";

type ConfirmationData = {
  order: {
    id: string;
    customer_name: string;
    customer_email: string;
    quantity: number;
    total_amount: number;
  };
  event: { title: string; date: string; venue: string } | null;
  ticket: { id: string; qr_code: string; qr_data_url: string } | null;
};

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")); }

function formatDate(d: string) {
  return safeDate(d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function SuccessContent() {
  const operator = useOperator();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [data, setData] = useState<ConfirmationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    fetch(`/api/checkout/confirmation?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setData(d);
          // Fire Meta Pixel Purchase event with real order value — seeds pixel for ad optimization
          trackFbEvent("Purchase", {
            value: d.order?.total_amount ?? 0,
            currency: "USD",
            content_type: "product",
            num_items: d.order?.quantity ?? 1,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <section className="checkout-success-section">
      <div className="checkout-success-card">
        {/* Success icon */}
        <div className="checkout-success-icon" style={{ marginBottom: 8 }}><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="4" y="14" width="40" height="20" rx="4" stroke="#d0c290" strokeWidth="2" /><path d="M4 22a4 4 0 0 1 0 4" stroke="#d0c290" strokeWidth="2" /><path d="M44 22a4 4 0 0 0 0 4" stroke="#d0c290" strokeWidth="2" /><line x1="16" y1="14" x2="16" y2="34" stroke="#d0c290" strokeWidth="1.5" strokeDasharray="2 2" /></svg></div>
        <h2 className="checkout-success-heading">You&apos;re In!</h2>
        <p className="checkout-success-text">
          Payment confirmed. Your {(data?.order?.quantity || 1) > 1 ? 'tickets are' : 'ticket is'} ready.
          {data?.order?.customer_email && (
            <> A copy has been emailed to <strong>{data.order.customer_email}</strong>.</>
          )}
        </p>

        {/* Event details */}
        {!loading && data?.event && (
          <div
            style={{
              margin: "20px 0",
              padding: "16px 20px",
              background: "rgba(208,194,144,0.07)",
              border: "1px solid rgba(208,194,144,0.15)",
              borderRadius: 10,
              textAlign: "left",
            }}
          >
            <p style={{ color: "#d0c290", fontWeight: 700, margin: 0, fontSize: "1.05rem" }}>
              {data.event.title}
            </p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: "4px 0 0" }}>
              {formatDate(data.event.date)} · {data.event.venue}
            </p>
            {data.order && (
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: "4px 0 0" }}>
                {data.order.quantity} ticket{data.order.quantity !== 1 ? "s" : ""} ·{" "}
                ${data.order.total_amount.toFixed(2)} total
              </p>
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
          background: "rgba(208,194,144,0.06)",
          border: "1px solid rgba(208,194,144,0.12)",
          borderRadius: 10,
          textAlign: "center",
        }}>
          <p style={{ color: "#d0c290", fontWeight: 700, fontSize: 14, margin: "0 0 4px" }}>
            Your QR Code Is Your Ticket
          </p>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            Present your QR code at the door for entry. Screenshot it, save it to your photos, or print a copy — just have it ready when you arrive.
          </p>
        </div>

        {/* Actions */}
        <div className="checkout-success-actions" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* View ticket online */}
          {data?.ticket?.qr_code && (
            <Link
              href={`/tickets/${data.ticket.qr_code}`}
              className="checkout-success-btn"
            >
              {(data?.order?.quantity || 1) > 1 ? "View My Tickets" : "View My Ticket"}
            </Link>
          )}

          {/* Back to events */}
          <Link href="/events" className="checkout-success-btn" style={{ background: "transparent", border: "1px solid rgba(208,194,144,0.3)" }}>
            ← Back to Events
          </Link>
        </div>

        {/* Fine print */}
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 24, lineHeight: 1.6 }}>
          All sales are final. Refunds are issued only if the event is cancelled by the organizer.
          By completing your purchase you agreed to our{" "}
          <Link href="/faq" style={{ color: "rgba(208,194,144,0.6)", textDecoration: "underline" }}>
            Terms of Sale
          </Link>.
          Questions? Email{" "}
          <a href={`mailto:${operator.supportEmail}`} style={{ color: "rgba(208,194,144,0.6)" }}>
            {operator.supportEmail}
          </a>
        </p>
      </div>
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
