"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { BidderSession } from "@/lib/types/auction";
import { useOperator } from "@/app/components/OperatorContext";
import { stripeAppearance } from "@/lib/stripeAppearance";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ── Payment form (raw Elements + PaymentIntent) ────────────────────────────
function AuctionPayForm({
  clientSecret,
  buyerName,
  buyerEmail,
  onSuccess,
  onError,
}: {
  clientSecret: string;
  buyerName: string;
  buyerEmail: string;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
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
        onError(confirmError.message || "Payment failed. Please try again.");
        setIsProcessing(false);
        return;
      }

      if (paymentIntent?.status === "succeeded") {
        onSuccess();
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

type WonItem = {
  id: string;
  name: string;
  current_bid: number;
};

function getBidderSession(auctionId: string): BidderSession | null {
  try {
    const raw = localStorage.getItem(`vc-auction-${auctionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AuctionCheckoutPage() {
  const operator = useOperator();
  const params = useParams();
  const searchParams = useSearchParams();
  const auctionId = params.auctionId as string;
  const sessionId = searchParams.get("session_id");
  const isSuccess = !!sessionId; // Stripe returns session_id on successful embedded checkout return
  const isCanceled = searchParams.get("canceled") === "true";

  const [session, setSession] = useState<BidderSession | null>(null);
  const [auctionName, setAuctionName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [wonItems, setWonItems] = useState<WonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [checkoutState, setCheckoutState] = useState<
    "select" | "cash_check" | "stripe" | "success"
  >(isSuccess ? "success" : "select");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [processingFee, setProcessingFee] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const sess = getBidderSession(auctionId);
    setSession(sess);

    // Fetch auction info
    fetch(`/api/auctions/${auctionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.name) setAuctionName(data.name);
        if (data.logo_url) setLogoUrl(data.logo_url);
      });

    // Fetch won items
    if (sess) {
      fetch(`/api/auctions/${auctionId}/items`)
        .then((r) => r.json())
        .then((items) => {
          if (Array.isArray(items)) {
            const won = items
              .filter((i: Record<string, unknown>) => i.current_winner_id === sess.bidder_id)
              .map((i: Record<string, unknown>) => ({
                id: i.id as string,
                name: i.name as string,
                current_bid: i.current_bid as number,
              }));
            setWonItems(won);
            const total = won.reduce((sum: number, i: WonItem) => sum + i.current_bid, 0);
            setOrderTotal(total);
            setGrandTotal(total);
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [auctionId]);

  const handlePaymentSelect = async (method: string) => {
    setPaymentMethod(method);
    setError("");
    setSubmitting(true);

    if (!session) return;

    const res = await fetch(`/api/auctions/${auctionId}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bidder_id: session.bidder_id,
        payment_method: method,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Checkout failed.");
      setSubmitting(false);
      return;
    }

    const data = await res.json();
    setOrderTotal(data.total_amount);
    setProcessingFee(data.processing_fee || 0);
    setGrandTotal(data.grand_total || data.total_amount);

    if (method === "credit_debit" && data.clientSecret) {
      setClientSecret(data.clientSecret);
      setCheckoutState("stripe");
    } else {
      setCheckoutState("cash_check");
    }
    setSubmitting(false);
  };

  if (loading) {
    return <div className="auction-loading">Loading checkout…</div>;
  }

  if (!session) {
    return (
      <div className="auction-page">
        <div className="auction-loading">
          <p>You need to be registered to checkout.</p>
          <Link href={`/auction/${auctionId}/register`} className="auction-btn auction-btn-primary">
            Register
          </Link>
        </div>
      </div>
    );
  }

  if (wonItems.length === 0 && !isSuccess) {
    return (
      <div className="auction-page">
        <div className="auction-loading">
          <p>You didn&apos;t win any items in this auction.</p>
          <Link href={`/auction/${auctionId}`} className="auction-btn auction-btn-outline">
            Back to Auction
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auction-page auction-checkout-page">
      <header className="auction-header auction-header-compact">
        {logoUrl && (
          <img src={logoUrl} alt="Logo" className="auction-logo auction-logo-sm" />
        )}
        <h1 className="auction-title-sm">{auctionName}</h1>
      </header>

      {/* Success State */}
      {checkoutState === "success" && (
        <div className="auction-checkout-success">
          <h2>Payment Complete!</h2>
          <p>Thank you for your purchase. You will receive a confirmation email shortly.</p>
          <Link href={`/auction/${auctionId}/dashboard`} className="auction-btn auction-btn-primary">
            Back to Dashboard
          </Link>
        </div>
      )}

      {/* Order Summary */}
      {checkoutState !== "success" && (
        <div className="auction-checkout-card">
          <h2 className="auction-checkout-heading">Order Summary</h2>

          <div className="auction-checkout-items">
            {wonItems.map((item) => (
              <div key={item.id} className="auction-checkout-line">
                <span className="auction-checkout-line-name">{item.name}</span>
                <span className="auction-checkout-line-price">
                  ${item.current_bid.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="auction-checkout-totals">
            <div className="auction-checkout-line auction-checkout-subtotal">
              <span>Subtotal</span>
              <span>${orderTotal.toFixed(2)}</span>
            </div>
            {processingFee > 0 && (
              <div className="auction-checkout-line auction-checkout-fee">
                <span>Processing Fee</span>
                <span>${processingFee.toFixed(2)}</span>
              </div>
            )}
            {processingFee === 0 && paymentMethod === "" && (
              <div className="auction-checkout-line auction-checkout-fee-note">
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                  Credit/debit adds a processing fee
                </span>
              </div>
            )}
            <div className="auction-checkout-line auction-checkout-total">
              <span>Total</span>
              <span>${(grandTotal || orderTotal).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {error && <div className="auction-error">{error}</div>}
      {isCanceled && <div className="auction-error">Payment was canceled. Please try again.</div>}

      {/* Payment Method Selection */}
      {checkoutState === "select" && (
        <div className="auction-checkout-methods">
          <h3 className="auction-checkout-methods-title">Choose Payment Method</h3>
          <div className="auction-checkout-method-btns">
            <button
              onClick={() => handlePaymentSelect("cash")}
              disabled={submitting}
              className="auction-btn auction-btn-method"
            >
              <span className="auction-method-icon"></span>
              <span>Cash</span>
            </button>
            <button
              onClick={() => handlePaymentSelect("check")}
              disabled={submitting}
              className="auction-btn auction-btn-method"
            >
              <span className="auction-method-icon"></span>
              <span>Check</span>
            </button>
            <button
              onClick={() => handlePaymentSelect("credit_debit")}
              disabled={submitting}
              className="auction-btn auction-btn-method auction-btn-method-cc"
            >
              <span className="auction-method-icon"></span>
              <span>Credit/Debit Card</span>
            </button>
          </div>
        </div>
      )}

      {/* Cash/Check Instructions */}
      {checkoutState === "cash_check" && (
        <div className="auction-checkout-offline">
          <h3>Your Total: ${orderTotal.toFixed(2)}</h3>
          <p className="auction-checkout-offline-msg">
            Please visit the <strong>auction desk</strong> to complete your payment
            {paymentMethod === "cash" ? " with cash" : " by check"}.
          </p>
          <p className="auction-checkout-offline-note">
            Your items have been reserved. Please pay before leaving the event.
          </p>
          <Link href={`/auction/${auctionId}/dashboard`} className="auction-btn auction-btn-outline">
            Back to Dashboard
          </Link>
        </div>
      )}

      {/* Card payment (raw Elements + PaymentIntent) */}
      {checkoutState === "stripe" && clientSecret && (
        <div className="auction-checkout-stripe ic-form-wrap">
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: stripeAppearance }}>
            <AuctionPayForm
              clientSecret={clientSecret}
              buyerName={session ? `${session.first_name} ${session.last_name}`.trim() : ""}
              buyerEmail={session?.email || ""}
              onSuccess={() => setCheckoutState("success")}
              onError={(msg) => setError(msg)}
            />
          </Elements>
        </div>
      )}

      <footer className="auction-footer">
        {operator.slug === "venuecore" && <span>Powered by <strong>VenueCore</strong></span>}
      </footer>
    </div>
  );
}
