"use client";

/**
 * The box office POS: phone (Tap to Add) and laptop or tablet, from
 * handoff/BOXOFFICE-POS.md. All selling goes through useBoxOffice, the same code
 * as the older till. This file is markup and the rules of a sale on screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import TicketScanner, { type ScannerButton } from "@/app/components/scan/TicketScanner";
import { isEventToday, safeDate } from "@/lib/dates";
import { allocationFor, allocationLabel } from "@/lib/guests/compAllocation";
import { cardPresentTotal, cashSuggestions, changeDue, parseCashInput, type UnitPrice } from "@/lib/pos/pricing";
import { stripeAppearance } from "@/lib/stripeAppearance";
import ManualPayForm from "../ManualPayForm";
import { clock, money, type TierOption, useBoxOffice } from "../useBoxOffice";
import DrawerPanel from "./DrawerPanel";
import "./pos.css";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

export type PosBackend = ReturnType<typeof useBoxOffice>;
type Pricing = { event: UnitPrice; tiers: Record<string, UnitPrice> };
type Tab = "sell" | "scan" | "guests" | "drawer" | "more";
type Sheet = null | "code" | "buyer" | "picker";
type SaleState = { tierId: string; qty: number } | null;

const usd = (cents: number) => money(cents / 100);
const shortPrice = (n: number) => `$${n % 1 ? n.toFixed(2) : n}`;
const LOW_STOCK = 10;

function tierAvailability(t: TierOption, locked: boolean) {
  const left = t.capacity != null ? Math.max(0, Number(t.capacity) - (Number(t.sold) || 0)) : null;
  if (left === 0) return { state: "soldout" as const, label: "Sold out", tone: "" };
  if (locked) return { state: "locked" as const, label: "Code needed", tone: "warn" };
  if (left !== null && left <= LOW_STOCK) return { state: "low" as const, label: `${left} left`, tone: "warn" };
  return { state: "ok" as const, label: left !== null ? `${left} left` : "", tone: "" };
}

/** Phone below this width, laptop and tablet above it. */
function useIsPhone() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return phone;
}

const ScanButton: ScannerButton = ({ onClick, children }) => (
  <button type="button" className="pos-pill" onClick={onClick}>{children}</button>
);

export default function PosApp({ staffName, onSignOut }: { staffName: string; onSignOut: () => void }) {
  const b = useBoxOffice({ allowWalkUp: true });
  return <PosView b={b} staffName={staffName} onSignOut={onSignOut} />;
}

export function PosView({
  b, staffName, onSignOut, initial,
}: {
  b: PosBackend;
  staffName: string;
  onSignOut: () => void;
  /** Only for previewing a state. */
  initial?: { tab?: Tab; sale?: SaleState; cash?: boolean; given?: number; sheet?: Sheet; pricing?: Pricing };
}) {
  const isPhone = useIsPhone();
  const [tab, setTab] = useState<Tab>(initial?.tab ?? "sell");
  const [sale, setSale] = useState<SaleState>(initial?.sale ?? null);
  const [history, setHistory] = useState<SaleState[]>([]);
  const [sheet, setSheet] = useState<Sheet>(initial?.sheet ?? null);
  const [cashScreen, setCashScreen] = useState(!!initial?.cash);
  const [givenCents, setGivenCents] = useState<number | null>(initial?.given ?? null);
  const [givenText, setGivenText] = useState(initial?.given ? (initial.given / 100).toFixed(2) : "");
  const [codeTierId, setCodeTierId] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [changeOwed, setChangeOwed] = useState(0);
  const [toast, setToast] = useState("");
  const [pricing, setPricing] = useState<Pricing | null>(initial?.pricing ?? null);
  const [guestQuery, setGuestQuery] = useState("");
  const [guestFilter, setGuestFilter] = useState<"all" | "artist" | "venue" | "marketing" | "in">("all");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [orderAction, setOrderAction] = useState<NonNullable<NonNullable<PosBackend["door"]>["doorSales"]>[number] | null>(null);
  const [orderNote, setOrderNote] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderBusy, setOrderBusy] = useState(false);

  const eventId = b.selectedEventId;
  const cash = b.saleType === "cash";

  // Per-ticket prices for this show. If this fails the reader still charges the
  // right amount, and the screen says so rather than showing a guess.
  useEffect(() => {
    if (initial?.pricing) return;
    setPricing(null);
    if (!eventId) return;
    let live = true;
    fetch(`/api/box-office/pricing?event_id=${eventId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setPricing(d); })
      .catch(() => {});
    return () => { live = false; };
  }, [eventId, initial?.pricing]);

  const qty = sale?.qty ?? 0;
  const tier = sale ? b.tiers.find((t) => t.id === sale.tierId) : undefined;
  const hasSale = !!sale && qty > 0;
  const facePrice = tier?.price ?? b.selectedEvent?.price ?? 0;
  const tierLabel = tier?.tier_name ?? "General admission";
  const dueCents = hasSale ? Math.round(facePrice * 100) * qty : 0;
  const unit = sale ? (sale.tierId ? pricing?.tiers[sale.tierId] : pricing?.event) : undefined;
  const card = unit && hasSale ? cardPresentTotal(unit, qty) : null;
  const change = changeDue(dueCents, givenCents);
  const canComplete = hasSale && change.state === "enough" && !b.cashSubmitting;

  const readerReady = b.terminalStatus === "ready";
  const readerView = useMemo(() => {
    switch (b.terminalStatus) {
      case "ready": case "success": case "collecting": case "processing":
        return { tone: "good", label: "Reader ready", color: "var(--good)", banner: "", btn: "" };
      case "no_readers":
        return { tone: "bad", label: "No reader", color: "var(--bad-text)", banner: "Card reader not found.", btn: "Retry" };
      case "error":
        return { tone: "off", label: "Reader off", color: "rgba(255,255,255,0.72)", banner: "Card reader disconnected.", btn: "Reconnect" };
      default:
        return { tone: "warn", label: "Connecting", color: "var(--warn)", banner: "Connecting to the card reader.", btn: "" };
    }
  }, [b.terminalStatus]);

  const paying = !!b.payStage && b.payStage !== "issued";
  const cardDone = b.terminalStatus === "success" && (b.payStage === "issued" || !!b.issueWarning);
  const done = cardDone || !!b.cashSuccess;
  const payFailed = attempted && !b.payStage && !!b.terminalError && !done;
  const busy = paying || b.terminalStatus === "success" || b.cashSubmitting;

  // ── The sale ─────────────────────────────────────────────────────────────
  const applySale = useCallback((next: SaleState) => {
    setSale(next);
    b.setSelectedTierId(next?.tierId ?? "");
    b.setQuantity(next?.qty || 1);
    b.setFormError(null);
  }, [b]);

  const change_ = (next: SaleState) => { setHistory((h) => [...h, sale]); applySale(next); };

  const tapTier = (id: string) => {
    if (busy) return;
    if (sale && sale.tierId === id) { if (sale.qty < 20) change_({ tierId: id, qty: sale.qty + 1 }); return; }
    change_({ tierId: id, qty: 1 }); // One tier per sale: another tier starts over.
    setGivenCents(null); setGivenText("");
  };

  const pressTile = (t: TierOption) => {
    const a = tierAvailability(t, !!t.locked && !b.unlockedTierIds.includes(t.id));
    if (a.state === "soldout") return;
    if (a.state === "locked") {
      setCodeTierId(t.id); b.setTierCodeInput(""); b.setTierCodeError(null); setSheet("code");
      return;
    }
    tapTier(t.id);
  };

  // A correct code unlocks the tier and adds one.
  const wasLocked = useRef(true);
  useEffect(() => {
    if (sheet !== "code" || !codeTierId) { wasLocked.current = true; return; }
    if (b.unlockedTierIds.includes(codeTierId) && wasLocked.current) {
      wasLocked.current = false;
      setSheet(null);
      tapTier(codeTierId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.unlockedTierIds, sheet, codeTierId]);

  const clearSale = useCallback(() => {
    setSale(null); setHistory([]); setGivenCents(null); setGivenText("");
    setCashScreen(false); setAttempted(false);
    b.setSelectedTierId(""); b.setQuantity(1); b.setFormError(null); b.setTerminalError("");
    b.setSaleType("card");
  }, [b]);

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    applySale(prev);
  };

  const setQty = (n: number) => { if (sale) change_({ ...sale, qty: Math.max(1, Math.min(20, n)) }); };

  const charge = () => {
    if (!hasSale || !readerReady || busy) return;
    setAttempted(true);
    b.setTerminalError("");
    b.handleTerminalPay();
  };

  const setGiven = (cents: number) => { setGivenCents(cents); setGivenText((cents / 100).toFixed(2)); };

  const completeCash = () => {
    if (!canComplete) return;
    setChangeOwed(change.cents);
    b.handleCashSale();
  };

  const openCash = () => {
    if (!hasSale) return;
    b.setSaleType("cash"); b.setTerminalError(""); setAttempted(false);
    if (isPhone) setCashScreen(true);
  };

  const nextCustomer = useCallback(() => {
    b.resetSale();
    clearSale();
    setChangeOwed(0);
    setToast("Ready for the next customer");
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, [b, clearSale]);

  const goTab = (t: Tab) => { if (!busy) setTab(t); };

  const showToast = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };

  const resend = async (orderId: string, email: string | null) => {
    setOrderBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/resend-email`, { method: "POST" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Couldn't resend the tickets.");
      showToast(`Tickets sent to ${email}`);
    } catch (e) {
      b.setFormError(e instanceof Error ? e.message : "Couldn't resend the tickets.");
    } finally {
      setOrderBusy(false);
    }
  };

  /** Card sale: refund it. Cash sale: void it, since no money moves through Stripe. */
  const undoSale = async () => {
    if (!orderAction) return;
    const note = orderNote.trim();
    if (!note) { setOrderError("Say what happened. It goes on the order."); return; }
    setOrderBusy(true); setOrderError("");
    const cashSale = orderAction.tender === "cash";
    try {
      const res = await fetch(`/api/admin/orders/${orderAction.id}/${cashSale ? "void" : "refund"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cashSale ? { note } : { reason: "glitch", note }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || (res.status === 403 ? "Your account can't do this. Ask a manager." : "That didn't go through."));
      setOrderAction(null);
      await b.refreshDoor();
      showToast(cashSale ? "Sale voided" : "Refund sent");
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setOrderBusy(false);
    }
  };

  const mainAction = () => {
    if (cash) completeCash(); else charge();
  };

  // ── Keyboard, from the spec ──────────────────────────────────────────────
  const latest = useRef({ mainAction, done, nextCustomer, sheet, tab, paying, hasSale, sale, setQty, clearSale, b, goTab, dialog: !!orderAction });
  latest.current = { mainAction, done, nextCustomer, sheet, tab, paying, hasSale, sale, setQty, clearSale, b, goTab, dialog: !!orderAction };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = latest.current;
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
      if (e.key === "Escape") {
        if (k.dialog) { setOrderAction(null); return; }
        if (k.sheet) setSheet(null);
        else if (k.paying) k.b.cancelTerminalPay();
        else if (!k.done && k.tab === "sell") k.clearSale();
        return;
      }
      if (e.key === "Enter") {
        // A focused button answers Enter itself, so nothing can fire twice.
        if (el.tagName === "BUTTON" || el.tagName === "A" || k.dialog) return;
        if (k.done) { k.nextCustomer(); return; }
        if (k.sheet === "code") { k.b.submitTierCode(); return; }
        // Finishing an email must not start a charge. Only the cash box may submit.
        if (typing && !el.dataset.submits) return;
        if (!k.sheet && k.tab === "sell") k.mainAction();
        return;
      }
      if (typing || k.sheet || k.done || k.paying || k.dialog) return;
      if (e.key.toLowerCase() === "s") { k.goTab("scan"); return; }
      if (k.tab !== "sell") return;
      if (e.key.toLowerCase() === "c") { if (k.hasSale) k.b.setSaleType(k.b.saleType === "cash" ? "card" : "cash"); return; }
      if (/^[1-9]$/.test(e.key) && k.sale) k.setQty(Number(e.key));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Shared pieces ────────────────────────────────────────────────────────
  const tierOptions: TierOption[] = b.tiers.length > 0
    ? b.tiers
    : b.selectedEvent && !b.loadingTiers
      ? [{ id: "", tier_name: "General admission", price: b.selectedEvent.price || 0 }]
      : [];

  const tile = (t: TierOption, full?: boolean) => {
    const a = tierAvailability(t, !!t.locked && !b.unlockedTierIds.includes(t.id));
    const on = !!sale && sale.tierId === t.id;
    return (
      <button
        key={t.id || "event"}
        type="button"
        className={`pos-tile${full ? " pos-tile--full" : ""}`}
        data-on={on}
        data-state={a.state}
        aria-pressed={on}
        aria-disabled={a.state === "soldout"}
        onClick={() => pressTile(t)}
      >
        <div className="pos-tile-name">{t.tier_name}</div>
        <div className="pos-tile-row">
          <div className="pos-tile-price">{shortPrice(t.price)}</div>
          {a.label && <div className="pos-tile-state" data-tone={a.tone}>{a.label}</div>}
        </div>
        {on && <div className="pos-badge">{isPhone ? qty : "✓"}</div>}
      </button>
    );
  };

  const readerPill = (
    <button type="button" className="pos-pill" style={{ color: readerView.color, borderColor: readerView.color }} onClick={() => { if (!readerReady) b.retryReader(); }}>
      <span className="pos-dot" />{readerView.label}
    </button>
  );

  const readerBanner = !readerView.banner ? null : (
    <div className="pos-banner" data-tone={readerView.tone}>
      <span>{readerView.banner}</span>
      {readerView.btn && <button type="button" className="pos-banner-btn" onClick={() => b.retryReader()}>{readerView.btn}</button>}
      <button type="button" className="pos-pill" onClick={() => { if (hasSale) b.handleManualPay(); }} disabled={!hasSale || b.creatingManualIntent}>Key in card</button>
      {!isPhone && <button type="button" className="pos-pill" onClick={openCash} disabled={!hasSale}>Use cash</button>}
    </div>
  );

  const showLine = b.selectedEvent
    ? [
        isEventToday(b.selectedEvent.date) ? "Tonight" : safeDate(b.selectedEvent.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
        (b.selectedEvent as { venue?: string }).venue,
      ].filter(Boolean).join(" · ")
    : "";

  const Sheets = (): ReactNode => {
    if (orderAction) {
      const cashSale = orderAction.tender === "cash";
      return (
        <Dialog onDim={() => !orderBusy && setOrderAction(null)}>
          <h2>{cashSale ? "Void" : "Refund"} {money(orderAction.amount)}?</h2>
          <p>
            {orderAction.quantity} × {orderAction.name}.{" "}
            {cashSale
              ? "Use this for a sale that never happened. Its tickets stop scanning and the seats go back on sale. Give back any cash by hand."
              : "The whole order goes back to their card, fees included, and its tickets stop scanning. This can't be undone."}
          </p>
          <input autoFocus className="pos-input" placeholder="What happened?" value={orderNote} onChange={(e) => setOrderNote(e.target.value)} />
          {orderError && <div className="pos-error">{orderError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
            <button type="button" className="pos-pill" style={{ height: 56 }} disabled={orderBusy} onClick={() => setOrderAction(null)}>Keep the sale</button>
            <button type="button" className="pos-main" style={{ height: 56, fontSize: 16, borderRadius: 999 }} disabled={orderBusy} onClick={undoSale}>
              {orderBusy ? "Working…" : cashSale ? "Void sale" : "Refund sale"}
            </button>
          </div>
        </Dialog>
      );
    }
    if (done) {
      return (
        <Dialog>
          <div className="pos-ok">✓</div>
          <h2 style={{ textAlign: "center" }}>Sale complete</h2>
          <p style={{ textAlign: "center" }}>{qty} × {tierLabel}{b.cashSuccess ? " · cash" : " · card"}. Checked in.</p>
          {!!b.issueWarning && <div className="pos-error">{b.issueWarning}</div>}
          {!!b.cashSuccess && (
            <div className="pos-change" data-state="enough" style={{ minHeight: 72 }}>
              <b>Change due</b><span style={{ fontSize: 32 }}>{usd(changeOwed)}</span>
            </div>
          )}
          <AutoFocusButton className="pos-main" style={{ height: 64, fontSize: 18 }} onClick={nextCustomer}>Next customer</AutoFocusButton>
        </Dialog>
      );
    }
    if (paying || (b.terminalStatus === "success" && !cardDone)) {
      const steps: { key: string[]; label: string }[] = [
        { key: ["intent", "sent"], label: "Sent to reader" },
        { key: ["waiting"], label: "Waiting for the customer" },
        { key: ["processing"], label: "Processing" },
        { key: ["issued"], label: "Ticket issued and checked in" },
      ];
      const at = steps.findIndex((s) => s.key.includes(b.payStage ?? ""));
      const canCancel = at <= 1;
      return (
        <Dialog>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.66)" }}>{qty} × {tierLabel}</div>
            {card && <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: "-0.04em" }}>{usd(card.totalCents)}</div>}
          </div>
          <div className="pos-boxed">
            {steps.map((s, i) => (
              <div key={s.label} className="pos-step" data-state={i < at ? "done" : i === at ? "now" : "todo"}>
                <i>{i < at ? "✓" : ""}</i>{s.label}
              </div>
            ))}
          </div>
          <button type="button" className="pos-pill" style={{ height: 56 }} disabled={!canCancel} onClick={() => b.cancelTerminalPay()}>
            {canCancel ? "Cancel" : "Can't cancel while processing"}
          </button>
        </Dialog>
      );
    }
    if (payFailed) {
      const declined = /declin/i.test(b.terminalError);
      return (
        <Dialog>
          <h2>{declined ? "Card declined" : "Payment didn't go through"}</h2>
          <p>{b.terminalError}</p>
          <button type="button" className="pos-main" style={{ height: 60, fontSize: 17 }} disabled={!readerReady} onClick={charge}>
            Try another card{card ? ` · ${usd(card.totalCents)}` : ""}
          </button>
          <button type="button" className="pos-pill" style={{ height: 56 }} onClick={openCash}>Take cash · {usd(dueCents)}</button>
          <button type="button" className="pos-pill" style={{ height: 44, border: 0 }} onClick={clearSale}>Cancel sale</button>
        </Dialog>
      );
    }
    if (sheet === "code") {
      const t = b.tiers.find((x) => x.id === codeTierId);
      return (
        <Dialog onDim={() => setSheet(null)}>
          <h2>Unlock {t?.tier_name}</h2>
          <p>This tier needs a code. Type the code the customer was given.</p>
          <input
            autoFocus
            className="pos-input"
            style={{ height: 62, fontSize: 24, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}
            placeholder="Unlock code"
            value={b.tierCodeInput}
            onChange={(e) => b.setTierCodeInput(e.target.value)}
          />
          {b.tierCodeError && <div style={{ fontSize: 14, fontWeight: 650, color: "var(--bad-text)" }}>{b.tierCodeError}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
            <button type="button" className="pos-pill" style={{ height: 56 }} onClick={() => setSheet(null)}>Cancel</button>
            <button type="button" className="pos-main" style={{ height: 56, fontSize: 16, borderRadius: 999 }} onClick={() => b.submitTierCode()}>Unlock and add</button>
          </div>
        </Dialog>
      );
    }
    if (sheet === "buyer") {
      return (
        <Dialog onDim={() => setSheet(null)}>
          <h2>Buyer details</h2>
          <p>All optional. Skip it if they&apos;re walking straight in.</p>
          <BuyerFields b={b} />
          <button type="button" className="pos-main" style={{ height: 56, fontSize: 16, borderRadius: 999 }} onClick={() => setSheet(null)}>Done</button>
        </Dialog>
      );
    }
    if (sheet === "picker") {
      return (
        <Dialog onDim={() => setSheet(null)}>
          <h2>Pick a show</h2>
          <div className="pos-boxed">
            {b.events.map((e, i) => (
              <button
                type="button"
                key={e.id}
                className="pos-row-btn"
                onClick={() => { clearSale(); b.setSelectedEventId(e.id); setSheet(null); }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>
                    {e.title}{i === 0 && <span className="pos-key" style={{ marginLeft: 8, background: "#fff", color: "#0a0a0c" }}>NEXT UP</span>}
                  </div>
                  <div style={{ fontSize: 14, color: "rgba(255,255,255,0.66)", marginTop: 3 }}>
                    {isEventToday(e.date) ? "Tonight" : safeDate(e.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                </div>
                {e.id === eventId && <div className="pos-badge" style={{ position: "static" }}>✓</div>}
              </button>
            ))}
            {b.events.length === 0 && <div style={{ padding: 16 }} className="pos-sub">No shows on sale.</div>}
          </div>
          <button type="button" className="pos-pill" style={{ height: 52 }} onClick={() => setSheet(null)}>Close</button>
        </Dialog>
      );
    }
    return null;
  };

  const NoShow = (
    <div style={{ height: "100%", display: "grid", placeItems: "center" }}>
      <div className="pos-panel" style={{ width: "min(520px, 100%)", textAlign: "center", padding: "36px 32px", overflow: "visible" }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>{b.loadingEvents ? "Loading shows…" : "No show selected"}</div>
        <div style={{ fontSize: 16, lineHeight: 1.5, color: "rgba(255,255,255,0.70)" }}>Pick the show you&apos;re selling and scanning for. You can switch any time.</div>
        <button type="button" className="pos-main" style={{ height: 64, fontSize: 18, borderRadius: 24 }} onClick={() => setSheet("picker")}>Choose a show</button>
      </div>
    </div>
  );

  const backToSales = (
    <button type="button" className="pos-pill" style={{ minHeight: 56, flex: "none" }} onClick={() => setTab("sell")}>Back to sales</button>
  );
  const Scan = !eventId ? NoShow : isPhone ? (
    <div className="pos-panel" style={{ height: "100%" }}>
      <TicketScanner eventId={eventId} autoStart onScanned={b.refreshDoor} Btn={ScanButton} />
      {backToSales}
    </div>
  ) : (
    <TicketScanner eventId={eventId} autoStart inline onScanned={b.refreshDoor} Btn={ScanButton} footer={backToSales} />
  );

  const visibleGuests = b.guests.filter((g) => {
    const name = `${g.first_name ?? ""} ${g.last_name ?? ""}`.toLowerCase();
    if (guestQuery && !name.includes(guestQuery.trim().toLowerCase())) return false;
    if (guestFilter === "in") return !!g.checked_in_at;
    if (guestFilter !== "all") return allocationFor(g.comp_allocation, g.list) === guestFilter;
    return true;
  });

  const Guests = (
    <div className="pos-panel" style={{ height: "100%", gap: 14 }}>
      <input className="pos-input" style={{ borderRadius: 999, flex: "none" }} placeholder="Search guest list" value={guestQuery} onChange={(e) => setGuestQuery(e.target.value)} />
      <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap" }}>
        {([["all", "All"], ["artist", "Artist"], ["venue", "Venue"], ["marketing", "Marketing"], ["in", "Checked in"]] as const).map(([k, label]) => (
          <button type="button" key={k} className="pos-chip" style={{ padding: "0 16px", height: 44, fontSize: 14 }} data-on={guestFilter === k} onClick={() => setGuestFilter(k)}>{label}</button>
        ))}
      </div>
      <div>
        {visibleGuests.map((g) => (
          <div key={g.id} className="pos-guest">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 750, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[g.first_name, g.last_name].filter(Boolean).join(" ") || "Guest"}</div>
              {isPhone && <div className="pos-sub" style={{ marginTop: 3 }}>{[`${g.quantity ?? 1} · ${allocationLabel(allocationFor(g.comp_allocation, g.list))}`, g.notes].filter(Boolean).join(" · ")}</div>}
            </div>
            {!isPhone && <div>{g.quantity ?? 1}</div>}
            {!isPhone && <div className="pos-sub" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[allocationLabel(allocationFor(g.comp_allocation, g.list)), g.notes].filter(Boolean).join(" · ")}</div>}
            <button type="button" className="pos-guest-btn" data-in={!!g.checked_in_at} disabled={b.checkingIn === g.id} onClick={async () => { await b.toggleGuest(g.id, !g.checked_in_at); b.refreshDoor(); }}>
              {g.checked_in_at ? "Checked in" : "Check in"}
            </button>
          </div>
        ))}
        {visibleGuests.length === 0 && <div className="pos-empty"><div className="pos-sub">No guests to show.</div></div>}
      </div>
      <div className="pos-sub">A checked-in guest counts as a General Admission comp. Names and who they&apos;re allocated to are set in the event hub.</div>
    </div>
  );

  const door = b.door;
  const Drawer = eventId
    ? <DrawerPanel eventId={eventId} door={door} onBack={isPhone ? () => setTab("more") : undefined} />
    : NoShow;

  if (b.showManual) {
    return (
      <div className={`pos${isPhone ? " pos--phone" : ""}`} style={{ overflowY: "auto", padding: 20 }}>
        <div className="pos-panel" style={{ maxWidth: 560, width: "100%", margin: "0 auto", overflow: "visible", flex: "none" }}>
          <button type="button" className="pos-pill" style={{ alignSelf: "flex-start" }} onClick={() => { b.setShowManual(false); b.setManualClientSecret(""); }}>‹ Sale</button>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Key in card</div>
          {b.manualClientSecret ? (
            <div className="ic-form-wrap">
              <Elements stripe={stripePromise} options={{ clientSecret: b.manualClientSecret, appearance: stripeAppearance }}>
                <ManualPayForm
                  clientSecret={b.manualClientSecret}
                  paymentIntentId={b.manualPaymentIntentId}
                  buyerName={b.saleName}
                  buyerEmail={b.buyerEmail.trim()}
                  buyerPhone={b.buyerPhone.trim()}
                  buyerZip={b.buyerZip.trim()}
                />
              </Elements>
            </div>
          ) : <div className="pos-sub">Loading payment…</div>}
        </div>
      </div>
    );
  }

  // ── Phone ────────────────────────────────────────────────────────────────
  if (isPhone) {
    const sorted = [...tierOptions].sort((a, c) => (Number(c.capacity) || 0) - (Number(a.capacity) || 0));
    const fullTier = sorted.find((t) => sale && t.id === sale.tierId) ?? sorted[0];
    const rest = sorted.filter((t) => t !== fullTier);
    const PHONE_TABS: Tab[] = ["sell", "scan", "guests", "more"];
    const active = tab === "drawer" ? 3 : PHONE_TABS.indexOf(tab);

    return (
      <div className="pos pos--phone">
        <div className="pos-glow"><i /><i /></div>

        {cashScreen && hasSale ? (
          <div className="pos-ph" style={{ paddingBottom: 12, gap: 10 }}>
            <div className="pos-ph-head">
              <button type="button" className="pos-pill" onClick={() => { setCashScreen(false); b.setSaleType("card"); }}>‹ Sale</button>
              <div style={{ flex: 1, textAlign: "center", fontSize: 17, fontWeight: 800 }}>Cash</div>
              <div className="pos-sub" style={{ minWidth: 86, textAlign: "right", fontSize: 13 }}>{qty} × {tierLabel}</div>
            </div>
            <div className="pos-ph-pair">
              <div className="pos-due"><div>Cash due</div><div>{usd(dueCents)}</div></div>
              <div className="pos-due" style={{ border: "1.5px solid rgba(255,255,255,0.40)" }}>
                <div>They gave you</div><div style={{ color: givenCents === null ? "rgba(255,255,255,0.45)" : undefined }}>{usd(givenCents ?? 0)}</div>
              </div>
            </div>
            <ChangeCard change={change} height={84} />
            <div className="pos-chips" style={{ gridTemplateColumns: "repeat(4,1fr)", flex: "none" }}>
              <button type="button" className="pos-chip" data-on={givenCents === dueCents} onClick={() => setGiven(dueCents)}>Exact</button>
              {cashSuggestions(dueCents, 2).slice(0, 3).map((c) => (
                <button type="button" key={c} className="pos-chip" data-on={givenCents === c} onClick={() => setGiven(c)}>${c / 100}</button>
              ))}
            </div>
            <div className="pos-keys">
              {["1","2","3","4","5","6","7","8","9","00","0","⌫"].map((k) => (
                <button
                  type="button"
                  key={k}
                  aria-label={k === "⌫" ? "Delete" : k}
                  onClick={() => {
                    const digits = givenCents === null ? "" : String(givenCents);
                    const next = k === "⌫" ? digits.slice(0, -1) : (digits + k).slice(0, 7);
                    setGivenCents(next ? Number(next) : null);
                  }}
                >{k}</button>
              ))}
            </div>
            {b.formError && <div className="pos-error">{b.formError}</div>}
            <button type="button" className="pos-main" style={{ flex: "none", height: 64, fontSize: 18, borderRadius: 24 }} disabled={!canComplete} onClick={completeCash}>
              {b.cashSubmitting ? "Recording…" : "Complete sale"}
            </button>
          </div>
        ) : (
          <>
            <div className="pos-ph">
              <div className="pos-ph-head">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.isWest72 ? "/West72_Logos/W72_tech_icon_white.png" : "/VenueCore_Logos/VenueCore_Icon_White.png"} alt="" style={{ height: 22, width: "auto" }} />
                <div style={{ fontSize: 15, fontWeight: 800 }}>Box office</div>
                <span style={{ flex: 1 }} />
                {readerPill}
              </div>
              {b.selectedEvent && tab !== "more" && tab !== "drawer" && (
                <button type="button" className="pos-ph-show" onClick={() => setSheet("picker")}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.selectedEvent.title}</div>
                    <div style={{ fontSize: 13, color: "rgba(255,255,255,0.66)", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{showLine}</div>
                  </div>
                  <div style={{ fontSize: 13, textAlign: "right", color: "rgba(255,255,255,0.72)", whiteSpace: "nowrap" }}>
                    <div><b style={{ color: "#fff" }}>{door ? door.scannedIn + (door.guestsIn ?? 0) : "—"}</b> checked in</div>
                    <div style={{ marginTop: 3 }}><b style={{ color: "#fff" }}>{door?.doorTickets ?? "—"}</b> door sales</div>
                  </div>
                </button>
              )}

              {!eventId && tab !== "more" ? NoShow : tab === "sell" ? (
                <>
                  <div className="pos-ph-scroll">
                    {fullTier && tile(fullTier, true)}
                    <div className="pos-ph-pair">{rest.map((t) => tile(t))}</div>
                  </div>
                  <div className="pos-ph-edit">
                    <button type="button" disabled={!hasSale} onClick={clearSale}>Clear</button>
                    <button type="button" disabled={!history.length} onClick={undo}>Undo last</button>
                  </div>
                  {readerBanner ?? (
                    <button type="button" className="pos-ph-buyer" onClick={() => setSheet("buyer")}>
                      Buyer details <span className="pos-sub">{b.buyerName || b.buyerEmail ? "Added" : "Optional"}</span>
                      <span style={{ flex: 1 }} /><span style={{ color: "rgba(255,255,255,0.72)", fontWeight: 700 }}>{b.buyerName || b.buyerEmail ? "Edit" : "Add"}</span>
                    </button>
                  )}
                  {b.formError && <div className="pos-error">{b.formError}</div>}
                  <button type="button" className="pos-main pos-ph-charge" disabled={!hasSale || !readerReady || busy} onClick={charge}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>Charge reader</div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.78, marginTop: 2 }}>{hasSale ? `${qty} × ${tierLabel}` : "Tap a ticket"}</div>
                    </div>
                    <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em" }}>{card ? usd(card.totalCents) : hasSale ? "" : "$0.00"}</div>
                  </button>
                  <button type="button" className="pos-ph-cash" disabled={!hasSale} onClick={openCash}>
                    <span style={{ fontSize: 16, fontWeight: 750 }}>Cash</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, opacity: 0.7 }}>No fees</span>
                    <span style={{ flex: 1 }} />
                    <span style={{ fontSize: 21, fontWeight: 800 }}>{usd(dueCents)}</span>
                  </button>
                </>
              ) : tab === "scan" ? Scan : tab === "guests" ? Guests : tab === "drawer" ? Drawer : (
                <div className="pos-ph-scroll" style={{ gap: 10 }}>
                  <div className="pos-boxed">
                    {[
                      { label: "Drawer", sub: door ? `${money(door.cash.amount)} cash · ${door.cash.orders} sales` : "Cash this show", go: () => setTab("drawer") },
                      { label: "Card reader", sub: readerView.label, go: () => b.retryReader() },
                      { label: "Switch show", sub: b.selectedEvent?.title ?? "No show selected", go: () => setSheet("picker") },
                    ].map((m) => (
                      <button type="button" key={m.label} className="pos-row-btn" style={{ minHeight: 68 }} onClick={m.go}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 16, fontWeight: 750 }}>{m.label}</div>
                          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.62)", marginTop: 3 }}>{m.sub}</div>
                        </div>
                        <div style={{ fontSize: 18, color: "rgba(255,255,255,0.5)" }}>›</div>
                      </button>
                    ))}
                  </div>
                  <button type="button" className="pos-pill" style={{ minHeight: 56, color: "var(--bad-text)" }} onClick={onSignOut}>Sign out {staffName}</button>
                </div>
              )}
            </div>
            <div className="pos-tabs pos-ph-tabs" style={{ "--i": active } as React.CSSProperties}>
              <div className="pos-tabs-ind" />
              <div className="pos-tabs-row" role="tablist">
                {PHONE_TABS.map((t, i) => (
                  <button type="button" role="tab" key={t} aria-selected={i === active} onClick={() => goTab(t)} style={{ textTransform: "capitalize" }}>{t}</button>
                ))}
              </div>
            </div>
          </>
        )}
        {toast && <div className="pos-toast">{toast}</div>}
        {Sheets()}
      </div>
    );
  }

  // ── Laptop and tablet ────────────────────────────────────────────────────
  const DESK_TABS: Tab[] = ["sell", "scan", "guests", "drawer"];
  const doorSales = door?.doorSales ?? [];

  return (
    <div className="pos">
      <div className="pos-glow"><i /><i /></div>
      <header className="pos-top">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.isWest72 ? "/West72_Logos/W72_tech_icon_white.png" : "/VenueCore_Logos/VenueCore_Icon_White.png"} alt="" style={{ height: 26, width: "auto" }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.01em" }}>Box office</div>
            <div className="pos-sub" style={{ whiteSpace: "nowrap" }}>{b.isWest72 ? "West 72" : "VenueCore"} · {staffName}</div>
          </div>
        </div>
        <div className="pos-tabs" style={{ "--i": DESK_TABS.indexOf(tab) } as React.CSSProperties}>
          <div className="pos-tabs-ind" />
          <div className="pos-tabs-row" role="tablist">
            {DESK_TABS.map((t) => (
              <button type="button" role="tab" key={t} aria-selected={tab === t} onClick={() => goTab(t)} style={{ textTransform: "capitalize" }}>
                {t}{t === "scan" && <span className="pos-key">S</span>}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          {readerPill}
          <button type="button" className="pos-pill" onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      {b.selectedEvent && (
        <div className="pos-showwrap">
          <button type="button" className="pos-show" onClick={() => setSheet("picker")}>
            <div style={{ flex: "1 1 320px", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.025em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.selectedEvent.title}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.66)", whiteSpace: "nowrap" }}>Switch ›</div>
              </div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.70)", marginTop: 3 }}>{showLine}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {[
                ["Online", door?.online.tickets],
                ["At door", door?.doorTickets],
                ["Checked in", door ? door.scannedIn + (door.guestsIn ?? 0) : undefined],
                ["Cash", door ? money(door.cash.amount) : undefined],
              ].map(([k, v]) => (
                <div key={k as string} className="pos-stat"><div>{k}</div><div>{v ?? "—"}</div></div>
              ))}
            </div>
          </button>
        </div>
      )}

      <div className="pos-body">
        {!eventId ? NoShow : tab === "scan" ? Scan : tab === "guests" ? Guests : tab === "drawer" ? Drawer : (
          <div className="pos-cols">
            <div className="pos-panel">
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                  <div className="pos-eyebrow">Tickets</div>
                  <div className="pos-sub">{tierOptions.length} {tierOptions.length === 1 ? "tier" : "tiers"}</div>
                </div>
                <div className="pos-tiles">{tierOptions.map((t) => tile(t))}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <div className="pos-eyebrow" style={{ minWidth: 80 }}>Quantity</div>
                <div className="pos-stepper">
                  <button type="button" aria-label="One fewer" disabled={!hasSale || qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
                  <span>{qty}</span>
                  <button type="button" aria-label="One more" disabled={!hasSale} onClick={() => setQty(qty + 1)}>+</button>
                </div>
                <div className="pos-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="pos-key">1–9</span>sets quantity</div>
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
                  <div className="pos-eyebrow">Buyer</div>
                  <div className="pos-sub">Optional · an email sends the receipt</div>
                </div>
                <div className="pos-buyer"><BuyerFields b={b} /></div>
              </div>
              <div className="pos-recent">
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
                  <div className="pos-eyebrow">Door sales</div>
                  <div className="pos-sub">Newest first · resend, refund or void without leaving the till</div>
                </div>
                {doorSales.length > 0 ? (
                  <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                    {doorSales.map((r) => (
                      <div key={r.id} className="pos-recent-row">
                        <div style={{ color: "rgba(255,255,255,0.66)" }}>{clock(r.at)}</div>
                        <div style={{ fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.quantity} × {r.name}</div>
                        <div style={{ color: "rgba(255,255,255,0.70)", textTransform: "capitalize" }}>{r.tender}</div>
                        <div style={{ textAlign: "right", fontWeight: 800 }}>{money(r.amount)}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" className="pos-pill" disabled={!r.email || orderBusy} title={r.email ? `Send to ${r.email}` : "No email on this sale"} onClick={() => resend(r.id, r.email)}>Resend</button>
                          <button type="button" className="pos-pill" disabled={orderBusy} onClick={() => { setOrderNote(""); setOrderError(""); setOrderAction(r); }}>{r.tender === "cash" ? "Void" : "Refund"}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="pos-empty">
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 750 }}>No door sales yet</div>
                      <div style={{ fontSize: 13.5, color: "rgba(255,255,255,0.64)", marginTop: 4 }}>Each sale lands here as it happens.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="pos-panel pos-panel--sale">
              <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>This sale</div>
                <span style={{ flex: 1 }} />
                <button type="button" className="pos-pill" style={{ border: 0, boxShadow: "none", background: "none" }} disabled={!hasSale} onClick={clearSale}>Clear <span className="pos-key">Esc</span></button>
              </div>
              <div className="pos-mode">
                <i style={{ left: cash ? "50%" : "4px" }} />
                <div>
                  <button type="button" aria-pressed={!cash} onClick={() => b.setSaleType("card")}>Card {!cash && <span className="pos-key">C</span>}</button>
                  <button type="button" aria-pressed={cash} onClick={() => b.setSaleType("cash")}>Cash {cash && <span className="pos-key">C</span>}</button>
                </div>
              </div>

              {!hasSale ? (
                <div className="pos-empty" style={{ flex: 1 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>Pick a ticket to start</div>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,0.66)", marginTop: 6 }}>One tier per sale. Choose a tier on the left, then set the quantity.</div>
                  </div>
                </div>
              ) : (
                <div style={{ flex: "none" }}>
                  <div className="pos-line"><b>{qty} × {tierLabel}</b><span>{usd(dueCents)}</span></div>
                  {cash ? (
                    <div className="pos-line"><b>Fees<small>None on cash</small></b><span>$0.00</span></div>
                  ) : card ? (
                    <>
                      <div className="pos-line"><b>Fees<small>Service and facility</small></b><span>{usd(card.feesCents)}</span></div>
                      {card.taxCents > 0 && <div className="pos-line"><b>Tax</b><span>{usd(card.taxCents)}</span></div>}
                      <div className="pos-line"><b>Card processing</b><span>{usd(card.processingCents)}</span></div>
                    </>
                  ) : (
                    <div className="pos-line"><b>Fees and processing<small>The reader shows the final amount</small></b><span>—</span></div>
                  )}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12, paddingTop: 14 }}>
                    <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{cash ? "Cash due" : "Total"}</div>
                    <div style={{ fontSize: cash ? 40 : 48, fontWeight: 900, letterSpacing: "-0.04em" }}>{cash ? usd(dueCents) : card ? usd(card.totalCents) : "—"}</div>
                  </div>
                </div>
              )}

              {cash && hasSale && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: "none" }}>
                  <div className="pos-given">
                    <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.70)", whiteSpace: "nowrap" }}>They gave you</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "rgba(255,255,255,0.66)" }}>$</div>
                    <input
                      aria-label="They gave you"
                      data-submits="true"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={givenText}
                      onChange={(e) => { setGivenText(e.target.value); setGivenCents(parseCashInput(e.target.value)); }}
                    />
                  </div>
                  <div className="pos-chips" style={{ gridTemplateColumns: "repeat(5, minmax(0,1fr))" }}>
                    <button type="button" className="pos-chip" data-on={givenCents === dueCents} onClick={() => setGiven(dueCents)}>Exact</button>
                    {cashSuggestions(dueCents, 3).slice(0, 4).map((c) => (
                      <button type="button" key={c} className="pos-chip" data-on={givenCents === c} onClick={() => setGiven(c)}>${c / 100}</button>
                    ))}
                  </div>
                  <ChangeCard change={change} height={80} />
                </div>
              )}

              <span style={{ flex: 1 }} />
              {!cash && readerBanner}
              {b.formError && <div className="pos-error">{b.formError}</div>}
              <button
                type="button"
                className="pos-main"
                style={{ flex: "none", height: 76, fontSize: 20 }}
                disabled={cash ? !canComplete : !hasSale || !readerReady || busy}
                onClick={mainAction}
              >
                {cash
                  ? b.cashSubmitting ? "Recording…" : canComplete ? `Complete sale · give ${usd(change.cents)}` : "Complete sale"
                  : `Charge reader${card ? ` · ${usd(card.totalCents)}` : ""}`}
                <span className="pos-key">Enter</span>
              </button>
            </div>
          </div>
        )}
      </div>
      {toast && <div className="pos-toast">{toast}</div>}
      {Sheets()}
    </div>
  );
}

function Dialog({ children, onDim }: { children: ReactNode; onDim?: () => void }) {
  return (
    <>
      <div className="pos-dim" onClick={onDim} />
      <div className="pos-sheet" role="dialog" aria-modal="true">{children}</div>
    </>
  );
}

/** Next customer: already focused, so Enter starts the next sale. */
function AutoFocusButton({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <button type="button" ref={ref} {...rest}>{children}</button>;
}

function ChangeCard({ change, height }: { change: ReturnType<typeof changeDue>; height: number }) {
  return (
    <div className="pos-change" data-state={change.state} style={{ minHeight: height, flex: "none" }}>
      <b>{change.state === "short" ? "Still owed" : "Change due"}</b>
      <span>{change.state === "empty" ? "—" : usd(change.cents)}</span>
    </div>
  );
}

function BuyerFields({ b }: { b: PosBackend }) {
  return (
    <>
      <input className="pos-input" aria-label="Name" placeholder="Name" value={b.buyerName} onChange={(e) => b.setBuyerName(e.target.value)} />
      <input className="pos-input" aria-label="Email" type="email" placeholder="Email" value={b.buyerEmail} onChange={(e) => b.setBuyerEmail(e.target.value)} />
      <input className="pos-input" aria-label="Phone" type="tel" placeholder="Phone" value={b.buyerPhone} onChange={(e) => b.setBuyerPhone(e.target.value)} />
      <input className="pos-input" aria-label="ZIP" inputMode="numeric" placeholder="ZIP" value={b.buyerZip} onChange={(e) => b.setBuyerZip(e.target.value)} />
    </>
  );
}
