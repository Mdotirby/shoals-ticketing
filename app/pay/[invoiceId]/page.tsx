"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { useOperator } from "@/app/components/OperatorContext";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

const GOLD = "#d0c290";
const DARK = "#0b0d1d";

type InvoiceData = {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string;
  total: number;
  balance_due: number;
  amount_paid: number;
  status: string;
  due_date: string;
  line_items: Array<{ description: string; amount: number }>;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
};

function fmt(n: number) {
  return (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function safeDate(d: string) {
  if (!d) return "—";
  return new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

export default function PayInvoicePage() {
  const operator = useOperator();
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    if (!invoiceId) return;
    fetch(`/api/invoices/${invoiceId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Invoice not found");
        return r.json();
      })
      .then((d) => setInvoice(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [invoiceId]);

  const fetchClientSecret = useCallback(async () => {
    if (!invoiceId) return "";
    const res = await fetch(`/api/invoices/${invoiceId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to start checkout");
      return "";
    }
    const data = await res.json();
    return data.clientSecret;
  }, [invoiceId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#ef4444", fontSize: 18 }}>{error || "Invoice not found"}</p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 8 }}>Please check the link and try again.</p>
        </div>
      </div>
    );
  }

  if (invoice.status === "paid") {
    return (
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16,
          padding: "48px 40px", maxWidth: 500, textAlign: "center",
        }}>
          <div style={{ marginBottom: 12 }}><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><circle cx="24" cy="24" r="22" stroke="#22c55e" strokeWidth="2.5" /><path d="M15 25l6 6 12-12" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
          <h2 style={{ color: "#22c55e", margin: "0 0 8px", fontSize: 22 }}>Invoice Paid</h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14 }}>
            Invoice {invoice.invoice_number} has been paid in full. Thank you!
          </p>
        </div>
      </div>
    );
  }

  if (invoice.status === "void") {
    return (
      <div style={{ minHeight: "100vh", background: DARK, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16,
          padding: "48px 40px", maxWidth: 500, textAlign: "center",
        }}>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 16 }}>This invoice has been voided.</p>
        </div>
      </div>
    );
  }

  const balanceDue = Number(invoice.balance_due) || Number(invoice.total) - Number(invoice.amount_paid || 0);

  return (
    <div style={{ minHeight: "100vh", background: DARK }}>
      {/* Header */}
      <div style={{
        background: "rgba(208,194,144,0.05)", borderBottom: "1px solid rgba(208,194,144,0.15)",
        padding: "20px 0", textAlign: "center",
      }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: GOLD, textTransform: "uppercase" }}>VenueCore</p>
        <h1 style={{ margin: "4px 0 0", color: "#fff", fontSize: 20, fontWeight: 700 }}>Invoice Payment</h1>
      </div>

      <div style={{ maxWidth: 600, margin: "0 auto", padding: "32px 20px" }}>
        {!showCheckout ? (
          <>
            {/* Invoice summary card */}
            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(208,194,144,0.15)",
              borderRadius: 12, padding: "24px 28px", marginBottom: 24,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ color: GOLD, fontWeight: 700, fontSize: 16 }}>{invoice.invoice_number}</span>
                <span style={{
                  padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                  textTransform: "uppercase", background: "rgba(245,158,11,0.15)", color: "#f59e0b",
                  border: "1px solid rgba(245,158,11,0.3)",
                }}>
                  {invoice.status}
                </span>
              </div>

              <div style={{ marginBottom: 16, color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                <p style={{ margin: "0 0 4px" }}>Bill to: <strong style={{ color: "#fff" }}>{invoice.client_name}</strong></p>
                <p style={{ margin: 0 }}>Due: {safeDate(invoice.due_date)}</p>
              </div>

              {/* Line items */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                {(invoice.line_items || []).map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 14 }}>
                    <span style={{ color: "rgba(255,255,255,0.7)" }}>{item.description}</span>
                    <span style={{ color: "#fff", fontWeight: 500 }}>{fmt(item.amount)}</span>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 8, paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: "rgba(255,255,255,0.5)" }}>Subtotal</span>
                  <span style={{ color: "#fff" }}>{fmt(Number(invoice.subtotal))}</span>
                </div>
                {Number(invoice.tax_amount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Tax</span>
                    <span style={{ color: "#fff" }}>{fmt(Number(invoice.tax_amount))}</span>
                  </div>
                )}
                {Number(invoice.amount_paid) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 13 }}>
                    <span style={{ color: "rgba(255,255,255,0.5)" }}>Paid</span>
                    <span style={{ color: "#22c55e" }}>-{fmt(Number(invoice.amount_paid))}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(208,194,144,0.2)" }}>
                  <span style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>Amount Due</span>
                  <span style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>{fmt(balanceDue)}</span>
                </div>
              </div>
            </div>

            {/* Pay button */}
            <button
              onClick={() => setShowCheckout(true)}
              style={{
                width: "100%", padding: "16px", background: GOLD, color: DARK,
                border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700,
                cursor: "pointer", letterSpacing: 0.5,
              }}
            >
              Pay {fmt(balanceDue)}
            </button>

            <p style={{ textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 16 }}>
              Secure payment powered by Stripe
            </p>
          </>
        ) : (
          <div>
            <button
              onClick={() => setShowCheckout(false)}
              style={{
                background: "none", border: "none", color: "rgba(255,255,255,0.5)",
                cursor: "pointer", fontSize: 13, marginBottom: 16,
              }}
            >
              ← Back to invoice
            </button>
            <div id="checkout" style={{ borderRadius: 12, overflow: "hidden" }}>
              <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ textAlign: "center", padding: "24px 0", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          {operator.slug === "venuecore" ? "Powered by VenueCore · venuecore.live" : operator.name}
        </p>
      </div>
    </div>
  );
}
