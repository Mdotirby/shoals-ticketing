"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { loadStripe } from "@stripe/stripe-js";
import { loadStripeTerminal } from "@stripe/terminal-js";
import type { Terminal, Reader } from "@stripe/terminal-js";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import { compareEventsForDisplay, isEventLive, isEventToday, safeDate } from "@/lib/dates";
import { stripeAppearance } from "@/lib/stripeAppearance";

/**
 * BOX OFFICE POS — rebuilt to the mockup's Box office screen.
 *
 * The mockup's layout is not decoration. It is a till: the reader's state
 * across the top because every card sale depends on it, the tier tiles and
 * keypad on the left because that is the hand that builds the sale, the cart
 * and the tenders in the middle because that is where money moves, and the
 * night's running state on the right because that is what gets reconciled.
 * Three columns at `minmax(330px, 1fr)`, so a door tablet in portrait collapses
 * to one and still leads with the sale.
 *
 * THE BACKEND IS UNTOUCHED, per the handoff. /api/terminal/connection-token
 * stays scoped to the Terminal Location (the S700 cannot be discovered
 * otherwise), /api/terminal/payment-intent keeps its own card-present rate of
 * 2.7% + $0.05, and /api/box-office/cash-sale keeps its real written zeros.
 *
 * ONE PLACE THE MOCKUP OUTRUNS THE SCHEMA: it draws a multi-line cart with
 * several tiers in one sale. An order carries a single tier and quantity —
 * there is no line-item table — so a mixed basket cannot be charged as one
 * payment. The cart here holds one tier line, in the mockup's shape. Letting
 * staff build a basket the reader cannot take would be worse than not having
 * one. See REBUILD-REPORT.md.
 */

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
const ALLOWED_ROLES = ["owner", "venue_admin", "box_office"];

type EventOption  = { id: string; title: string; date: string; price: number; event_type: string };
type TierOption   = { id: string; tier_name: string; price: number; capacity?: number | null; sold?: number | null };
type PaymentMode  = "idle" | "terminal" | "manual";
type SaleType     = "card" | "cash";

/**
 * The reader's real states, not a proxy for them.
 *
 * This used to collapse the Terminal SDK's lifecycle into "ready" and
 * "collecting". A dot that is green whenever the page has loaded is worse than
 * no dot: staff learn to ignore it, and the first time they find out the
 * reader dropped is with a customer's card already in their hand.
 */
type TerminalStatus =
  | "init"          // SDK loading
  | "discovering"   // scanning the Location for readers
  | "no_readers"    // nothing found, or we lost the one we had
  | "connecting"    // handshaking with a specific reader
  | "ready"         // genuinely connected and idle
  | "collecting"    // intent is on the reader, customer has not tapped yet
  | "processing"    // card read, Stripe deciding
  | "success"
  | "error";

/**
 * The payment progression, shown to staff as a checklist. Separate from the
 * reader state because they move independently — the reader can be ready
 * while no payment is running, and a payment can be mid-flight while the
 * reader is momentarily unreachable.
 */
type PayStage = null | "intent" | "sent" | "waiting" | "processing" | "issued";

type DoorTotals = {
  cash: { orders: number; amount: number; tickets: number };
  card: { orders: number; amount: number; tickets: number };
  comp: { orders: number; tickets: number };
  online: { orders: number; amount: number; tickets: number };
  doorTotal: number;
  doorTickets: number;
  scannedIn: number;
  ticketsIssued: number;
  recent: { id: string; name: string; amount: number; quantity: number; tender: string; at: string }[];
};

/**
 * A guest-list row, as `guest_list` actually stores it.
 *
 * This was written against guessed field names — `name`, `guest_name`,
 * `checked_in` — none of which exist. The table is first_name / last_name /
 * quantity / notes, so every row on the door's list rendered as the fallback
 * string "Guest" and the status badge meant nothing.
 */
type GuestRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  quantity?: number | null;
  notes?: string | null;
  /** Null until someone at the door marks them in. */
  checked_in_at?: string | null;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const clock = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() < 12 ? "a" : "p"}`;
};

// ── Login Gate ────────────────────────────────────────────────────────────────

function LoginScreen({ onSuccess }: { onSuccess: (name: string) => void }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const isWest72 = getCookie("operatorSlug") === "west72";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError || !authData.user) { setError("Invalid email or password."); setLoading(false); return; }

      const { data: adminRecord } = await supabase
        .from("admin_users").select("role, first_name").eq("id", authData.user.id).single();

      if (!adminRecord || !ALLOWED_ROLES.includes(adminRecord.role)) {
        await supabase.auth.signOut();
        setError("Your account doesn't have box office access.");
        setLoading(false);
        return;
      }
      const name = adminRecord.first_name || email.split("@")[0];
      onSuccess(name.charAt(0).toUpperCase() + name.slice(1));
    } catch { setError("Something went wrong. Please try again."); setLoading(false); }
  };

  return (
    <div className="bo-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={isWest72 ? "/West72_Logos/W72_tech_wordmark_white.png" : "/VenueCore_Logos/VenueCore_Wordmark_White.png"} alt={isWest72 ? "West72" : "VenueCore"} style={{ height: 24, objectFit: "contain", marginBottom: 18 }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.02em" }}>Box Office</h1>
          <p className="bo-sub" style={{ margin: 0 }}>Sign in to process walk-up sales</p>
        </div>
        <form onSubmit={handleLogin} className="bo-glass">
          {error && (
            <div className="bo-glass bo-glass--bad" style={{ padding: "10px 14px", borderRadius: 12, color: "#f87171", fontSize: 13, marginBottom: 18, boxShadow: "none" }}>{error}</div>
          )}
          <div style={{ marginBottom: 16 }}>
            <label className="bo-label">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@venue.com" required autoComplete="email" className="bo-field" />
          </div>
          <div style={{ marginBottom: 22 }}>
            <label className="bo-label">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" className="bo-field" />
          </div>
          <button type="submit" disabled={loading || !email || !password} className="bo-tender bo-tender--primary" style={{ width: "100%" }}>
            <span className="bo-tender-label">{loading ? "Signing in…" : "Sign In"}</span>
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Manual card entry ─────────────────────────────────────────────────────────

function ManualPayForm({
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

// ── Box Office Content ────────────────────────────────────────────────────────

function BoxOfficeContent({ staffName, onSignOut }: { staffName: string; onSignOut: () => void }) {
  const [events, setEvents]                   = useState<EventOption[]>([]);
  const [tiers, setTiers]                     = useState<TierOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedTierId, setSelectedTierId]   = useState("");
  const [quantity, setQuantity]               = useState(1);
  const [saleType, setSaleType]               = useState<SaleType>("card");
  const [buyerName, setBuyerName]             = useState("");
  const [buyerEmail, setBuyerEmail]           = useState("");
  const [buyerPhone, setBuyerPhone]           = useState("");
  const [buyerZip, setBuyerZip]               = useState("");
  const [formError, setFormError]             = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents]     = useState(true);
  const [loadingTiers, setLoadingTiers]       = useState(false);
  const [cashSubmitting, setCashSubmitting]   = useState(false);
  const [cashSuccess, setCashSuccess]         = useState<{ name: string; quantity: number } | null>(null);

  // Keypad buffer. Typing digits sets the quantity outright; tapping a tier
  // with a buffer pending adds that many at once, per the mockup's rule
  // ("Tap a tier to add one. Type a number first to add several at once.").
  const [keyBuffer, setKeyBuffer] = useState("");

  // Terminal
  const terminalRef                           = useRef<Terminal | null>(null);
  const [terminalStatus, setTerminalStatus]   = useState<TerminalStatus>("init");
  const [readers, setReaders]                 = useState<Reader[]>([]);
  const [connectedReader, setConnectedReader] = useState<Reader | null>(null);
  const [terminalError, setTerminalError]     = useState("");
  const [, setPaymentMode]                    = useState<PaymentMode>("idle");
  const [lastPing, setLastPing]               = useState<Date | null>(null);

  // Payment progression + live timer.
  const [payStage, setPayStage]         = useState<PayStage>(null);
  const [payElapsed, setPayElapsed]     = useState(0);
  const [issueWarning, setIssueWarning] = useState("");

  // Tonight
  const [door, setDoor]     = useState<DoorTotals | null>(null);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [checkingIn, setCheckingIn] = useState<string | null>(null);
  const [counted, setCounted] = useState("");

  // Manual card entry fallback
  const [showManual, setShowManual]                     = useState(false);
  const [creatingManualIntent, setCreatingManualIntent] = useState(false);
  const [manualClientSecret, setManualClientSecret]     = useState("");
  const [manualPaymentIntentId, setManualPaymentIntentId] = useState("");

  const isWest72 = getCookie("operatorSlug") === "west72";

  // ── Init Terminal SDK ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const StripeTerminal = await loadStripeTerminal();
      if (!StripeTerminal || cancelled) return;

      const t = StripeTerminal.create({
        onFetchConnectionToken: async () => {
          const res = await fetch("/api/terminal/connection-token", { method: "POST" });
          const json = await res.json();
          setLastPing(new Date());
          return json.secret as string;
        },
        onUnexpectedReaderDisconnect: () => {
          setConnectedReader(null);
          setTerminalStatus("no_readers");
          setTerminalError("Reader disconnected.");
        },
      });
      terminalRef.current = t;
      discoverReaders(t);
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const discoverReaders = async (t: Terminal) => {
    setTerminalStatus("discovering");
    setTerminalError("");
    // Smart Readers (Stripe Reader S700) only appear when discovery is scoped
    // to the Location they're registered under. Unset env var = unscoped
    // discovery, which is the old behaviour.
    const locationId = process.env.NEXT_PUBLIC_STRIPE_TERMINAL_LOCATION_ID;
    const result = await t.discoverReaders({
      method: "internet",
      simulated: false,
      ...(locationId ? { location: locationId } : {}),
    });
    if ("error" in result) {
      setTerminalStatus("no_readers");
      setTerminalError(result.error.message);
      return;
    }
    if (result.discoveredReaders.length === 0) {
      setTerminalStatus("no_readers");
      return;
    }
    setReaders(result.discoveredReaders);
    connectReader(t, result.discoveredReaders[0]);
  };

  const connectReader = async (t: Terminal, reader: Reader) => {
    setTerminalStatus("connecting");
    const result = await t.connectReader(reader);
    if ("error" in result) {
      setTerminalStatus("no_readers");
      setTerminalError(result.error.message);
      return;
    }
    setConnectedReader(result.reader);
    setLastPing(new Date());
    setTerminalStatus("ready");
  };

  // ── Load events ───────────────────────────────────────────────────────────
  // Tonight's show has to stay in this dropdown all night — it's what the door
  // reader sells against. `isEventLive` keeps it through Central midnight
  // instead of dropping it at UTC rollover (7 PM CDT the evening *before*).
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data: EventOption[]) => {
        const live = (data || [])
          .filter((e) => (e.event_type === "hard_ticket" || e.event_type === "ticketed") && isEventLive(e.date))
          .sort(compareEventsForDisplay);
        setEvents(live);
        // Arm the reader on tonight's show without staff touching the picker.
        const tonight = live.find((e) => isEventToday(e.date));
        if (tonight) setSelectedEventId(tonight.id);
      })
      .catch(() => setFormError("Failed to load events"))
      .finally(() => setLoadingEvents(false));
  }, []);

  useEffect(() => {
    if (!selectedEventId) { setTiers([]); setSelectedTierId(""); return; }
    setLoadingTiers(true);
    fetch(`/api/events/${selectedEventId}/ticket-types`)
      .then((r) => r.json())
      .then((data: TierOption[]) => {
        setTiers(data || []);
        if (data?.length === 1) setSelectedTierId(data[0].id); else setSelectedTierId("");
      })
      .catch(() => setTiers([]))
      .finally(() => setLoadingTiers(false));
  }, [selectedEventId]);

  // Live timer beside the progression. Runs only while a payment is in flight.
  useEffect(() => {
    if (!payStage || payStage === "issued") { setPayElapsed(0); return; }
    const started = Date.now();
    const id = setInterval(() => setPayElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [payStage]);

  // Tonight's drawer + guest list. Refreshed after every completed sale — the
  // number staff reconcile against has to include the one they just took.
  const refreshDoor = useCallback(async () => {
    if (!selectedEventId) { setDoor(null); setGuests([]); return; }
    try {
      const r = await fetch(`/api/box-office/tonight?event_id=${selectedEventId}`);
      if (r.ok) setDoor(await r.json());
    } catch { /* informational; never block a sale on it */ }
    try {
      const g = await fetch(`/api/artists/guests?event_id=${selectedEventId}`);
      if (g.ok) { const d = await g.json(); if (Array.isArray(d)) setGuests(d); }
    } catch { /* same */ }
  }, [selectedEventId]);

  useEffect(() => { refreshDoor(); }, [refreshDoor]);
  useEffect(() => {
    if (payStage === "issued" || cashSuccess) refreshDoor();
  }, [payStage, cashSuccess, refreshDoor]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const selectedTier  = tiers.find((t) => t.id === selectedTierId);
  const ticketPrice   = selectedTier?.price ?? selectedEvent?.price ?? 0;
  const faceValue     = Math.round(ticketPrice * quantity * 100) / 100;

  // ── Keypad ────────────────────────────────────────────────────────────────
  const pressKey = (k: string) => {
    if (k === "C") { setKeyBuffer(""); setQuantity(1); return; }
    if (k === "⌫") { setKeyBuffer((b) => b.slice(0, -1)); return; }
    setKeyBuffer((b) => {
      const next = (b + k).replace(/^0+/, "").slice(0, 2);
      if (next) setQuantity(Math.min(20, Math.max(1, parseInt(next, 10))));
      return next;
    });
  };

  const pickTier = (tierId: string) => {
    setSelectedTierId(tierId);
    // A pending keypad number means "that many of this tier"; otherwise one.
    if (keyBuffer) { setQuantity(Math.min(20, Math.max(1, parseInt(keyBuffer, 10)))); setKeyBuffer(""); }
    else setQuantity((q) => (selectedTierId === tierId ? q : 1));
    setFormError(null);
  };

  // ── Validate ──────────────────────────────────────────────────────────────
  // Email is OPTIONAL, matching the cash path beside it. Requiring one meant a
  // walk-up who did not want to give an address could not be sold a card
  // ticket at all — and in practice staff type junk to get past the field,
  // which is worse than no address. The buyer walks in on the spot (door sales
  // are checked in on issue), so the email is a receipt, not the entry pass.
  const validateForm = () => {
    if (!selectedEventId) { setFormError("Select an event"); return false; }
    if (!buyerName.trim()) { setFormError("Buyer name is required"); return false; }
    setFormError(null);
    return true;
  };

  /**
   * Cancel a payment sitting on the reader.
   *
   * Without this the only way out of a stuck "waiting for tap" was to reload
   * the page, which leaves the intent live on the reader and the next customer
   * tapping into the previous sale.
   */
  const cancelTerminalPay = async () => {
    try { await terminalRef.current?.cancelCollectPaymentMethod(); } catch { /* already gone */ }
    setPayStage(null);
    setPaymentMode("idle");
    setTerminalStatus("ready");
    setTerminalError("");
  };

  /**
   * Poll until the ticket exists.
   *
   * "Approved" on the reader means Stripe took the money, nothing more. The
   * order, ticket and ledger row are written by the webhook, out of band. If
   * that fails, the card is charged and nothing on this screen says otherwise
   * — which is exactly how 54 sales ended up with no ledger row. There is a
   * person standing at the door; they deserve to be told.
   */
  const confirmIssued = async (paymentIntentId: string) => {
    if (!paymentIntentId) return;
    for (let i = 0; i < 12; i++) {
      try {
        const r = await fetch(`/api/box-office/order-status?payment_intent=${paymentIntentId}`);
        const d = await r.json();
        if (d.issued) {
          setPayStage("issued");
          if (d.ledgerWritten === false) {
            setIssueWarning("Ticket is valid, but the settlement row did not write. Note this sale for reconciliation.");
          }
          return;
        }
      } catch { /* keep waiting */ }
      await new Promise((res) => setTimeout(res, 1000));
    }
    // 12 seconds is well beyond a healthy webhook. Say so plainly rather than
    // spinning: the money is taken either way and staff need to know to check.
    setIssueWarning(
      "Payment went through, but the ticket has not appeared after 12 seconds. " +
      "Let them in and flag this sale — do not re-run the card."
    );
  };

  const handleTerminalPay = async () => {
    if (!validateForm() || !terminalRef.current) return;
    setPaymentMode("terminal");
    setTerminalStatus("collecting");
    setTerminalError("");
    setIssueWarning("");
    setPayStage("intent");

    try {
      // 1. Create PaymentIntent on backend (uses card-present fee math)
      const intentRes = await fetch("/api/terminal/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          tier_id: selectedTierId || undefined,
          quantity,
          buyer_name: buyerName.trim(),
          buyer_email: buyerEmail.trim(),
          buyer_phone: buyerPhone.trim(),
          buyer_zip: buyerZip.trim() || undefined,
        }),
      });
      const intentData = await intentRes.json();
      if (!intentRes.ok) throw new Error(intentData.error || "Failed to create payment");
      setPayStage("sent");

      // 2. Collect payment method — customer taps card/phone to reader.
      //    This is the step that blocks on a human, so it gets its own state.
      setPayStage("waiting");
      const collectResult = await terminalRef.current.collectPaymentMethod(intentData.clientSecret);
      if ("error" in collectResult) throw new Error(collectResult.error.message);

      // 3. Process payment
      setPayStage("processing");
      setTerminalStatus("processing");
      const processResult = await terminalRef.current.processPayment(collectResult.paymentIntent);
      if ("error" in processResult) throw new Error(processResult.error.message);

      setTerminalStatus("success");
      setLastPing(new Date());
      await confirmIssued(intentData.paymentIntentId);
    } catch (err: unknown) {
      setTerminalError(err instanceof Error ? err.message : "Payment failed");
      setTerminalStatus("ready");
      setPaymentMode("idle");
      setPayStage(null);
    }
  };

  // ── Manual entry fallback ─────────────────────────────────────────────────
  // source: "box_office" keeps these on their own line in settlement/ticket-
  // audit reporting instead of folding into "inline_checkout".
  const handleManualPay = async () => {
    if (!validateForm()) return;
    setFormError(null);
    setCreatingManualIntent(true);
    try {
      const res = await fetch("/api/checkout/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          quantity,
          tierId: selectedTierId || undefined,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim(),
          buyerPhone: buyerPhone.trim(),
          buyerZip: buyerZip.trim() || undefined,
          source: "box_office",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || "Failed to start checkout"); return; }
      setManualClientSecret(data.clientSecret);
      setManualPaymentIntentId(data.paymentIntentId ?? "");
      setShowManual(true);
    } catch {
      setFormError("Failed to start checkout. Please try again.");
    } finally {
      setCreatingManualIntent(false);
    }
  };

  // ── Cash sale ─────────────────────────────────────────────────────────────
  const handleCashSale = async () => {
    if (!selectedEventId) { setFormError("Select an event"); return; }
    if (!buyerName.trim()) { setFormError("Buyer name is required"); return; }
    const parts = buyerName.trim().split(/\s+/);
    setFormError(null);
    setCashSubmitting(true);
    try {
      const res = await fetch("/api/box-office/cash-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          tier_id: selectedTierId || undefined,
          quantity,
          buyer_first_name: parts[0],
          buyer_last_name: parts.slice(1).join(" ") || parts[0],
          operator_slug: isWest72 ? "west72" : "venuecore",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to record cash sale");
      setCashSuccess({ name: data.customer_name, quantity: data.quantity });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to record cash sale");
    } finally {
      setCashSubmitting(false);
    }
  };

  /**
   * Mark a guest arrived, or undo it.
   *
   * Optimistic: the door is not a place to wait on a round trip, so the row
   * flips immediately and reverts if the write fails.
   */
  const toggleGuest = async (guestId: string, checkedIn: boolean) => {
    setCheckingIn(guestId);
    const before = guests;
    setGuests((gs) =>
      gs.map((g) => (g.id === guestId ? { ...g, checked_in_at: checkedIn ? new Date().toISOString() : null } : g))
    );
    try {
      const res = await fetch("/api/artists/guests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: guestId, checked_in: checkedIn }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setGuests(before);
        setFormError(d.error || "Could not update the guest list.");
      }
    } catch {
      setGuests(before);
      setFormError("Could not update the guest list.");
    } finally {
      setCheckingIn(null);
    }
  };

  const resetSale = () => {
    setShowManual(false); setPaymentMode("idle");
    setBuyerName(""); setBuyerEmail(""); setBuyerPhone(""); setBuyerZip("");
    setCashSuccess(null); setQuantity(1); setKeyBuffer("");
    if (tiers.length !== 1) setSelectedTierId("");
    setFormError(null); setTerminalError("");
    setManualClientSecret(""); setManualPaymentIntentId("");
    setPayStage(null); setPayElapsed(0); setIssueWarning("");
    if (terminalStatus === "success") setTerminalStatus("ready");
  };

  // ── Reader presentation ───────────────────────────────────────────────────
  // Amber while discovering or connecting, red on disconnect with a Reconnect
  // action, mint ONLY when genuinely connected.
  const READER_STATES: Record<TerminalStatus, { dot: string; label: string; tone: string }> = {
    init:        { dot: "bo-dot--idle", label: "Starting reader…",                   tone: "rgba(255,255,255,0.55)" },
    discovering: { dot: "bo-dot--warn", label: "Looking for the reader…",            tone: "#fbbf24" },
    no_readers:  { dot: "bo-dot--bad",  label: "No reader — card sales unavailable", tone: "#f87171" },
    connecting:  { dot: "bo-dot--warn", label: "Connecting to reader…",              tone: "#fbbf24" },
    ready:       { dot: "",             label: "Connected to reader",                tone: "#8fd6a8" },
    collecting:  { dot: "bo-dot--busy", label: "Waiting for the customer to tap",    tone: "#60a5fa" },
    processing:  { dot: "bo-dot--busy", label: "Processing payment…",                tone: "#60a5fa" },
    success:     { dot: "",             label: "Payment accepted",                   tone: "#8fd6a8" },
    error:       { dot: "bo-dot--bad",  label: "Reader error",                       tone: "#f87171" },
  };
  const reader = READER_STATES[terminalStatus];
  const readerOk = terminalStatus === "ready" || terminalStatus === "success"
    || terminalStatus === "collecting" || terminalStatus === "processing";

  // The reader's identity, beneath the light. Staff at a venue with more than
  // one reader need to know WHICH one is armed before sending a payment to it.
  const readerIdentity = connectedReader
    ? [
        connectedReader.device_type === "stripe_s700" ? "Stripe Reader S700" : connectedReader.device_type,
        connectedReader.label ? `“${connectedReader.label}”` : null,
        "tap, chip & swipe ready",
      ].filter(Boolean).join(" · ")
    : terminalStatus === "no_readers"
      ? "Cash sales still work. Manual card entry still works."
      : "Scanning the venue’s Stripe Terminal location";

  const readerMeta: { label: string; value: string; tone: string }[] = connectedReader
    ? [
        { label: "Serial", value: connectedReader.serial_number || "—", tone: "rgba(255,255,255,0.80)" },
        // battery_level is on the reader object the JS SDK returns at runtime
        // but is absent from @stripe/terminal-js's Reader type, so it is read
        // defensively rather than asserted onto the type.
        { label: "Battery", value: typeof (connectedReader as unknown as { battery_level?: number }).battery_level === "number"
            ? `${Math.round((connectedReader as unknown as { battery_level: number }).battery_level * 100)}%`
            : "—", tone: "#fff" },
        { label: "Last ping", value: lastPing ? `${Math.max(0, Math.round((Date.now() - lastPing.getTime()) / 1000))}s ago` : "—", tone: "#8fd6a8" },
        { label: "Mode", value: "Card present", tone: "#fff" },
      ]
    : [];

  // ── Payment progression ───────────────────────────────────────────────────
  const PAY_STEPS: { key: Exclude<PayStage, null>; label: string; meta: string }[] = [
    { key: "intent",     label: "Payment intent created",     meta: money(faceValue) },
    { key: "sent",       label: "Sent to reader",             meta: connectedReader?.label || "reader" },
    { key: "waiting",    label: "Waiting for the customer",   meta: "" },
    { key: "processing", label: "Processing",                 meta: "" },
    { key: "issued",     label: "Ticket issued & checked in", meta: "" },
  ];
  const payStepIndex = payStage ? PAY_STEPS.findIndex((s) => s.key === payStage) : -1;

  const countedNum = parseFloat(counted);
  const overShort = door && !Number.isNaN(countedNum) ? Math.round((countedNum - door.cash.amount) * 100) / 100 : null;

  // ── Success ───────────────────────────────────────────────────────────────
  // NOT shown the instant the reader approves. "Approved" means Stripe took
  // the money; the ticket is written by the webhook a beat later. Showing
  // "paid" before the ticket exists is how a failed webhook becomes invisible
  // at the door — so this waits for confirmation, or for the poll to give up.
  const cardDone = terminalStatus === "success" && (payStage === "issued" || issueWarning);
  if (cardDone || cashSuccess) {
    const ok = cashSuccess ? true : payStage === "issued";
    const qty = cashSuccess ? cashSuccess.quantity : quantity;
    const who = cashSuccess ? cashSuccess.name : buyerName;
    return (
      <div className="bo-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div className={`bo-glass ${ok ? "bo-glass--good" : "bo-glass--warn"}`} style={{ maxWidth: 420, textAlign: "center", padding: "34px 28px" }}>
          <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 14, color: ok ? "#8fd6a8" : "#fbbf24" }}>{ok ? "✓" : "!"}</div>
          <h2 style={{ fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 10px", color: ok ? "#8fd6a8" : "#fbbf24" }}>
            {ok ? "Paid — let them in" : "Paid, needs a look"}
          </h2>
          <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(255,255,255,0.62)", margin: 0 }}>
            {qty} ticket{qty === 1 ? "" : "s"} for {who} — already checked in, no scan needed at the door.
          </p>
          {!cashSuccess && buyerEmail.trim() && (
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", margin: "8px 0 0" }}>Confirmation sent to {buyerEmail.trim()}.</p>
          )}
          {issueWarning && <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "#fbbf24", margin: "16px 0 0" }}>{issueWarning}</p>}
          <button onClick={resetSale} className="bo-tender bo-tender--primary" style={{ width: "100%", marginTop: 26 }}>
            <span className="bo-tender-label">New sale</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Manual entry ──────────────────────────────────────────────────────────
  if (showManual) {
    return (
      <div className="bo-root">
        <div className="bo-topbar">
          <button onClick={resetSale} className="bo-pill">← Back to the till</button>
          <span className="bo-sub">{selectedEvent?.title}</span>
        </div>
        <div className="bo-page" style={{ maxWidth: 520 }}>
          <div className="bo-glass">
            <div className="bo-eyebrow">This sale</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.72)", marginTop: 8 }}>
              {quantity}× {selectedTier?.tier_name || "GA"} @ {money(ticketPrice)} · {buyerName}
            </div>
          </div>
          {manualClientSecret ? (
            <div className="ic-form-wrap">
              <Elements stripe={stripePromise} options={{ clientSecret: manualClientSecret, appearance: stripeAppearance }}>
                <ManualPayForm
                  clientSecret={manualClientSecret}
                  paymentIntentId={manualPaymentIntentId}
                  buyerName={buyerName.trim()}
                  buyerEmail={buyerEmail.trim()}
                  buyerPhone={buyerPhone.trim()}
                  buyerZip={buyerZip.trim()}
                />
              </Elements>
            </div>
          ) : (
            <p className="bo-sub">Loading payment…</p>
          )}
        </div>
      </div>
    );
  }

  // ── The till ──────────────────────────────────────────────────────────────
  return (
    <div className="bo-root">
      <div className="bo-topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={isWest72 ? "/West72_Logos/W72_tech_wordmark_white.png" : "/VenueCore_Logos/VenueCore_Wordmark_White.png"} alt="" style={{ height: 18, objectFit: "contain" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="bo-sub">{staffName}</span>
          <button onClick={onSignOut} className="bo-pill" style={{ padding: "6px 12px", minHeight: 36, fontSize: 11 }}>Sign out</button>
        </div>
      </div>

      <div className="bo-page">

        {/* ── Reader bar ────────────────────────────────────────────────────
            Full width, top of page, always visible. It reported two states at
            12px squeezed between the logo and the sign-out button; every card
            sale depends on it and staff read it from arm's length. */}
        <div className={`bo-glass bo-readerbar ${readerOk ? "bo-glass--good" : terminalStatus === "no_readers" || terminalStatus === "error" ? "bo-glass--bad" : ""}`}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <span className={`bo-dot ${reader.dot}`} />
            <div style={{ minWidth: 0 }}>
              <div className="bo-reader-title" style={{ color: reader.tone }}>{reader.label}</div>
              <div className="bo-reader-sub">{readerIdentity}</div>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          {readerMeta.map((m) => (
            <div key={m.label} style={{ minWidth: 0 }}>
              <div className="bo-meta-label">{m.label}</div>
              <div className="bo-meta-value" style={{ color: m.tone }}>{m.value}</div>
            </div>
          ))}
          {(terminalStatus === "no_readers" || terminalStatus === "error") && (
            <button className="bo-pill bo-pill--bad" onClick={() => terminalRef.current && discoverReaders(terminalRef.current)}>Reconnect</button>
          )}
          {readers.length > 1 && terminalStatus === "ready" && (
            <span className="bo-note">{readers.length} readers at this location</span>
          )}
        </div>

        {formError && (
          <div className="bo-glass bo-glass--bad" style={{ padding: "12px 16px", borderRadius: 14, color: "#f87171", fontSize: 13 }}>{formError}</div>
        )}
        {terminalError && (
          <div className="bo-glass bo-glass--bad" style={{ padding: "12px 16px", borderRadius: 14, color: "#f87171", fontSize: 13 }}>Reader: {terminalError}</div>
        )}

        <div className="bo-cols">

          {/* ══ Column 1 — Sell at the door ══════════════════════════════════ */}
          <div className="bo-col">
            <div className="bo-glass">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <div className="bo-eyebrow">Sell at the door</div>
                <span style={{ flex: 1 }} />
              </div>

              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bo-field"
                style={{ marginTop: 12, appearance: "none", WebkitAppearance: "none" }}
                disabled={loadingEvents}
              >
                <option value="">{loadingEvents ? "Loading events…" : "— Select event —"}</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {isEventToday(e.date) ? "Tonight" : safeDate(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </option>
                ))}
              </select>

              {selectedEvent && (
                <div className="bo-sub" style={{ marginTop: 8 }}>
                  {door ? `${door.online.tickets} sold online · ${door.doorTickets} at the door · ${door.scannedIn} checked in` : "Loading tonight’s numbers…"}
                </div>
              )}

              {/* Tier tiles — 92px, price at 22px. The previous 11px list rows
                  were a form, and a form is the wrong shape for picking a
                  price with a queue in front of you. */}
              {selectedEventId && (
                <div className="bo-tiles" style={{ marginTop: 16 }}>
                  {loadingTiers && <div className="bo-sub">Loading tiers…</div>}
                  {!loadingTiers && tiers.length === 0 && selectedEvent && (
                    <button type="button" className="bo-tile" aria-pressed="true">
                      <span className="bo-tile-name">General admission</span>
                      <span style={{ flex: 1 }} />
                      <span className="bo-tile-price">{money(selectedEvent.price || 0)}</span>
                      <span className="bo-tile-avail">event price</span>
                    </button>
                  )}
                  {tiers.map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      className="bo-tile"
                      aria-pressed={selectedTierId === tier.id}
                      onClick={() => pickTier(tier.id)}
                    >
                      <span className="bo-tile-name">{tier.tier_name}</span>
                      <span style={{ flex: 1 }} />
                      <span className="bo-tile-price">{money(tier.price)}</span>
                      <span className="bo-tile-avail">
                        {tier.capacity != null ? `${Math.max(0, tier.capacity - (tier.sold ?? 0))} left` : " "}
                      </span>
                    </button>
                  ))}
                  {/* Comp is drawn because the mockup draws it, and disabled
                      because the manager-PIN gate it calls for does not exist
                      yet. An ungated comp button at a door is worse than none. */}
                  <button type="button" className="bo-tile" disabled title="Needs the manager PIN gate — not built">
                    <span className="bo-tile-name">Comp</span>
                    <span style={{ flex: 1 }} />
                    <span className="bo-tile-price">$0</span>
                    <span className="bo-tile-avail">manager PIN</span>
                  </button>
                </div>
              )}

              {/* Keypad — tapping "+" eight times with a line behind you is how
                  a party of nine becomes two orders of four. */}
              {selectedEventId && (
                <>
                  <div className="bo-keypad" style={{ marginTop: 16 }}>
                    {["1","2","3","4","5","6","7","8","9","C","0","⌫"].map((k) => (
                      <button
                        key={k}
                        type="button"
                        className={`bo-key ${k === "C" || k === "⌫" ? "bo-key--act" : ""}`}
                        onClick={() => pressKey(k)}
                      >{k}</button>
                    ))}
                  </div>
                  <div className="bo-note" style={{ marginTop: 12 }}>
                    Tap a tier to add one. Type a number first to add several at once.
                    {keyBuffer && <strong style={{ color: "#fff" }}> Pending: {keyBuffer}</strong>}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ══ Column 2 — This sale ═════════════════════════════════════════ */}
          <div className="bo-col">
            <div className="bo-glass bo-glass--lift">
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div className="bo-eyebrow">This sale</div>
                <span style={{ flex: 1 }} />
                <button type="button" onClick={resetSale} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.44)", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Clear</button>
              </div>

              {/* Cart. One line, because an order carries a single tier and
                  quantity — there is no line-item table, so a mixed basket
                  cannot be charged as one payment. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {selectedEventId && ticketPrice >= 0 ? (
                  <div className="bo-cartline">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {selectedTier?.tier_name || "General admission"}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.42)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{money(ticketPrice)} each</div>
                    </div>
                    <div className="bo-stepper">
                      <button type="button" className="bo-step" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>−</button>
                      <span style={{ width: 26, textAlign: "center", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{quantity}</span>
                      <button type="button" className="bo-step" onClick={() => setQuantity(Math.min(20, quantity + 1))} disabled={quantity >= 20}>+</button>
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: "tabular-nums", width: 70, textAlign: "right" }}>{money(faceValue)}</div>
                  </div>
                ) : (
                  <div className="bo-note">Pick an event and a tier to start a sale.</div>
                )}
              </div>

              {/* Totals. Face value is exact; the fee lines are named rather
                  than guessed at — the authoritative figures come back from
                  /api/terminal/payment-intent, which prices card-present at
                  its own rate. Printing a number here that the reader then
                  contradicts is worse than saying where it is computed. */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
                <div className="bo-totalrow">
                  <span className="lbl">Face value</span>
                  <span className="basis">{quantity} ticket{quantity === 1 ? "" : "s"}</span>
                  <span className="val">{money(faceValue)}</span>
                </div>
                <div className="bo-totalrow">
                  <span className="lbl">Service &amp; facility</span>
                  <span className="basis">{saleType === "cash" ? "cash: none" : "at payment"}</span>
                  <span className="val" style={{ color: "rgba(255,255,255,0.44)" }}>{saleType === "cash" ? money(0) : "—"}</span>
                </div>
                <div className="bo-totalrow">
                  <span className="lbl">Card processing</span>
                  <span className="basis">{saleType === "cash" ? "cash: none" : "2.7% + 5¢"}</span>
                  <span className="val" style={{ color: "rgba(255,255,255,0.70)" }}>{saleType === "cash" ? money(0) : "—"}</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 16, paddingTop: 15, borderTop: "1px solid rgba(255,255,255,0.14)" }}>
                <span className="bo-due-label">{saleType === "cash" ? "Collect" : "Amount due"}</span>
                <span className="bo-due-value">{money(faceValue)}</span>
              </div>
              {saleType === "card" && (
                <div className="bo-note" style={{ marginTop: 6 }}>Fees and tax are added at payment — the reader shows the final figure.</div>
              )}

              {/* Buyer. Name only; email is a receipt, not the entry pass. */}
              {selectedEventId && (
                <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div>
                    <label className="bo-label">Buyer name *</label>
                    <input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Full name" className="bo-field" />
                  </div>
                  {saleType === "card" && (
                    <>
                      <div>
                        <label className="bo-label">Email <span style={{ letterSpacing: 0, textTransform: "none", opacity: 0.6, fontWeight: 400 }}>(optional — receipt only)</span></label>
                        <input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="email@example.com" className="bo-field" />
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <label className="bo-label">Phone</label>
                          <input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))} placeholder="(555) 555-1234" className="bo-field" />
                        </div>
                        <div style={{ width: 110 }}>
                          <label className="bo-label">ZIP</label>
                          <input type="text" inputMode="numeric" value={buyerZip} onChange={(e) => setBuyerZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="35630" autoComplete="postal-code" className="bo-field" />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Tenders carry their cost. The difference between these is real
                  money — card carries service, facility, tax and a 2.7% + 5¢
                  card-present surcharge; cash carries none and the face value
                  IS the money. Staff make that choice dozens of times a night. */}
              {selectedEventId && (
                <div className="bo-tenders" style={{ marginTop: 18 }}>
                  <button
                    type="button"
                    className={`bo-tender ${saleType === "card" ? "bo-tender--primary" : ""}`}
                    onClick={() => { setSaleType("card"); setFormError(null); }}
                  >
                    <div className="bo-tender-label">Card</div>
                    <div className="bo-tender-note">{terminalStatus === "ready" ? "on the reader" : "reader offline"}</div>
                  </button>
                  <button
                    type="button"
                    className={`bo-tender ${saleType === "cash" ? "bo-tender--primary" : ""}`}
                    onClick={() => { setSaleType("cash"); setFormError(null); }}
                  >
                    <div className="bo-tender-label">Cash</div>
                    <div className="bo-tender-note">no fees</div>
                  </button>
                  <button type="button" className="bo-tender bo-tender--muted" disabled title="Needs the manager PIN gate — not built">
                    <div className="bo-tender-label">Comp</div>
                    <div className="bo-tender-note">PIN required</div>
                  </button>
                </div>
              )}

              {/* Take the money. */}
              {selectedEventId && (
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 14 }}>
                  {saleType === "card" ? (
                    <>
                      <button
                        type="button"
                        onClick={handleTerminalPay}
                        disabled={terminalStatus !== "ready" || !buyerName.trim()}
                        className="bo-tender bo-tender--primary"
                        style={{ minHeight: 56 }}
                      >
                        <span className="bo-tender-label" style={{ fontSize: 15 }}>
                          {terminalStatus === "collecting" ? "Waiting for tap…"
                            : terminalStatus === "processing" ? "Processing…"
                            : terminalStatus === "ready" ? `Charge ${money(faceValue)} on the reader`
                            : terminalStatus === "connecting" ? "Connecting to reader…"
                            : terminalStatus === "discovering" ? "Looking for the reader…"
                            : "Reader not connected"}
                        </span>
                      </button>
                      <button type="button" onClick={handleManualPay} disabled={!buyerName.trim() || creatingManualIntent} className="bo-pill" style={{ justifyContent: "center", width: "100%" }}>
                        {creatingManualIntent ? "Loading…" : "Manual card entry"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleCashSale}
                      disabled={cashSubmitting || !buyerName.trim()}
                      className="bo-tender bo-tender--primary"
                      style={{ minHeight: 56 }}
                    >
                      <span className="bo-tender-label" style={{ fontSize: 15 }}>{cashSubmitting ? "Recording…" : `Take ${money(faceValue)} cash`}</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ── Payment progression ────────────────────────────────────────
                A checklist, not a spinner. When a card sale stalls, staff need
                to know WHERE — an intent that never reached the reader is a
                different problem from a customer who has not tapped. */}
            {payStage && (
              <div className="bo-glass bo-glass--good">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="bo-dot" style={{ width: 8, height: 8 }} />
                  <div className="bo-eyebrow" style={{ color: "#8fd6a8" }}>
                    {payStage === "issued" ? "Done" : payStage === "waiting" ? "Waiting for card" : "Taking payment"}
                  </div>
                  <span style={{ flex: 1 }} />
                  <div style={{ fontSize: 10.5, color: payElapsed > 40 ? "#fbbf24" : "rgba(255,255,255,0.46)", fontVariantNumeric: "tabular-nums" }}>
                    {String(Math.floor(payElapsed / 60)).padStart(2, "0")}:{String(payElapsed % 60).padStart(2, "0")}
                  </div>
                </div>
                <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 12, textWrap: "pretty" }}>
                  {payStage === "waiting"
                    ? `Present card on the ${connectedReader?.device_type === "stripe_s700" ? "S700" : "reader"} — tap, insert or swipe`
                    : payStage === "issued" ? "Ticket issued and checked in"
                    : "Working…"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 16 }}>
                  {PAY_STEPS.map((step, i) => {
                    const done = i < payStepIndex;
                    const now = i === payStepIndex;
                    return (
                      <div key={step.key} className="bo-paystep">
                        <span className={`bo-paydot ${done ? "bo-paydot--done" : now ? "bo-paydot--now" : ""}`}>{done ? "✓" : ""}</span>
                        <span className={`bo-paylabel ${done ? "bo-paylabel--done" : now ? "bo-paylabel--now" : ""}`}>{step.label}</span>
                        <span className="bo-paymeta">{done || now ? step.meta : ""}</span>
                      </div>
                    );
                  })}
                </div>
                {payElapsed > 40 && payStage === "waiting" && (
                  <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 10 }}>Still waiting on the customer. Cancel and retry, or take it manually.</div>
                )}
                {payStage !== "issued" && (
                  <div style={{ display: "flex", gap: 9, marginTop: 17 }}>
                    <button type="button" onClick={cancelTerminalPay} className="bo-pill" style={{ flex: 1, justifyContent: "center" }}>Cancel payment</button>
                    <button type="button" onClick={async () => { await cancelTerminalPay(); handleManualPay(); }} className="bo-pill">Enter manually</button>
                  </div>
                )}
                <div className="bo-note" style={{ marginTop: 13 }}>
                  Card-present runs at 2.7% + 5¢, not the online rate. Cash carries no fee, no tax and no surcharge — the face value is the money.
                </div>
              </div>
            )}

            {issueWarning && !cardDone && (
              <div className="bo-glass bo-glass--warn" style={{ color: "#fbbf24", fontSize: 13, lineHeight: 1.5 }}>{issueWarning}</div>
            )}
          </div>

          {/* ══ Column 3 — Tonight ═══════════════════════════════════════════ */}
          <div className="bo-col">
            <div className="bo-glass">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="bo-eyebrow">Tonight at the door</div>
                <span className="bo-dot" style={{ width: 6, height: 6, boxShadow: "0 0 8px #8fd6a8" }} />
              </div>
              <div className="bo-kpis" style={{ marginTop: 15 }}>
                {[
                  { label: "Door sales", value: door ? money(door.doorTotal) : "—", tone: "#8fd6a8" },
                  { label: "Sold at door", value: door ? String(door.doorTickets) : "—", tone: "#fff" },
                  { label: "Checked in", value: door ? String(door.scannedIn) : "—", tone: "#fff" },
                  { label: "Cash taken", value: door ? money(door.cash.amount) : "—", tone: "#fff" },
                ].map((k) => (
                  <div key={k.label} className="bo-kpi">
                    <div className="bo-kpi-label">{k.label}</div>
                    <div className="bo-kpi-value" style={{ color: k.tone }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {door && door.recent.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 15 }}>
                  {door.recent.map((r) => (
                    <div key={r.id} className={`bo-feedrow bo-feedrow--${r.tender}`}>
                      <div className="bo-feed-time">{clock(r.at)}</div>
                      <div className="bo-feed-what">{r.quantity} × {r.name}</div>
                      <div className="bo-feed-how" style={{ color: r.tender === "card" ? "#8fd6a8" : r.tender === "cash" ? "rgba(255,255,255,0.70)" : "rgba(255,255,255,0.44)" }}>{r.tender}</div>
                      <div className="bo-feed-amount">{money(r.amount)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comps & guest list — read-only. Issuing one needs the manager
                PIN gate that does not exist yet; showing who is on the list is
                what the door actually asks for at 7:55. */}
            <div className="bo-glass">
              <div className="bo-eyebrow">Comps &amp; guest list</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
                {guests.length === 0 && <div className="bo-note">Nobody on the guest list for this show.</div>}
                {guests.map((g) => {
                  const name = [g.first_name, g.last_name].filter(Boolean).join(" ").trim();
                  const inAt = g.checked_in_at;
                  return (
                    <div key={g.id} className="bo-listrow">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {name || "Unnamed guest"}
                        </div>
                        <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.34)" }}>
                          {inAt ? `In at ${clock(inAt)}` : g.notes || "on the list"}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, fontVariantNumeric: "tabular-nums", flex: "none" }}>+{g.quantity ?? 1}</div>
                      {/* Marking someone in is the point of showing the list at
                          the door. Without it a comp looks identical before and
                          after they walk through, and "18 on the list" never
                          becomes "11 of them came" — which is the number that
                          reconciles against a headcount. */}
                      <button
                        type="button"
                        className={`bo-pill ${inAt ? "" : "bo-pill--checkin"}`}
                        style={{ minHeight: 38, padding: "0 13px", fontSize: 11, flex: "none" }}
                        disabled={checkingIn === g.id}
                        onClick={() => toggleGuest(g.id, !inAt)}
                        title={inAt ? "Checked in — tap to undo" : "Mark this guest as arrived"}
                      >
                        {checkingIn === g.id ? "…" : inAt ? "✓ In" : "Check in"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {guests.length > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)", fontSize: 12 }}>
                  <span style={{ fontWeight: 650 }}>Arrived</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>
                    {guests.filter((g) => g.checked_in_at).reduce((t, g) => t + (g.quantity ?? 1), 0)}
                    {" of "}
                    {guests.reduce((t, g) => t + (g.quantity ?? 1), 0)}
                  </span>
                </div>
              )}
            </div>

            {/* Drawer & reconcile. Card and cash come from the door endpoint;
                the count is typed by whoever is holding the drawer. It is NOT
                persisted — there is no drawer table — so the note says so
                rather than letting a number that vanishes on reload look
                filed. Close night → settlement is not built. */}
            <div className="bo-glass">
              <div className="bo-eyebrow">Drawer &amp; reconcile</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                <div className="bo-drawerrow"><span className="lbl">Card sales</span><span className="val">{door ? money(door.card.amount) : "—"}</span></div>
                <div className="bo-drawerrow"><span className="lbl">Cash sales</span><span className="val">{door ? money(door.cash.amount) : "—"}</span></div>
                <div className="bo-drawerrow"><span className="lbl">Online presale</span><span className="val">{door ? money(door.online.amount) : "—"}</span></div>
                <div>
                  <label className="bo-label">Counted in drawer</label>
                  <input type="text" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" className="bo-field" />
                </div>
                {overShort !== null && (
                  <div className="bo-drawerrow bo-drawerrow--total">
                    <span className="lbl">Over / short</span>
                    <span className="val" style={{ color: overShort === 0 ? "#8fd6a8" : "#fbbf24" }}>
                      {overShort < 0 ? "−" : overShort > 0 ? "+" : ""}{money(Math.abs(overShort))}
                    </span>
                  </div>
                )}
              </div>
              <div className="bo-note" style={{ marginTop: 12 }}>
                The count is worked out on this screen and is not saved — there is no drawer record yet. Write it down before you close the page.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

export default function BoxOfficePage() {
  const [authState, setAuthState] = useState<"loading" | "login" | "ready">("loading");
  const [staffName, setStaffName] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(async ({ data }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      if (!data?.user) { setAuthState("login"); return; }
      const { data: adminRecord } = await supabase.from("admin_users").select("role, first_name").eq("id", data.user.id).single();
      if (!adminRecord || !ALLOWED_ROLES.includes(adminRecord.role)) { await supabase.auth.signOut(); setAuthState("login"); return; }
      const name = adminRecord.first_name || data.user.email?.split("@")[0] || "Staff";
      setStaffName(name.charAt(0).toUpperCase() + name.slice(1));
      setAuthState("ready");
    });
  }, []);

  const handleSignOut = async () => {
    await getSupabaseBrowser().auth.signOut();
    setStaffName(""); setAuthState("login");
  };

  if (authState === "loading") {
    return <div className="bo-root" style={{ display: "grid", placeItems: "center" }}><span className="bo-sub">Loading…</span></div>;
  }
  if (authState === "login") {
    return <LoginScreen onSuccess={(name) => { setStaffName(name); setAuthState("ready"); }} />;
  }
  return (
    <Suspense fallback={<div className="bo-root" style={{ display: "grid", placeItems: "center" }}><span className="bo-sub">Loading…</span></div>}>
      <BoxOfficeContent staffName={staffName} onSignOut={handleSignOut} />
    </Suspense>
  );
}
