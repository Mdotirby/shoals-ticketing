"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import Footer from "@/app/components/Footer";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

function CheckoutContent() {
  const searchParams = useSearchParams();
  const eventId = searchParams.get("event");
  const quantity = Number(searchParams.get("qty") || "1");
  const [error, setError] = useState<string | null>(null);

  // Buyer info state
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [fwbOptIn, setFwbOptIn] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);

  const handleContinue = () => {
    if (!buyerName.trim() || !buyerEmail.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (!agreed) {
      setError("Please agree to the terms to continue.");
      return;
    }
    setError(null);
    setShowCheckout(true);
  };

  const fetchClientSecret = useCallback(async () => {
    if (!eventId) {
      setError("No event selected.");
      return "";
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: eventId,
        quantity,
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        buyer_phone: buyerPhone.trim(),
        fwb_opt_in: fwbOptIn,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to start checkout.");
      return "";
    }

    const data = await res.json();
    return data.clientSecret;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, quantity, buyerName, buyerEmail, buyerPhone, fwbOptIn]);

  if (!eventId) {
    return (
      <div className="ticket-page-loading">
        No event selected. Go back and choose a ticket.
      </div>
    );
  }

  // Show buyer info form first
  if (!showCheckout) {
    return (
      <section className="checkout-embed-section">
        <div className="pre-checkout-form">
          <h3>Your Information</h3>

          <div className="pre-checkout-field">
            <label htmlFor="buyer-name">Full Name *</label>
            <input
              id="buyer-name"
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="pre-checkout-field">
            <label htmlFor="buyer-email">Email Address *</label>
            <input
              id="buyer-email"
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="pre-checkout-field">
            <label htmlFor="buyer-phone">Phone Number</label>
            <input
              id="buyer-phone"
              type="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
              placeholder="(555) 555-1234"
            />
          </div>

          <label className="pre-checkout-checkbox">
            <input
              type="checkbox"
              checked={fwbOptIn}
              onChange={(e) => setFwbOptIn(e.target.checked)}
            />
            <span>
              Yes, sign me up for <strong>Friends with Benefits</strong> — get early access to tickets, 
              exclusive offers, and event updates via email and text. You can unsubscribe at any time.
            </span>
          </label>

          <label className="pre-checkout-checkbox">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I agree to the <a href="/faq" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "underline" }}>Terms of Sale</a> and 
              acknowledge that all sales are final. I consent to receiving my ticket and order 
              confirmation via email.
            </span>
          </label>

          {error && (
            <p style={{ color: "#ff6b6b", fontSize: 13, margin: "12px 0 0" }}>{error}</p>
          )}

          <button
            type="button"
            className="pre-checkout-continue-btn"
            onClick={handleContinue}
            disabled={!buyerName.trim() || !buyerEmail.trim() || !agreed}
          >
            Continue to Payment
          </button>
        </div>
      </section>
    );
  }

  if (error) {
    return <div className="ticket-page-loading">{error}</div>;
  }

  return (
    <section className="checkout-embed-section">
      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{ fetchClientSecret }}
      >
        <EmbeddedCheckout className="checkout-embed" />
      </EmbeddedCheckoutProvider>
    </section>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">Secure Checkout</h1>
        </section>

        <Suspense
          fallback={
            <div className="ticket-page-loading">Loading checkout...</div>
          }
        >
          <CheckoutContent />
        </Suspense>
      </main>

      <Footer />
    </>
  );
}
