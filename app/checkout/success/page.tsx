"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Footer from "@/app/components/Footer";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
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
  );
}

export default function CheckoutSuccessPage() {
  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">You&apos;re In!</h1>
        </section>

        <Suspense
          fallback={
            <div className="ticket-page-loading">Loading...</div>
          }
        >
          <SuccessContent />
        </Suspense>
      </main>

      <Footer />
    </>
  );
}
