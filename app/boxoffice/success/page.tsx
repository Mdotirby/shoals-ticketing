"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

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

function safeDate(d: string) {
  return (d && d.length === 10 && d[4] === "-")
    ? new Date(d + "T12:00:00")
    : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, ""));
}

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

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>
        Loading confirmation...
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 16px 40px", maxWidth: 480, margin: "0 auto", textAlign: "center" }}>
      {/* Success icon */}
      <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#d0c290", margin: "0 0 8px" }}>
        Sale Complete!
      </h2>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, margin: "0 0 20px" }}>
        {(data?.order?.quantity || 1) > 1 ? 'Tickets' : 'Ticket'} confirmation sent to{" "}
        {data?.order?.customer_email && (
          <strong style={{ color: "rgba(255,255,255,0.7)" }}>{data.order.customer_email}</strong>
        )}
      </p>

      {/* Event details */}
      {data?.event && (
        <div style={{
          margin: "0 0 20px",
          padding: "16px 20px",
          background: "rgba(208,194,144,0.07)",
          border: "1px solid rgba(208,194,144,0.15)",
          borderRadius: 10,
          textAlign: "left",
        }}>
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
        <div style={{ margin: "0 auto 20px", maxWidth: 180 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.ticket.qr_data_url}
            alt="Ticket QR code"
            style={{ width: "100%", height: "auto", borderRadius: 8 }}
          />
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, textAlign: "center", marginTop: 6 }}>
            Show at the door
          </p>
        </div>
      )}

      {/* New Sale button */}
      <Link
        href="/boxoffice"
        style={{
          display: "block",
          width: "100%",
          padding: "14px 20px",
          borderRadius: 10,
          border: "none",
          background: "#d0c290",
          color: "#0b0d1d",
          fontSize: 16,
          fontWeight: 700,
          textDecoration: "none",
          textAlign: "center",
          marginBottom: 10,
        }}
      >
        🎫 New Sale
      </Link>
    </div>
  );
}

export default function BoxOfficeSuccessPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#0b0d1d",
      color: "#fff",
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    }}>
      <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading...</div>}>
        <SuccessContent />
      </Suspense>
    </main>
  );
}
