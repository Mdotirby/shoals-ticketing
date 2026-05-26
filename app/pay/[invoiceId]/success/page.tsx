"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useOperator } from "@/app/components/OperatorContext";

const GOLD = "#d0c290";
const DARK = "#0b0d1d";

function fmt(n: number) {
  return (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function SuccessContent() {
  const operator = useOperator();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [invoice, setInvoice] = useState<{ invoice_number: string; client_name: string; total: number } | null>(null);

  useEffect(() => {
    if (!invoiceId) return;
    fetch(`/api/invoices/${invoiceId}`)
      .then((r) => r.json())
      .then((d) => { if (d.invoice_number) setInvoice(d); })
      .catch(() => {});
  }, [invoiceId]);

  return (
    <div style={{ minHeight: "100vh", background: DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(34,197,94,0.3)",
        borderRadius: 16,
        padding: "48px 40px",
        maxWidth: 500,
        textAlign: "center",
      }}>
        <div style={{ marginBottom: 12 }}><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#22c55e" strokeWidth="2.5" /><path d="M15 25l6 6 12-12" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
        <h2 style={{ color: "#22c55e", margin: "0 0 8px", fontSize: 24, fontWeight: 700 }}>Payment Successful!</h2>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 15, margin: "0 0 20px", lineHeight: 1.6 }}>
          Your payment has been received. Thank you!
        </p>

        {invoice && (
          <div style={{
            background: "rgba(208,194,144,0.06)",
            border: "1px solid rgba(208,194,144,0.15)",
            borderRadius: 10,
            padding: "16px 20px",
            marginBottom: 20,
            textAlign: "left",
          }}>
            <p style={{ margin: "0 0 4px", color: GOLD, fontWeight: 700, fontSize: 14 }}>
              {invoice.invoice_number}
            </p>
            <p style={{ margin: "0 0 2px", color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              {invoice.client_name}
            </p>
            <p style={{ margin: 0, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
              Total: {fmt(Number(invoice.total))}
            </p>
          </div>
        )}

        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
          A receipt will be sent to your email. You can close this page.
        </p>

        {/* Footer */}
        <div style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
            {operator.slug === "venuecore" ? "Powered by VenueCore · venuecore.live" : operator.name}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading...</p>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
