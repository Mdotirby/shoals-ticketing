"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { loadStripe } from "@stripe/stripe-js";
import { loadStripeTerminal } from "@stripe/terminal-js";
import type { Terminal, Reader } from "@stripe/terminal-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
const ALLOWED_ROLES = ["owner", "venue_admin", "box_office"];

type EventOption  = { id: string; title: string; date: string; price: number; event_type: string };
type TierOption   = { id: string; tier_name: string; price: number };
type PaymentMode  = "idle" | "terminal" | "manual";
type TerminalStatus = "init" | "discovering" | "no_readers" | "connecting" | "ready" | "collecting" | "success" | "error";

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

  // Terminal state
  const terminalRef               = useRef<Terminal | null>(null);
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>("init");
  const [readers, setReaders]     = useState<Reader[]>([]);
  const [connectedReader, setConnectedReader] = useState<Reader | null>(null);
  const [terminalError, setTerminalError]     = useState("");
  const [paymentMode, setPaymentMode]         = useState<PaymentMode>("idle");

  // Manual (EmbeddedCheckout) fallback
  const [showManual, setShowManual] = useState(false);

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
    const result = await t.discoverReaders({ method: "internet", simulated: false });
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
  useEffect(() => {
    fetch("/api/events")
      .then((r) => r.json())
      .then((data: EventOption[]) => {
        const now = new Date();
        setEvents((data || []).filter((e) => (e.event_type === "hard_ticket" || e.event_type === "ticketed") && new Date(e.date) >= now));
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

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const selectedTier  = tiers.find((t) => t.id === selectedTierId);
  const ticketPrice   = selectedTier?.price ?? selectedEvent?.price ?? 0;

  // ── Validate form ─────────────────────────────────────────────────────────
  const validateForm = () => {
    if (!selectedEventId) { setFormError("Please select an event"); return false; }
    if (!buyerName.trim() || !buyerEmail.trim()) { setFormError("Name and email are required"); return false; }
    setFormError(null);
    return true;
  };

  // ── Terminal payment ──────────────────────────────────────────────────────
  const handleTerminalPay = async () => {
    if (!validateForm() || !terminalRef.current) return;
    setPaymentMode("terminal");
    setTerminalStatus("collecting");
    setTerminalError("");

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

      // 2. Collect payment method — customer taps card/phone to reader
      const collectResult = await terminalRef.current.collectPaymentMethod(intentData.clientSecret);
      if ("error" in collectResult) throw new Error(collectResult.error.message);

      // 3. Process payment
      const processResult = await terminalRef.current.processPayment(collectResult.paymentIntent);
      if ("error" in processResult) throw new Error(processResult.error.message);

      setTerminalStatus("success");
    } catch (err: unknown) {
      setTerminalError(err instanceof Error ? err.message : "Payment failed");
      setTerminalStatus("ready");
      setPaymentMode("idle");
    }
  };

  // ── Manual entry fallback (EmbeddedCheckout) ──────────────────────────────
  const fetchManualSecret = useCallback(async () => {
    const res = await fetch("/api/boxoffice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: selectedEventId, quantity,
        tier_id: selectedTierId || undefined,
        buyer_name: buyerName.trim(), buyer_email: buyerEmail.trim(),
        buyer_phone: buyerPhone.trim(), buyer_zip: buyerZip.trim() || undefined,
      }),
    });
    if (!res.ok) { const d = await res.json(); setFormError(d.error || "Failed to start checkout"); return ""; }
    return (await res.json()).clientSecret;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, selectedTierId, quantity, buyerName, buyerEmail, buyerPhone, buyerZip]);

  const handleManualPay = () => {
    if (!validateForm()) return;
    setShowManual(true);
  };

  const resetSale = () => {
    setShowManual(false); setPaymentMode("idle");
    setBuyerName(""); setBuyerEmail(""); setBuyerPhone(""); setBuyerZip("");
    setQuantity(1); setSelectedTierId(""); setFormError(null); setTerminalError("");
    if (terminalStatus === "success") setTerminalStatus("ready");
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const fieldStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(208,194,144,0.2)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16, boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" };

  // ── Reader status indicator ───────────────────────────────────────────────
  const readerDot = {
    init:        { color: "rgba(255,255,255,0.3)", label: "Initializing…" },
    discovering: { color: "#fbbf24", label: "Looking for reader…" },
    no_readers:  { color: "#f87171", label: "No reader found" },
    connecting:  { color: "#fbbf24", label: "Connecting…" },
    ready:       { color: "#4ade80", label: `Ready · ${connectedReader?.label ?? "Reader connected"}` },
    collecting:  { color: "#60a5fa", label: "Waiting for tap…" },
    success:     { color: "#4ade80", label: "Payment accepted" },
    error:       { color: "#f87171", label: "Error — try again" },
  }[terminalStatus];

  // ── Success screen ────────────────────────────────────────────────────────
  if (terminalStatus === "success") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--vc-bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "var(--font-urbanist), sans-serif", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
        <h2 style={{ fontSize: 24, fontWeight: 800, color: "#4ade80", margin: "0 0 8px" }}>Payment Complete</h2>
        <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, marginBottom: 32 }}>
          Ticket confirmed for {buyerName}. Confirmation email sent to {buyerEmail}.
        </p>
        <button onClick={resetSale} style={{ padding: "13px 32px", borderRadius: 10, border: "none", background: "var(--vc-gold)", color: "#0b0a08", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
          New Sale
        </button>
      </div>
    );
  }

  // ── Manual entry (EmbeddedCheckout) ──────────────────────────────────────
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
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret: fetchManualSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
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
        {/* Reader status */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "center" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: readerDot.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{readerDot.label}</span>
          {terminalStatus === "no_readers" && (
            <button onClick={() => terminalRef.current && discoverReaders(terminalRef.current)} style={{ fontSize: 11, color: "var(--vc-gold)", background: "transparent", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Retry</button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{staffName}</span>
          <button onClick={onSignOut} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", padding: "4px 10px", borderRadius: 7, fontSize: 12, cursor: "pointer" }}>Out</button>
        </div>
      </div>

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
              {events.map((e) => <option key={e.id} value={e.id}>{e.title} — {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</option>)}
            </select>
          )}
        </div>

        {/* Tiers */}
        {selectedEventId && tiers.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Ticket Type</label>
            {loadingTiers ? <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>Loading…</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tiers.map((tier) => (
                  <button key={tier.id} type="button" onClick={() => setSelectedTierId(tier.id)} style={{ padding: "11px 14px", borderRadius: 8, border: `1px solid ${selectedTierId === tier.id ? "var(--vc-gold)" : "rgba(255,255,255,0.1)"}`, background: selectedTierId === tier.id ? "rgba(208,194,144,0.1)" : "rgba(255,255,255,0.03)", color: selectedTierId === tier.id ? "var(--vc-gold)" : "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>{tier.tier_name}</span>
                    <span>${tier.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Quantity */}
        {selectedEventId && (
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Quantity</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid rgba(208,194,144,0.2)", background: "rgba(255,255,255,0.05)", color: "var(--vc-gold)", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
              <span style={{ fontSize: 20, fontWeight: 700, minWidth: 28, textAlign: "center" }}>{quantity}</span>
              <button type="button" onClick={() => setQuantity(Math.min(20, quantity + 1))} style={{ width: 38, height: 38, borderRadius: 8, border: "1px solid rgba(208,194,144,0.2)", background: "rgba(255,255,255,0.05)", color: "var(--vc-gold)", fontSize: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
            </div>
          </div>
        )}

        {selectedEventId && <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "18px 0" }} />}

        {/* Buyer info */}
        {selectedEventId && (
          <>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Buyer Name *</label><input type="text" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Full name" style={fieldStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Email *</label><input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="email@example.com" style={fieldStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelStyle}>Phone</label><input type="tel" value={buyerPhone} onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))} placeholder="(555) 555-1234" style={fieldStyle} /></div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>ZIP Code <span style={{ fontWeight: 400, opacity: 0.55, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
              <input type="text" inputMode="numeric" value={buyerZip} onChange={(e) => setBuyerZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="35630" autoComplete="postal-code" style={fieldStyle} />
            </div>

            {/* Price summary */}
            {ticketPrice > 0 && (
              <div style={{ background: "rgba(208,194,144,0.06)", border: "1px solid rgba(208,194,144,0.12)", borderRadius: 10, padding: "13px 16px", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 3 }}>
                  <span>{quantity}× ${ticketPrice.toFixed(2)}</span>
                  <span>${(ticketPrice * quantity).toFixed(2)}</span>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>+ fees &amp; tax calculated at payment</div>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Primary — tap to pay via reader */}
              <button
                type="button"
                onClick={handleTerminalPay}
                disabled={terminalStatus !== "ready" || terminalStatus === ("collecting" as TerminalStatus) || !buyerName.trim() || !buyerEmail.trim()}
                style={{
                  width: "100%", padding: "14px 20px", borderRadius: 10, border: "none",
                  background: terminalStatus === "ready" && buyerName.trim() && buyerEmail.trim() ? "var(--vc-gold)" : "rgba(208,194,144,0.15)",
                  color: terminalStatus === "ready" && buyerName.trim() && buyerEmail.trim() ? "#0b0a08" : "rgba(255,255,255,0.25)",
                  fontSize: 15, fontWeight: 700,
                  cursor: terminalStatus === "ready" && buyerName.trim() && buyerEmail.trim() ? "pointer" : "not-allowed",
                }}
              >
                {terminalStatus === "collecting" ? "Waiting for tap…" : terminalStatus === "ready" ? "Collect via Reader →" : terminalStatus === "connecting" ? "Connecting to reader…" : "Reader not connected"}
              </button>

              {/* Secondary — manual card entry */}
              <button
                type="button"
                onClick={handleManualPay}
                disabled={!buyerName.trim() || !buyerEmail.trim()}
                style={{ width: "100%", padding: "12px 20px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, cursor: buyerName.trim() && buyerEmail.trim() ? "pointer" : "not-allowed" }}
              >
                Manual Card Entry
              </button>
            </div>
          </>
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
