"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Footer from "@/app/components/Footer";

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

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d); }

function formatDate(d: string) {
  return safeDate(d).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [data, setData] = useState<ConfirmationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    fetch(`/api/checkout/confirmation?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handlePrint = () => window.print();

  return (
    <section className="checkout-success-section">
      <div className="checkout-success-card">
        {/* Success icon */}
        <div className="checkout-success-icon" style={{ fontSize: 48, marginBottom: 8 }}>🎟️</div>
        <h2 className="checkout-success-heading">You&apos;re In!</h2>
        <p className="checkout-success-text">
          Payment confirmed. Your ticket is ready.
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

        {/* QR code */}
        {data?.ticket?.qr_data_url && (
          <div style={{ margin: "16px auto", maxWidth: 180 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.ticket.qr_data_url}
              alt="Your ticket QR code"
              style={{ width: "100%", height: "auto", borderRadius: 8 }}
            />
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, textAlign: "center", marginTop: 6 }}>
              Show this at the door
            </p>
          </div>
        )}

        {/* Thank you */}
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, margin: "8px 0 20px" }}>
          Thank you for your purchase. We can&apos;t wait to see you there —
          get ready for an unforgettable night!
        </p>

        {/* Actions */}
        <div className="checkout-success-actions" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Apple Wallet — requires server-side pkpass generation, stub for now */}
          <button
            type="button"
            disabled
            title="Apple Wallet support coming soon"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: "#000", color: "#fff", border: "none", borderRadius: 8,
              padding: "12px 24px", fontSize: 15, fontWeight: 600, opacity: 0.45,
              cursor: "not-allowed",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.3.07 2.18.76 2.94.8 1.12-.22 2.2-.93 3.37-.84 1.42.12 2.51.65 3.2 1.67-3.12 1.8-2.37 5.67.35 6.83-.57 1.52-1.27 3.02-1.86 4.42zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            Add to Apple Wallet
          </button>

          {/* Print ticket */}
          <button
            type="button"
            onClick={handlePrint}
            className="checkout-success-btn"
          >
            🖨 Print My Ticket
          </button>

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
          <a href="mailto:support@venuecore.live" style={{ color: "rgba(208,194,144,0.6)" }}>
            support@venuecore.live
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
