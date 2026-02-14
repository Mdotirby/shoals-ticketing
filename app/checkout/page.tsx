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

  const fetchClientSecret = useCallback(async () => {
    if (!eventId) {
      setError("No event selected.");
      return "";
    }

    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, quantity }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to start checkout.");
      return "";
    }

    const data = await res.json();
    return data.clientSecret;
  }, [eventId, quantity]);

  if (!eventId) {
    return (
      <div className="ticket-page-loading">
        No event selected. Go back and choose a ticket.
      </div>
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
