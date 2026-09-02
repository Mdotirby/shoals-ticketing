"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { useOperator } from "@/app/components/OperatorContext";
import { stripeAppearance } from "@/lib/stripeAppearance";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

const GOLD = "rgb(var(--vc-gold-rgb))";
const DARK = "#0b0d1d";

// ── Payment form (raw Elements + PaymentIntent) ────────────────────────────
function InvoicePayForm({
  clientSecret,
  paymentIntentId,
  invoiceId,
  buyerName,
  buyerEmail,
}: {
  clientSecret: string;
  paymentIntentId: string;
  invoiceId: string;
  buyerName: string;
  buyerEmail: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const cardNumberElement = elements.getElement(CardNumberElement);
    if (!cardNumberElement) { setCardError("Card fields not ready."); return; }

    setIsProcessing(true);
    setCardError("");

    try {
      const { error: confirmError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardNumberElement,
            billing_details: {
              name: buyerName || undefined,
              email: buyerEmail || undefined,
            },
          },
        }
      );

      if (confirmError) {
        setCardError(confirmError.message || "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        router.push(`/pay/${invoiceId}/success?payment_intent_id=${paymentIntentId}`);
        return;
      }

      setCardError("Payment did not complete. Please try again.");
      setIsProcessing(false);
    } catch {
      setCardError("An unexpected error occurred. Please try again.");
      setIsProcessing(false);
    }
  };

  const cardFieldsComplete = cardNumberComplete && cardExpiryComplete && cardCvcComplete;

  return (
    <form className="ic-form" onSubmit={handleSubmit} noValidate>
      <div className="ic-field">
        <label className="ic-label">Card Number</label>
        <div className="ic-stripe-field">
          <CardNumberElement
            options={{ showIcon: true }}
            onChange={(e) => {
              setCardNumberComplete(e.complete);
              setCardError(e.error?.message || "");
            }}
          />
        </div>
      </div>
      <div className="ic-card-row">
        <div className="ic-field" style={{ flex: 1 }}>
          <label className="ic-label">Expiry</label>
          <div className="ic-stripe-field">
            <CardExpiryElement
              onChange={(e) => {
                setCardExpiryComplete(e.complete);
                if (e.error) setCardError(e.error.message);
              }}
            />
          </div>
        </div>
        <div className="ic-field" style={{ flex: 1 }}>
          <label className="ic-label">CVC</label>
          <div className="ic-stripe-field">
            <CardCvcElement
              onChange={(e) => {
                setCardCvcComplete(e.complete);
                if (e.error) setCardError(e.error.message);
              }}
            />
          </div>
        </div>
      </div>
      {cardError && <p className="ic-error">{cardError}</p>}
      <button
        type="submit"
        className="ic-pay-btn"
        disabled={!stripe || isProcessing || !cardFieldsComplete}
      >
        {isProcessing ? "Processing…" : "Pay Now"}
      </button>
    </form>
  );
}

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
  const [creatingIntent, setCreatingIntent] = useState(false);
  const [clientSecret, setClientSecret] = useState("");
  const [paymentIntentId, setPaymentIntentId] = useState("");

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

  const handleStartCheckout = async () => {
    if (!invoiceId) return;
    setCreatingIntent(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to start checkout");
        return;
      }
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId ?? "");
      setShowCheckout(true);
    } catch {
      setError("Failed to start checkout. Please try again.");
    } finally {
      setCreatingIntent(false);
    }
  };

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
        background: "rgba(var(--vc-gold-rgb), 0.05)", borderBottom: "1px solid rgba(var(--vc-gold-rgb), 0.15)",
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
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(var(--vc-gold-rgb), 0.15)",
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
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(var(--vc-gold-rgb), 0.2)" }}>
                  <span style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>Amount Due</span>
                  <span style={{ color: GOLD, fontSize: 18, fontWeight: 700 }}>{fmt(balanceDue)}</span>
                </div>
              </div>
            </div>

            {/* Pay button */}
            <button
              onClick={handleStartCheckout}
              disabled={creatingIntent}
              style={{
                width: "100%", padding: "16px", background: GOLD, color: DARK,
                border: "none", borderRadius: 10, fontSize: 16, fontWeight: 700,
                cursor: creatingIntent ? "not-allowed" : "pointer", letterSpacing: 0.5,
                opacity: creatingIntent ? 0.7 : 1,
              }}
            >
              {creatingIntent ? "Loading…" : `Pay ${fmt(balanceDue)}`}
            </button>

            {error && (
              <p style={{ textAlign: "center", color: "#ef4444", fontSize: 13, marginTop: 12 }}>{error}</p>
            )}

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
            {clientSecret ? (
              <div className="ic-form-wrap">
                <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>
                  <InvoicePayForm
                    clientSecret={clientSecret}
                    paymentIntentId={paymentIntentId}
                    invoiceId={invoiceId}
                    buyerName={invoice.client_name}
                    buyerEmail={invoice.client_email}
                  />
                </Elements>
              </div>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading payment…</p>
            )}
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
