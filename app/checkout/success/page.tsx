"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Footer from "@/app/components/Footer";

type SessionInfo = {
  status: string;
  customer_email: string;
  event_title: string;
};

export default function CheckoutSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [info, setInfo] = useState<SessionInfo | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    // Optionally fetch session details from a server route
    // For now, show a generic success message
    setInfo({
      status: "complete",
      customer_email: "",
      event_title: "",
    });
  }, [sessionId]);

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">You&apos;re In!</h1>
        </section>

        <section className="checkout-success-section">
          <div className="checkout-success-card">
            <div className="checkout-success-icon">✅</div>
            <h2 className="checkout-success-heading">
              Payment Confirmed
            </h2>
            <p className="checkout-success-text">
              Your tickets have been purchased successfully. You&apos;ll receive
              a confirmation email with your ticket details and QR code shortly.
            </p>

            <div className="checkout-success-actions">
              <Link href="/" className="checkout-success-btn">
                Back to Events
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
