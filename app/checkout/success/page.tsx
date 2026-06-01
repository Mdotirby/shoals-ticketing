"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Footer from "@/app/components/Footer";
import { trackFbEvent } from "@/lib/fbq";
import { useOperator } from "@/app/components/OperatorContext";
import { formatPhoneNumber } from "@/lib/formatPhone";

type ConfirmationData = {
  order: {
    id: string;
    customer_name: string;
    customer_email: string;
    customer_phone: string | null;
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
  const sessionId = searchParams.get("session_id");
  const isPreview = searchParams.get("preview") === "1";
  const [data, setData] = useState<ConfirmationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [layloPhone, setLayloPhone] = useState("");
  const [layloStatus, setLayloStatus] = useState<"idle" | "loading" | "success" | "dismissed">("idle");
  const [layloError, setLayloError] = useState<string | null>(null);

  useEffect(() => {
    if (isPreview) {
      setData(PREVIEW_DATA);
      setLayloPhone(formatPhoneNumber(PREVIEW_DATA.order.customer_phone!));
      setLoading(false);
      return;
    }
    if (!sessionId) { setLoading(false); return; }
    fetch(`/api/checkout/confirmation?session_id=${sessionId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) {
          setData(d);
          // Pre-fill phone for Laylo opt-in from what they entered at checkout
          if (d.order?.customer_phone) {
            setLayloPhone(formatPhoneNumber(d.order.customer_phone));
          }
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

        {/* Laylo SMS opt-in — west72 only, shown after purchase confirmed */}
        {isWest72 && layloStatus !== "dismissed" && (
          <div style={{
            margin: "20px 0 0",
            padding: "20px",
            background: "rgba(208,194,144,0.06)",
            border: "1px solid rgba(208,194,144,0.18)",
            borderRadius: 12,
            textAlign: "center",
          }}>
            {layloStatus === "success" ? (
              <>
                <p style={{ fontSize: 22, margin: "0 0 6px" }}>📱</p>
                <p style={{ color: "#d0c290", fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>You&apos;re on the list!</p>
                <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: 0 }}>
                  We&apos;ll text you first for presales and upcoming shows.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 20, margin: "0 0 8px" }}>🎟️</p>
                <p style={{ color: "#d0c290", fontWeight: 700, fontSize: 15, margin: "0 0 4px" }}>
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
                    background: "rgba(0,0,0,0.3)", border: "1px solid rgba(208,194,144,0.2)",
                    borderRadius: 8, color: "#fff", fontSize: 15, outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  onClick={handleLayloOptIn}
                  disabled={layloStatus === "loading" || layloPhone.replace(/\D/g,"").length < 10}
                  style={{
                    width: "100%", padding: "13px", borderRadius: 8, border: "none",
                    background: layloStatus === "loading" ? "rgba(208,194,144,0.4)" : "#d0c290",
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
