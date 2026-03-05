"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

type EventOption = {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
  event_type: string;
};

type TierOption = {
  id: string;
  tier_name: string;
  price: number;
  capacity: number;
};

function BoxOfficeContent() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [tiers, setTiers] = useState<TierOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedTierId, setSelectedTierId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingTiers, setLoadingTiers] = useState(false);

  // Fetch upcoming hard_ticket events
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data: EventOption[]) => {
        const now = new Date();
        const upcoming = (data || []).filter(
          (e) =>
            (e.event_type === "hard_ticket" || e.event_type === "ticketed") &&
            new Date(e.date) >= now
        );
        setEvents(upcoming);
      })
      .catch(() => setError("Failed to load events"))
      .finally(() => setLoadingEvents(false));
  }, []);

  // Fetch tiers when event changes
  useEffect(() => {
    if (!selectedEventId) {
      setTiers([]);
      setSelectedTierId("");
      return;
    }
    setLoadingTiers(true);
    fetch(`/api/events/${selectedEventId}/ticket-types`)
      .then((r) => r.json())
      .then((data: TierOption[]) => {
        setTiers(data || []);
        if (data?.length === 1) setSelectedTierId(data[0].id);
        else setSelectedTierId("");
      })
      .catch(() => setTiers([]))
      .finally(() => setLoadingTiers(false));
  }, [selectedEventId]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const selectedTier = tiers.find((t) => t.id === selectedTierId);
  const ticketPrice = selectedTier?.price ?? selectedEvent?.price ?? 0;

  const handleProcessSale = () => {
    if (!selectedEventId) {
      setError("Please select an event");
      return;
    }
    if (!buyerName.trim() || !buyerEmail.trim()) {
      setError("Name and email are required");
      return;
    }
    setError(null);
    setShowCheckout(true);
  };

  const handleReset = () => {
    setShowCheckout(false);
    setBuyerName("");
    setBuyerEmail("");
    setBuyerPhone("");
    setQuantity(1);
    setSelectedTierId("");
    setError(null);
  };

  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/boxoffice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: selectedEventId,
        quantity,
        tier_id: selectedTierId || undefined,
        buyer_name: buyerName.trim(),
        buyer_email: buyerEmail.trim(),
        buyer_phone: buyerPhone.trim(),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to start checkout");
      return "";
    }

    const data = await res.json();
    return data.clientSecret;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, selectedTierId, quantity, buyerName, buyerEmail, buyerPhone]);

  // Show Stripe checkout
  if (showCheckout) {
    return (
      <div style={{ padding: "16px 16px 40px" }}>
        <button
          onClick={handleReset}
          style={{
            background: "transparent",
            border: "1px solid rgba(208,194,144,0.3)",
            color: "#d0c290",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 13,
            cursor: "pointer",
            marginBottom: 16,
          }}
        >
          ← New Sale
        </button>
        <div style={{
          background: "rgba(208,194,144,0.06)",
          border: "1px solid rgba(208,194,144,0.15)",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 16,
          fontSize: 13,
          color: "rgba(255,255,255,0.6)",
        }}>
          <strong style={{ color: "#d0c290" }}>{selectedEvent?.title}</strong>
          <span style={{ margin: "0 8px" }}>·</span>
          {quantity}× {selectedTier?.tier_name || "GA"} @ ${ticketPrice.toFixed(2)}
          <span style={{ margin: "0 8px" }}>·</span>
          {buyerName}
        </div>
        <EmbeddedCheckoutProvider
          stripe={stripePromise}
          options={{ fetchClientSecret }}
        >
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 40px", maxWidth: 480, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, marginBottom: 4 }}>🎫</div>
        <h1 style={{
          fontSize: 22,
          fontWeight: 800,
          color: "#d0c290",
          margin: 0,
          letterSpacing: "-0.02em",
        }}>
          Box Office
        </h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
          Walk-up cashless ticket sales
        </p>
      </div>

      {error && (
        <div style={{
          background: "rgba(255,107,107,0.1)",
          border: "1px solid rgba(255,107,107,0.3)",
          borderRadius: 8,
          padding: "10px 14px",
          color: "#ff6b6b",
          fontSize: 13,
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      {/* Event Selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Event
        </label>
        {loadingEvents ? (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading events...</div>
        ) : (
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              borderRadius: 8,
              border: "1px solid rgba(208,194,144,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontSize: 15,
              appearance: "none",
              WebkitAppearance: "none",
            }}
          >
            <option value="">— Select event —</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title} — {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tier Selector */}
      {selectedEventId && tiers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Ticket Type
          </label>
          {loadingTiers ? (
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading tiers...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {tiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: `1px solid ${selectedTierId === tier.id ? "#d0c290" : "rgba(255,255,255,0.1)"}`,
                    background: selectedTierId === tier.id ? "rgba(208,194,144,0.1)" : "rgba(255,255,255,0.03)",
                    color: selectedTierId === tier.id ? "#d0c290" : "rgba(255,255,255,0.7)",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.15s",
                    textAlign: "left",
                  }}
                >
                  <span>{tier.tier_name}</span>
                  <span style={{ fontWeight: 700 }}>${tier.price.toFixed(2)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quantity */}
      {selectedEventId && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Quantity
          </label>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              style={{
                width: 40, height: 40, borderRadius: 8,
                border: "1px solid rgba(208,194,144,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#d0c290", fontSize: 20, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              −
            </button>
            <span style={{ fontSize: 20, fontWeight: 700, color: "#fff", minWidth: 30, textAlign: "center" }}>
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(Math.min(20, quantity + 1))}
              style={{
                width: 40, height: 40, borderRadius: 8,
                border: "1px solid rgba(208,194,144,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#d0c290", fontSize: 20, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Divider */}
      {selectedEventId && (
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "20px 0" }} />
      )}

      {/* Buyer Info */}
      {selectedEventId && (
        <>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Buyer Name *
            </label>
            <input
              type="text"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              placeholder="Full name"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid rgba(208,194,144,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 15,
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Email *
            </label>
            <input
              type="email"
              value={buyerEmail}
              onChange={(e) => setBuyerEmail(e.target.value)}
              placeholder="email@example.com"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid rgba(208,194,144,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 15,
              }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Phone
            </label>
            <input
              type="tel"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))}
              placeholder="(555)-555-1234"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 8,
                border: "1px solid rgba(208,194,144,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "#fff",
                fontSize: 15,
              }}
            />
          </div>

          {/* Price Summary */}
          {ticketPrice > 0 && (
            <div style={{
              background: "rgba(208,194,144,0.06)",
              border: "1px solid rgba(208,194,144,0.15)",
              borderRadius: 10,
              padding: "14px 16px",
              marginBottom: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 4 }}>
                <span>{quantity}× ${ticketPrice.toFixed(2)}</span>
                <span>${(ticketPrice * quantity).toFixed(2)}</span>
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                + fees & tax at checkout
              </div>
            </div>
          )}

          {/* Process Sale Button */}
          <button
            type="button"
            onClick={handleProcessSale}
            disabled={!selectedEventId || !buyerName.trim() || !buyerEmail.trim()}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: 10,
              border: "none",
              background: !selectedEventId || !buyerName.trim() || !buyerEmail.trim()
                ? "rgba(208,194,144,0.2)"
                : "#d0c290",
              color: !selectedEventId || !buyerName.trim() || !buyerEmail.trim()
                ? "rgba(255,255,255,0.3)"
                : "#0b0d1d",
              fontSize: 16,
              fontWeight: 700,
              cursor: !selectedEventId || !buyerName.trim() || !buyerEmail.trim()
                ? "not-allowed"
                : "pointer",
              transition: "all 0.15s",
            }}
          >
            Process Sale →
          </button>
        </>
      )}
    </div>
  );
}

export default function BoxOfficePage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "#0b0d1d",
      color: "#fff",
      fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    }}>
      <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading...</div>}>
        <BoxOfficeContent />
      </Suspense>
    </main>
  );
}
