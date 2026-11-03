"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";

// ── Manual card entry ─────────────────────────────────────────────────────────

export default function ManualPayForm({
  clientSecret,
  paymentIntentId,
  buyerName,
  buyerEmail,
  buyerPhone,
  buyerZip,
}: {
  clientSecret: string;
  paymentIntentId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerZip: string;
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
              name: buyerName,
              email: buyerEmail,
              phone: buyerPhone || undefined,
              address: buyerZip ? { postal_code: buyerZip } : undefined,
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
        router.push(`/boxoffice/success?payment_intent_id=${paymentIntentId}`);
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
        {isProcessing ? "Processing…" : "Charge Card"}
      </button>
    </form>
  );
}

