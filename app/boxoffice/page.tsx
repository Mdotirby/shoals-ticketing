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

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
const ALLOWED_ROLES = ["owner", "venue_admin", "box_office"];

type EventOption  = { id: string; title: string; date: string; price: number; event_type: string };
type TierOption   = { id: string; tier_name: string; price: number };
type PaymentMode  = "idle" | "terminal" | "manual";
/**
 * The reader's real states, not a proxy for them.
 *
 * This used to collapse the Terminal SDK's lifecycle into "ready" and
 * "collecting". A dot that is green whenever the page has loaded is worse than
 * no dot: staff learn to ignore it, and the first time they find out the
 * reader dropped is with a customer's card already in their hand. Each of
 * these maps to something the SDK actually told us.
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
type SaleType = "card" | "cash";

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

  const field: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: 8,
    border: "1px solid rgba(208,194,144,0.2)", background: "rgba(255,255,255,0.05)",
    color: "#fff", fontSize: 16, boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--vc-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", fontFamily: "var(--font-urbanist), 'Helvetica Neue', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={isWest72 ? "/West72_Logos/W72_tech_wordmark_white.png" : "/VenueCore_Logos/VenueCore_Wordmark_White.png"} alt={isWest72 ? "West72" : "VenueCore"} style={{ height: 26, objectFit: "contain", marginBottom: 20 }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--vc-gold)", margin: "0 0 6px", letterSpacing: "-0.02em" }}>Box Office</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>Sign in to process walk-up sales</p>
        </div>
        <form onSubmit={handleLogin} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "28px 24px", boxShadow: "0 4px 32px rgba(0,0,0,0.4)" }}>
          {error && <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13, marginBottom: 18 }}>{error}</div>}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@venue.com" required autoComplete="email" style={field} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required autoComplete="current-password" style={field} />
          </div>
          <button type="submit" disabled={loading || !email || !password} style={{ width: "100%", padding: "14px 20px", borderRadius: 10, border: "none", background: loading || !email || !password ? "rgba(208,194,144,0.2)" : "var(--vc-gold)", color: loading || !email || !password ? "rgba(255,255,255,0.3)" : "#0b0a08", fontSize: 15, fontWeight: 700, cursor: loading || !email || !password ? "not-allowed" : "pointer" }}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Manual card entry payment form (raw Elements + PaymentIntent) ─────────────
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
  // Form state
  const [events, setEvents]               = useState<EventOption[]>([]);
  const [tiers, setTiers]                 = useState<TierOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedTierId, setSelectedTierId]   = useState("");
  const [quantity, setQuantity]           = useState(1);
  const [buyerName, setBuyerName]         = useState("");
  const [buyerEmail, setBuyerEmail]       = useState("");
  const [buyerPhone, setBuyerPhone]       = useState("");
  const [buyerZip, setBuyerZip]           = useState("");
  const [formError, setFormError]         = useState<string | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingTiers, setLoadingTiers]   = useState(false);

  // Cash sale — no Stripe, no webhook, recorded directly. Only a name is
  // required (no email, no phone) since cash tickets are auto-checked-in
  // and there's no confirmation email to send.
  const [saleType, setSaleType]           = useState<SaleType>("card");
  const [cashFirstName, setCashFirstName] = useState("");
  const [cashLastName, setCashLastName]   = useState("");
  const [cashSubmitting, setCashSubmitting] = useState(false);
  const [cashSuccess, setCashSuccess]     = useState<{ name: string; quantity: number } | null>(null);

  // Terminal state
  const terminalRef               = useRef<Terminal | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>("init");
  const [readers, setReaders]     = useState<Reader[]>([]);
  const [connectedReader, setConnectedReader] = useState<Reader | null>(null);
  const [terminalError, setTerminalError]     = useState("");
  const [paymentMode, setPaymentMode]         = useState<PaymentMode>("idle");

  // Payment progression + the live timer beside it. A door sale that has been
  // "waiting for tap" for 40 seconds is a stuck sale, and the only way staff
  // can tell is by being shown how long it has been.
  const [payStage, setPayStage]     = useState<PayStage>(null);
  const [payElapsed, setPayElapsed] = useState(0);
  const [issueWarning, setIssueWarning] = useState("");

  // Tonight's drawer.
  const [door, setDoor] = useState<DoorTotals | null>(null);

  // Manual card-entry fallback (raw Elements + PaymentIntent)
  const [showManual, setShowManual] = useState(false);
  const [creatingManualIntent, setCreatingManualIntent] = useState(false);
  const [manualClientSecret, setManualClientSecret] = useState("");
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
          return json.secret as string;
        },
        onUnexpectedReaderDisconnect: () => {
          setConnectedReader(null);
          setTerminalStatus("no_readers");
          setTerminalError("Reader disconnected. Tap 'Find Reader' to reconnect.");
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
    // Auto-connect to the first available reader
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
        // Arm the reader on tonight's show without staff touching the dropdown.
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
      .then((data: TierOption[]) => { setTiers(data || []); if (data?.length === 1) setSelectedTierId(data[0].id); else setSelectedTierId(""); })
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

  // Tonight's drawer. Refreshed on event change and after every completed sale
  // — the number staff reconcile against has to include the one they just took.
  const refreshDoor = useCallback(async () => {
    if (!selectedEventId) { setDoor(null); return; }
    try {
      const r = await fetch(`/api/box-office/tonight?event_id=${selectedEventId}`);
      if (r.ok) setDoor(await r.json());
    } catch { /* the totals strip is informational; never block a sale on it */ }
  }, [selectedEventId]);

  useEffect(() => { refreshDoor(); }, [refreshDoor]);
  useEffect(() => {
    if (payStage === "issued" || cashSuccess) refreshDoor();
  }, [payStage, cashSuccess, refreshDoor]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const selectedTier  = tiers.find((t) => t.id === selectedTierId);
  const ticketPrice   = selectedTier?.price ?? selectedEvent?.price ?? 0;

  // ── Validate form ─────────────────────────────────────────────────────────
  // Email is OPTIONAL, matching the cash path beside it. Requiring one meant a
  // walk-up who did not want to give an address could not be sold a card
  // ticket at all — and in practice staff type junk to get past the field,
  // which is worse than no address. The buyer walks in on the spot (door sales
  // are checked in on issue), so the email is a receipt, not the entry pass.
  const validateForm = () => {
    if (!selectedEventId) { setFormError("Please select an event"); return false; }
    if (!buyerName.trim()) { setFormError("Buyer name is required"); return false; }
    setFormError(null);
    return true;
  };

  // ── Terminal payment ──────────────────────────────────────────────────────
  /**
   * Cancel a payment that is sitting on the reader.
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
      await confirmIssued(intentData.paymentIntentId);
    } catch (err: unknown) {
      setTerminalError(err instanceof Error ? err.message : "Payment failed");
      setTerminalStatus("ready");
      setPaymentMode("idle");
      setPayStage(null);
    }
  };

  // ── Manual entry fallback (raw Elements + PaymentIntent) ──────────────────
  // source: "box_office" keeps these on their own line in settlement/ticket-
  // audit reporting instead of folding into "inline_checkout" — see the
  // comment on create-intent's `source` param.
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
      if (!res.ok) {
        setFormError(data.error || "Failed to start checkout");
        return;
      }
      setManualClientSecret(data.clientSecret);
      setManualPaymentIntentId(data.paymentIntentId ?? "");
      setShowManual(true);
    } catch {
      setFormError("Failed to start checkout. Please try again.");
    } finally {
      setCreatingManualIntent(false);
    }
  };

  // ── Cash sale ──────────────────────────────────────────────────────────────
  const handleCashSale = async () => {
    if (!selectedEventId) { setFormError("Please select an event"); return; }
    if (!cashFirstName.trim() || !cashLastName.trim()) {
      setFormError("First and last name are required");
      return;
    }
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
          buyer_first_name: cashFirstName.trim(),
          buyer_last_name: cashLastName.trim(),
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

  const resetSale = () => {
    setShowManual(false); setPaymentMode("idle");
    setBuyerName(""); setBuyerEmail(""); setBuyerPhone(""); setBuyerZip("");
    setCashFirstName(""); setCashLastName(""); setCashSuccess(null);
    setQuantity(1); setSelectedTierId(""); setFormError(null); setTerminalError("");
    setManualClientSecret(""); setManualPaymentIntentId("");
    setPayStage(null); setPayElapsed(0); setIssueWarning("");
    if (terminalStatus === "success") setTerminalStatus("ready");
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const fieldStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(208,194,144,0.2)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16, boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" };

  // ── Reader status ─────────────────────────────────────────────────────────
  // Amber while discovering or connecting, red on disconnect with a Reconnect
  // action, mint ONLY when genuinely connected. `glow` is what makes the dot
  // readable across a dark room at arm's length.
  const READER_STATES: Record<TerminalStatus, { color: string; label: string; glow: boolean }> = {
    init:        { color: "rgba(255,255,255,0.35)", label: "Starting reader…",        glow: false },
    discovering: { color: "#fbbf24", label: "Looking for the reader…",                glow: false },
    no_readers:  { color: "#f87171", label: "No reader — card sales unavailable",     glow: true  },
    connecting:  { color: "#fbbf24", label: "Connecting to reader…",                  glow: false },
    ready:       { color: "#8fd6a8", label: "Connected to reader",                    glow: true  },
    collecting:  { color: "#60a5fa", label: "Waiting for the customer to tap",        glow: true  },
    processing:  { color: "#60a5fa", label: "Processing payment…",                    glow: true  },
    success:     { color: "#8fd6a8", label: "Payment accepted",                       glow: true  },
    error:       { color: "#f87171", label: "Reader error",                           glow: true  },
  };
  const readerDot = READER_STATES[terminalStatus];

  // The reader's identity, beneath the light. Staff at a venue with more than
  // one reader need to know WHICH one is armed before they send a payment to it.
  const readerIdentity = connectedReader
    ? [
        connectedReader.device_type === "stripe_s700" ? "Stripe Reader S700" : connectedReader.device_type,
        connectedReader.label ? `"${connectedReader.label}"` : null,
        "tap, chip & swipe ready",
      ].filter(Boolean).join(" · ")
    : null;

  // ── Payment progression ───────────────────────────────────────────────────
  const PAY_STEPS: { key: Exclude<PayStage, null>; label: string }[] = [
    { key: "intent",     label: "Payment created" },
    { key: "sent",       label: "Sent to reader" },
    { key: "waiting",    label: "Waiting for the customer" },
    { key: "processing", label: "Processing" },
    { key: "issued",     label: "Ticket issued & checked in" },
  ];
  const payStepIndex = payStage ? PAY_STEPS.findIndex((s) => s.key === payStage) : -1;

  // ── Success screen ────────────────────────────────────────────────────────
  // NOT shown the instant the reader approves. "Approved" means Stripe took
  // the money; the ticket is written by the webhook a beat later. Showing
  // "Payment Complete" before the ticket exists is how a failed webhook
  // becomes invisible at the door — so this waits for the ticket to be
  // confirmed, or for the confirmation to give up and say so. Until then the
  // progression checklist stays on screen with its timer running.
  if (terminalStatus === "success" && (payStage === "issued" || issueWarning)) {
    const ok = payStage === "issued";
    return (
      <div style={{ minHeight: "100vh", background: "var(--vc-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "var(--font-urbanist), sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{ok ? "✓" : "!"}</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: ok ? "#8fd6a8" : "#fbbf24", margin: "0 0 8px" }}>
          {ok ? "Paid — let them in" : "Paid, needs a look"}
        </h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 8, maxWidth: 340, lineHeight: 1.5 }}>
          {quantity} ticket{quantity === 1 ? "" : "s"} for {buyerName} — already checked in, no scan needed at the door.
        </p>
        {buyerEmail.trim() && (
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 0 }}>
            Confirmation sent to {buyerEmail.trim()}.
          </p>
        )}
        {issueWarning && (
          <p style={{ color: "#fbbf24", fontSize: 13, margin: "16px 0 0", maxWidth: 340, lineHeight: 1.5 }}>{issueWarning}</p>
        )}
        <button onClick={resetSale} style={{ marginTop: 32, minHeight: 56, padding: "13px 40px", borderRadius: 12, border: "none", background: "var(--vc-gold)", color: "#0b0a08", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
          New Sale
        </button>
      </div>
    );
  }

  // ── Cash sale success screen ──────────────────────────────────────────────
  if (cashSuccess) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--vc-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "var(--font-urbanist), sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "#4ade80", margin: "0 0 8px" }}>Cash Sale Recorded</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 32 }}>
          {cashSuccess.quantity} ticket{cashSuccess.quantity === 1 ? "" : "s"} for {cashSuccess.name} — already checked in, no scan needed at the door.
        </p>
        <button onClick={resetSale} style={{ padding: "13px 32px", borderRadius: 10, border: "none", background: "var(--vc-gold)", color: "#0b0a08", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          New Sale
        </button>
      </div>
    );
  }

  // ── Manual entry (raw Elements + PaymentIntent) ───────────────────────────
  if (showManual) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--vc-bg)", fontFamily: "var(--font-urbanist), sans-serif" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(208,194,144,0.1)" }}>
          <button onClick={resetSale} style={{ background: "transparent", border: "1px solid rgba(208,194,144,0.3)", color: "var(--vc-gold)", padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>← Back</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ background: "rgba(208,194,144,0.06)", border: "1px solid rgba(208,194,144,0.15)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
            <strong style={{ color: "var(--vc-gold)" }}>{selectedEvent?.title}</strong>
            <span style={{ margin: "0 8px" }}>·</span>{quantity}× {selectedTier?.tier_name || "GA"} @ ${ticketPrice.toFixed(2)}
            <span style={{ margin: "0 8px" }}>·</span>{buyerName}
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
            <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading payment…</p>
          )}
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "var(--vc-bg)", color: "#fff", fontFamily: "var(--font-urbanist), 'Helvetica Neue', sans-serif" }}>

      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 20px", borderBottom: "1px solid rgba(208,194,144,0.1)", background: "rgba(255,255,255,0.02)", position: "sticky", top: 0, zIndex: 10 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={isWest72 ? "/West72_Logos/W72_tech_wordmark_white.png" : "/VenueCore_Logos/VenueCore_Wordmark_White.png"} alt="" style={{ height: 20, objectFit: "contain" }} />
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{staffName}</span>
          <button onClick={onSignOut} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", padding: "4px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>Out</button>
        </div>
      </div>

      {/* ── Reader state — full width, always visible ──────────────────────────
          It used to sit squeezed between the logo and the sign-out button at
          12px. The reader's state is the single most important thing on this
          screen: every card sale depends on it, and staff need to read it from
          arm's length in a dark room. */}
      <div style={{
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: terminalStatus === "no_readers" ? "rgba(248,113,113,0.08)"
          : terminalStatus === "ready" ? "rgba(143,214,168,0.07)"
          : "rgba(255,255,255,0.02)",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <span style={{
          width: 10, height: 10, borderRadius: "50%", background: readerDot.color, flexShrink: 0,
          boxShadow: readerDot.glow
            ? `0 0 12px ${readerDot.color}, 0 0 24px ${readerDot.color}80`
            : "none",
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: readerDot.color, letterSpacing: "-0.01em" }}>
            {readerDot.label}
          </div>
          {readerIdentity && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {readerIdentity}
            </div>
          )}
          {terminalStatus === "no_readers" && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>
              Cash sales still work. Manual card entry still works.
            </div>
          )}
        </div>
        {(terminalStatus === "no_readers" || terminalStatus === "error") && (
          <button
            onClick={() => terminalRef.current && discoverReaders(terminalRef.current)}
            style={{ minHeight: 44, padding: "0 16px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.4)", background: "rgba(248,113,113,0.12)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
          >
            Reconnect
          </button>
        )}
      </div>

      {/* ── Tonight's door ─────────────────────────────────────────────────── */}
      {door && (
        <div style={{ display: "flex", gap: 1, background: "rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { label: "Card", value: `$${door.card.amount.toFixed(2)}`, sub: `${door.card.tickets} tix` },
            { label: "Cash", value: `$${door.cash.amount.toFixed(2)}`, sub: `${door.cash.tickets} tix` },
            { label: "Door total", value: `$${door.doorTotal.toFixed(2)}`, sub: `${door.doorTickets} tix` },
            { label: "Checked in", value: String(door.scannedIn), sub: `of ${door.ticketsIssued}` },
          ].map((c) => (
            <div key={c.label} style={{ flex: 1, background: "var(--vc-bg)", padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{c.label}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginTop: 2, letterSpacing: "-0.02em" }}>{c.value}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "20px 16px 60px", maxWidth: 480, margin: "0 auto" }}>

        <h1 style={{ fontSize: 18, fontWeight: 800, color: "var(--vc-gold)", margin: "0 0 20px", letterSpacing: "-0.01em" }}>New Sale</h1>

        {formError && <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>{formError}</div>}
        {terminalError && <div style={{ background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 8, padding: "10px 14px", color: "#ff6b6b", fontSize: 13, marginBottom: 16 }}>Reader: {terminalError}</div>}

        {/* Event */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Event</label>
          {loadingEvents ? <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading…</div> : (
            <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} style={{ ...fieldStyle, appearance: "none", WebkitAppearance: "none" }}>
              <option value="">— Select event —</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} — {isEventToday(e.date) ? "Tonight" : safeDate(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Tiers */}
        {selectedEventId && tiers.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Ticket Type</label>
            {loadingTiers ? <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading…</div> : (
              /* Tiles, not list rows. 92px tall with the price at 22px, because
                 this is a till operated at speed with a queue in front of it —
                 the previous 11px rows were a form, and a form is the wrong
                 shape for picking a price under pressure. */
              <div style={{ display: "grid", gridTemplateColumns: tiers.length > 1 ? "1fr 1fr" : "1fr", gap: 8 }}>
                {tiers.map((tier) => {
                  const on = selectedTierId === tier.id;
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setSelectedTierId(tier.id)}
                      style={{
                        minHeight: 92, padding: "12px 14px", borderRadius: 12,
                        border: `1.5px solid ${on ? "var(--vc-gold)" : "rgba(255,255,255,0.1)"}`,
                        background: on ? "rgba(208,194,144,0.14)" : "rgba(255,255,255,0.03)",
                        color: on ? "var(--vc-gold)" : "rgba(255,255,255,0.75)",
                        cursor: "pointer", display: "flex", flexDirection: "column",
                        justifyContent: "space-between", alignItems: "flex-start", textAlign: "left",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{tier.tier_name}</span>
                      <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>${tier.price.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Quantity */}
        {selectedEventId && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Quantity</label>
            {/* Stepper for one or two, keypad for a group of nine. Tapping "+"
                eight times with a line behind you is the kind of thing that
                makes staff give up and sell two orders of four. */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))}
                style={{ width: 52, height: 52, borderRadius: 12, border: "1px solid rgba(208,194,144,0.25)", background: "rgba(255,255,255,0.05)", color: "var(--vc-gold)", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <span style={{ fontSize: 30, fontWeight: 800, minWidth: 48, textAlign: "center", letterSpacing: "-0.02em" }}>{quantity}</span>
              <button type="button" onClick={() => setQuantity(Math.min(20, quantity + 1))}
                style={{ width: 52, height: 52, borderRadius: 12, border: "1px solid rgba(208,194,144,0.25)", background: "rgba(255,255,255,0.05)", color: "var(--vc-gold)", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 20].map((n) => (
                <button key={n} type="button" onClick={() => setQuantity(n)}
                  style={{
                    minHeight: 44, borderRadius: 10,
                    border: `1px solid ${quantity === n ? "var(--vc-gold)" : "rgba(255,255,255,0.08)"}`,
                    background: quantity === n ? "rgba(208,194,144,0.14)" : "rgba(255,255,255,0.03)",
                    color: quantity === n ? "var(--vc-gold)" : "rgba(255,255,255,0.55)",
                    fontSize: 16, fontWeight: 700, cursor: "pointer",
                  }}>{n}</button>
              ))}
            </div>
          </div>
        )}

        {selectedEventId && <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "18px 0" }} />}

        {/* Sale type */}
        {selectedEventId && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Payment</label>
            {/* The tender buttons name their cost. The difference between these
                two is real money — a card sale carries the service fee, the
                facility fee, tax and a 2.7% + $0.05 card-present surcharge;
                cash carries none of them and the face value IS the money. Door
                staff make that choice dozens of times a night and should not
                have to have been told once in training what it means. */}
            <div style={{ display: "flex", gap: 8 }}>
              {([
                { key: "card" as const, label: "Card", cost: terminalStatus === "ready" ? "on the reader" : "reader offline" },
                { key: "cash" as const, label: "Cash", cost: "no fees" },
              ]).map((t) => {
                const on = saleType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { setSaleType(t.key); setFormError(null); }}
                    style={{
                      flex: 1, minHeight: 60, padding: "10px 14px", borderRadius: 12,
                      border: `1.5px solid ${on ? "var(--vc-gold)" : "rgba(255,255,255,0.1)"}`,
                      background: on ? "rgba(208,194,144,0.14)" : "rgba(255,255,255,0.03)",
                      color: on ? "var(--vc-gold)" : "rgba(255,255,255,0.6)",
                      cursor: "pointer", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", gap: 2,
                    }}
                  >
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{t.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.7 }}>{t.cost}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Buyer info — card */}
        {selectedEventId && saleType === "card" && (
          <>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Buyer Name *</label><input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Full name" style={fieldStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Email <span style={{ fontWeight: 400, opacity: 0.55, textTransform: "none", letterSpacing: 0 }}>(optional — receipt only)</span></label><input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="email@example.com" style={fieldStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Phone</label><input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))} placeholder="(555) 555-1234" style={fieldStyle} /></div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>ZIP Code <span style={{ fontWeight: 400, opacity: 0.55, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input type="text" inputMode="numeric" value={buyerZip} onChange={(e) => setBuyerZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="35630" autoComplete="postal-code" style={fieldStyle} />
            </div>

            {/* Amount due — the number the customer is about to be charged, at
                the size you can read while handing over a card. */}
            {ticketPrice > 0 && (
              <div style={{ background: "rgba(208,194,144,0.06)", border: "1px solid rgba(208,194,144,0.12)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Amount due</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{quantity}× ${ticketPrice.toFixed(2)} {selectedTier?.tier_name ? `· ${selectedTier.tier_name}` : ""}</div>
                  </div>
                  <div style={{ fontSize: 38, fontWeight: 800, color: "var(--vc-gold)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                    ${(ticketPrice * quantity).toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>+ fees &amp; tax calculated at payment</div>
              </div>
            )}

            {/* ── Payment progression ────────────────────────────────────────
                A checklist, not a spinner. When a card sale stalls, staff need
                to know WHERE it stalled — an intent that never reached the
                reader is a different problem from a customer who has not
                tapped, and the fix is different too. */}
            {payStage && (
              <div style={{ background: "rgba(143,214,168,0.07)", border: "1px solid rgba(143,214,168,0.2)", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#8fd6a8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Taking payment</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: payElapsed > 40 ? "#fbbf24" : "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>
                    {Math.floor(payElapsed / 60)}:{String(payElapsed % 60).padStart(2, "0")}
                  </span>
                </div>
                {PAY_STEPS.map((step, i) => {
                  const done = i < payStepIndex;
                  const current = i === payStepIndex;
                  return (
                    <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0" }}>
                      <span style={{
                        width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800,
                        background: done ? "#8fd6a8" : current ? "rgba(143,214,168,0.25)" : "rgba(255,255,255,0.07)",
                        color: done ? "#0b0a08" : "#8fd6a8",
                        border: current ? "1.5px solid #8fd6a8" : "none",
                      }}>{done ? "✓" : ""}</span>
                      <span style={{
                        fontSize: 13,
                        fontWeight: current ? 700 : 500,
                        color: done ? "rgba(255,255,255,0.45)" : current ? "#fff" : "rgba(255,255,255,0.28)",
                      }}>{step.label}</span>
                    </div>
                  );
                })}
                {payElapsed > 40 && payStage === "waiting" && (
                  <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 8 }}>
                    Still waiting on the customer. Cancel and retry, or take it manually.
                  </div>
                )}
                {payStage !== "issued" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button type="button" onClick={cancelTerminalPay}
                      style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.1)", color: "#f87171", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Cancel payment
                    </button>
                    <button type="button" onClick={async () => { await cancelTerminalPay(); handleManualPay(); }}
                      style={{ flex: 1, minHeight: 44, borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "transparent", color: "rgba(255,255,255,0.55)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      Enter manually
                    </button>
                  </div>
                )}
              </div>
            )}

            {issueWarning && (
              <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.35)", borderRadius: 10, padding: "12px 14px", color: "#fbbf24", fontSize: 13, marginBottom: 16, lineHeight: 1.45 }}>
                {issueWarning}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Primary — tap to pay via reader */}
              <button
                type="button"
                onClick={handleTerminalPay}
                disabled={terminalStatus !== "ready" || !buyerName.trim()}
                style={{
                  width: "100%", minHeight: 56, padding: "14px 20px", borderRadius: 12, border: "none",
                  background: terminalStatus === "ready" && buyerName.trim() ? "var(--vc-gold)" : "rgba(208,194,144,0.15)",
                  color: terminalStatus === "ready" && buyerName.trim() ? "#0b0a08" : "rgba(255,255,255,0.25)",
                  fontSize: 16, fontWeight: 800,
                  cursor: terminalStatus === "ready" && buyerName.trim() ? "pointer" : "not-allowed",
                }}
              >
                {terminalStatus === "collecting" ? "Waiting for tap…"
                  : terminalStatus === "processing" ? "Processing…"
                  : terminalStatus === "ready" ? `Charge $${(ticketPrice * quantity).toFixed(2)} on the reader`
                  : terminalStatus === "connecting" ? "Connecting to reader…"
                  : terminalStatus === "discovering" ? "Looking for the reader…"
                  : "Reader not connected"}
              </button>

              {/* Secondary — manual card entry */}
              <button
                type="button"
                onClick={handleManualPay}
                disabled={!buyerName.trim() || creatingManualIntent}
                style={{ width: "100%", minHeight: 48, padding: "12px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, cursor: buyerName.trim() && !creatingManualIntent ? "pointer" : "not-allowed" }}
              >
                {creatingManualIntent ? "Loading…" : "Manual Card Entry"}
              </button>
            </div>
          </>
        )}

        {/* Buyer info — cash */}
        {selectedEventId && saleType === "cash" && (
          <>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>First Name *</label><input type="text" value={cashFirstName} onChange={(e) => setCashFirstName(e.target.value)} placeholder="First name" style={fieldStyle} /></div>
            <div style={{ marginBottom: 20 }}><label style={labelStyle}>Last Name *</label><input type="text" value={cashLastName} onChange={(e) => setCashLastName(e.target.value)} placeholder="Last name" style={fieldStyle} /></div>

            {/* Price summary */}
            {ticketPrice > 0 && (
              <div style={{ background: "rgba(208,194,144,0.06)", border: "1px solid rgba(208,194,144,0.12)", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Collect</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{quantity}× ${ticketPrice.toFixed(2)} {selectedTier?.tier_name ? `· ${selectedTier.tier_name}` : ""}</div>
                  </div>
                  <div style={{ fontSize: 38, fontWeight: 800, color: "var(--vc-gold)", letterSpacing: "-0.03em", lineHeight: 1 }}>
                    ${(ticketPrice * quantity).toFixed(2)}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>no fees, no tax — cash is face value only</div>
              </div>
            )}

            <button
              type="button"
              onClick={handleCashSale}
              disabled={cashSubmitting || !cashFirstName.trim() || !cashLastName.trim()}
              style={{
                width: "100%", minHeight: 56, padding: "14px 20px", borderRadius: 12, border: "none",
                background: !cashSubmitting && cashFirstName.trim() && cashLastName.trim() ? "var(--vc-gold)" : "rgba(208,194,144,0.15)",
                color: !cashSubmitting && cashFirstName.trim() && cashLastName.trim() ? "#0b0a08" : "rgba(255,255,255,0.25)",
                fontSize: 16, fontWeight: 800,
                cursor: !cashSubmitting && cashFirstName.trim() && cashLastName.trim() ? "pointer" : "not-allowed",
              }}
            >
              {cashSubmitting ? "Recording…" : "Record Cash Sale"}
            </button>
          </>
        )}

        {/* ── Recent sales ───────────────────────────────────────────────────
            Staff need to see the sale they just took land, and to answer "did
            that go through?" without leaving the till. Card / cash / comp are
            marked because the answer to "how much cash should be in the
            drawer" is the cash column alone. */}
        {door && door.recent.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
              Recent sales
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, background: "rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
              {door.recent.map((r) => {
                const tint = r.tender === "cash" ? "#8fd6a8" : r.tender === "card" ? "#60a5fa" : r.tender === "comp" ? "#c4b5fd" : "rgba(255,255,255,0.35)";
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--vc-bg)" }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: tint, border: `1px solid ${tint}55`, borderRadius: 5, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.4px", flexShrink: 0 }}>
                      {r.tender}
                    </span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", flexShrink: 0 }}>×{r.quantity}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>${r.amount.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
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
    return <div style={{ minHeight: "100vh", background: "var(--vc-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ color: "rgba(255,255,255,0.3)", fontSize: 14, fontFamily: "var(--font-urbanist), sans-serif" }}>Loading…</div></div>;
  }
  if (authState === "login") {
    return <LoginScreen onSuccess={(name) => { setStaffName(name); setAuthState("ready"); }} />;
  }
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "rgba(255,255,255,0.4)" }}>Loading…</div>}>
      <BoxOfficeContent staffName={staffName} onSignOut={handleSignOut} />
    </Suspense>
  );
}
