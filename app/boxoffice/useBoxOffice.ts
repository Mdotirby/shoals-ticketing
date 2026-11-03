"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadStripeTerminal } from "@stripe/terminal-js";
import type { Terminal, Reader } from "@stripe/terminal-js";
import { getCookie } from "@/lib/cookies";
import { compareEventsForDisplay, isEventLive, isEventToday } from "@/lib/dates";
import { WALK_UP_NAME } from "@/lib/pos/pricing";

/**
 * The box office's state and everything that moves money: the card reader, the
 * show and tier, card and cash sales, and tonight's totals. No markup, so the
 * current till and the new POS run the same sale code.
 */

export type EventOption  = { id: string; title: string; date: string; price: number; event_type: string };
export type TierOption   = { id: string; tier_name: string; price: number; capacity?: number | null; sold?: number | null; locked?: boolean };
export type PaymentMode  = "idle" | "terminal" | "manual";
export type SaleType     = "card" | "cash";

/**
 * The reader's real states, not a proxy for them.
 *
 * This used to collapse the Terminal SDK's lifecycle into "ready" and
 * "collecting". A dot that is green whenever the page has loaded is worse than
 * no dot: staff learn to ignore it, and the first time they find out the
 * reader dropped is with a customer's card already in their hand.
 */
export type TerminalStatus =
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
export type PayStage = null | "intent" | "sent" | "waiting" | "processing" | "issued";

export type DoorTotals = {
  cash: { orders: number; amount: number; tickets: number };
  card: { orders: number; amount: number; tickets: number };
  comp: { orders: number; tickets: number };
  online: { orders: number; amount: number; tickets: number };
  doorTotal: number;
  doorTickets: number;
  scannedIn: number;
  guestsIn?: number;
  ticketsIssued: number;
  recent: { id: string; name: string; amount: number; quantity: number; tender: string; at: string }[];
  doorSales?: { id: string; name: string; amount: number; quantity: number; tender: "cash" | "card"; at: string; email: string | null }[];
};

/**
 * A guest-list row, as `guest_list` actually stores it.
 *
 * This was written against guessed field names — `name`, `guest_name`,
 * `checked_in` — none of which exist. The table is first_name / last_name /
 * quantity / notes, so every row on the door's list rendered as the fallback
 * string "Guest" and the status badge meant nothing.
 */
export type GuestRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  quantity?: number | null;
  notes?: string | null;
  /** Null until someone at the door marks them in. */
  checked_in_at?: string | null;
  list?: "artist" | "house" | null;
  comp_allocation?: "artist" | "venue" | "marketing" | null;
};

export const money = (n: number) => `$${n.toFixed(2)}`;
export const clock = (iso: string) => {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  return `${h}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() < 12 ? "a" : "p"}`;
};

export function useBoxOffice({ allowWalkUp = false }: { allowWalkUp?: boolean } = {}) {
  const [events, setEvents]                   = useState<EventOption[]>([]);
  const [tiers, setTiers]                     = useState<TierOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedTierId, setSelectedTierId]   = useState("");
  /** Tiers unlocked at this till, and the code, which the server re-checks. */
  const [unlockedTierIds, setUnlockedTierIds] = useState<string[]>([]);
  const [tierCode, setTierCode]               = useState<string | null>(null);
  const [tierCodeInput, setTierCodeInput]     = useState("");
  const [tierCodeError, setTierCodeError]     = useState<string | null>(null);
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
  const [scanOpen, setScanOpen] = useState(false);

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
  const saleName = buyerName.trim() || (allowWalkUp ? WALK_UP_NAME : "");

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
    // A code unlocks a tier on ONE show; changing shows must not carry it over.
    setUnlockedTierIds([]);
    setTierCode(null);
    setTierCodeInput("");
    setTierCodeError(null);
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

  const isTierLocked = (t: TierOption) => !!t.locked && !unlockedTierIds.includes(t.id);
  const hasLockedTier = tiers.some(isTierLocked);

  const submitTierCode = async () => {
    const code = tierCodeInput.trim();
    if (!code || !selectedEventId) return;
    setTierCodeError(null);
    try {
      const res = await fetch(`/api/events/${selectedEventId}/tier-unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.tierIds) && data.tierIds.length > 0) {
        setUnlockedTierIds((prev) => [...new Set([...prev, ...data.tierIds])]);
        setTierCode(code);
        setTierCodeInput("");
      } else {
        setTierCodeError(data.error || "No tier on this show uses that code.");
      }
    } catch {
      setTierCodeError("Couldn't check that code.");
    }
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
    if (!saleName) { setFormError("Buyer name is required"); return false; }
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

  const retryReader = () => { if (terminalRef.current) discoverReaders(terminalRef.current); };

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
          unlock_code: tierCode || undefined,
          quantity,
          buyer_name: saleName,
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
          unlockCode: tierCode || undefined,
          buyerName: saleName,
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
    if (!saleName) { setFormError("Buyer name is required"); return; }
    const parts = saleName.split(/\s+/);
    setFormError(null);
    setCashSubmitting(true);
    try {
      const res = await fetch("/api/box-office/cash-sale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          tier_id: selectedTierId || undefined,
          unlock_code: tierCode || undefined,
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
  // The scanner would cover a charge the customer is waiting on.
  const paymentRunning = (!!payStage && payStage !== "issued") || cashSubmitting;

  const countedNum = parseFloat(counted);
  const overShort = door && !Number.isNaN(countedNum) ? Math.round((countedNum - door.cash.amount) * 100) / 100 : null;


  return {
    events,
    setEvents,
    tiers,
    setTiers,
    selectedEventId,
    setSelectedEventId,
    selectedTierId,
    setSelectedTierId,
    unlockedTierIds,
    setUnlockedTierIds,
    tierCode,
    setTierCode,
    tierCodeInput,
    setTierCodeInput,
    tierCodeError,
    setTierCodeError,
    quantity,
    setQuantity,
    saleType,
    setSaleType,
    buyerName,
    setBuyerName,
    buyerEmail,
    setBuyerEmail,
    buyerPhone,
    setBuyerPhone,
    buyerZip,
    setBuyerZip,
    formError,
    setFormError,
    loadingEvents,
    setLoadingEvents,
    loadingTiers,
    setLoadingTiers,
    cashSubmitting,
    setCashSubmitting,
    cashSuccess,
    setCashSuccess,
    keyBuffer,
    setKeyBuffer,
    scanOpen,
    setScanOpen,
    terminalRef,
    terminalStatus,
    setTerminalStatus,
    readers,
    setReaders,
    connectedReader,
    setConnectedReader,
    terminalError,
    setTerminalError,
    setPaymentMode,
    lastPing,
    setLastPing,
    payStage,
    setPayStage,
    payElapsed,
    setPayElapsed,
    issueWarning,
    setIssueWarning,
    door,
    setDoor,
    guests,
    setGuests,
    checkingIn,
    setCheckingIn,
    counted,
    setCounted,
    showManual,
    setShowManual,
    creatingManualIntent,
    setCreatingManualIntent,
    manualClientSecret,
    setManualClientSecret,
    manualPaymentIntentId,
    setManualPaymentIntentId,
    isWest72,
    discoverReaders,
    connectReader,
    refreshDoor,
    selectedEvent,
    selectedTier,
    ticketPrice,
    faceValue,
    pressKey,
    isTierLocked,
    hasLockedTier,
    submitTierCode,
    pickTier,
    validateForm,
    cancelTerminalPay,
    confirmIssued,
    handleTerminalPay,
    handleManualPay,
    handleCashSale,
    toggleGuest,
    resetSale,
    READER_STATES,
    reader,
    readerOk,
    readerIdentity,
    readerMeta,
    PAY_STEPS,
    payStepIndex,
    paymentRunning,
    countedNum,
    overShort,
    saleName,
    retryReader,
  };
}
