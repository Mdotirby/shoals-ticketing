"use client";

import { Suspense, useEffect, useState } from "react";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { leaveIfWrongHost } from "@/lib/auth/hostRedirect";
import { getCookie } from "@/lib/cookies";
import { isEventToday, safeDate } from "@/lib/dates";
import { stripeAppearance } from "@/lib/stripeAppearance";
import ManualPayForm from "./ManualPayForm";
import PosApp from "./pos/PosApp";
import { clock, money, useBoxOffice } from "./useBoxOffice";
import TicketScanner, { type ScannerButton } from "@/app/components/scan/TicketScanner";

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

      if (authData.session) {
        const hostCheck = await leaveIfWrongHost(authData.session.access_token);
        if (hostCheck.redirecting) return;
        if (hostCheck.error) { setError(hostCheck.error); setLoading(false); return; }
      }

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

// ── Box Office Content ────────────────────────────────────────────────────────

function BoxOfficeContent({ staffName, onSignOut }: { staffName: string; onSignOut: () => void }) {
  const {
    events,
    tiers,
    selectedEventId,
    setSelectedEventId,
    selectedTierId,
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
    loadingTiers,
    cashSubmitting,
    cashSuccess,
    keyBuffer,
    scanOpen,
    setScanOpen,
    terminalRef,
    terminalStatus,
    readers,
    connectedReader,
    terminalError,
    payStage,
    payElapsed,
    issueWarning,
    door,
    guests,
    checkingIn,
    counted,
    setCounted,
    showManual,
    creatingManualIntent,
    manualClientSecret,
    manualPaymentIntentId,
    isWest72,
    discoverReaders,
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
    cancelTerminalPay,
    handleTerminalPay,
    handleManualPay,
    handleCashSale,
    toggleGuest,
    resetSale,
    reader,
    readerOk,
    readerIdentity,
    readerMeta,
    PAY_STEPS,
    payStepIndex,
    paymentRunning,
    overShort,
  } = useBoxOffice();

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
          <button
            onClick={() => setScanOpen(true)}
            className="bo-pill"
            style={{ padding: "6px 12px", minHeight: 36, fontSize: 11 }}
            disabled={!selectedEventId || paymentRunning}
            title={!selectedEventId ? "Pick a show first" : paymentRunning ? "Finish this payment first" : undefined}
          >
            Scan tickets
          </button>
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
              {/* The show is picked from a chip in the card header, as in
                  boxoffice.dc.html — the tiles and keypad are the card. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div className="bo-eyebrow">Sell at the door</div>
                <span style={{ flex: 1 }} />
              <select
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
                className="bo-event-chip"
                aria-label="Show"
                disabled={loadingEvents}
              >
                <option value="">{loadingEvents ? "Loading events…" : "— Select event —"}</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {isEventToday(e.date) ? "Tonight" : safeDate(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </option>
                ))}
              </select>
              </div>

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
                  {tiers.map((tier) => {
                    const locked = isTierLocked(tier);
                    return (
                      <button
                        key={tier.id}
                        type="button"
                        className="bo-tile"
                        aria-pressed={selectedTierId === tier.id}
                        disabled={locked}
                        title={locked ? "Needs its unlock code" : undefined}
                        onClick={() => pickTier(tier.id)}
                      >
                        <span className="bo-tile-name">{locked ? `🔒 ${tier.tier_name}` : tier.tier_name}</span>
                        <span style={{ flex: 1 }} />
                        <span className="bo-tile-price">{money(tier.price)}</span>
                        <span className="bo-tile-avail">
                          {locked
                            ? "code required"
                            : tier.capacity != null
                              ? `${Math.max(0, tier.capacity - (tier.sold ?? 0))} left`
                              : " "}
                        </span>
                      </button>
                    );
                  })}
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

              {hasLockedTier && (
                <div className="bo-unlock">
                  <input
                    type="text"
                    value={tierCodeInput}
                    placeholder="Unlock code"
                    aria-label="Tier unlock code"
                    onChange={(e) => { setTierCodeInput(e.target.value); setTierCodeError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitTierCode(); } }}
                  />
                  <button type="button" onClick={submitTierCode} disabled={!tierCodeInput.trim()}>Unlock</button>
                  {tierCodeError && <span className="bo-unlock-error">{tierCodeError}</span>}
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

        </div>

        {/* ══ Not in the mockup — tonight's numbers, the guest list and the
            drawer count. Kept, collapsed under the till. ══ */}
        <details className="bo-more">
          <summary>
            <span className="bo-eyebrow">Tonight at the door</span>
            <span className="bo-note">door totals · comps &amp; guest list · drawer &amp; reconcile</span>
          </summary>
          <div className="bo-more-body">
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
        </details>
      </div>
      {/* Over the POS, not instead of it: the reader stays connected and a sale
          in progress is still there when this closes. */}
      {scanOpen && selectedEvent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Scan tickets"
          style={{ position: "fixed", inset: 0, zIndex: 9000, overflowY: "auto", background: "var(--bo-ink)", padding: "14px 16px 40px" }}
        >
          <div style={{ maxWidth: 680, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--bo-w)" }}>{selectedEvent.title}</div>
                <div className="bo-sub">
                  {isEventToday(selectedEvent.date) ? "Tonight" : safeDate(selectedEvent.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {door ? ` · ${door.scannedIn} checked in` : ""}
                </div>
              </div>
              <span style={{ flex: 1 }} />
              <button
                className="bo-pill"
                style={{ minHeight: 44, padding: "8px 16px", whiteSpace: "nowrap" }}
                onClick={() => { setScanOpen(false); refreshDoor(); }}
              >
                Back to sales
              </button>
            </div>
            <TicketScanner eventId={selectedEventId} autoStart onScanned={refreshDoor} Btn={ScanButton} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page root ─────────────────────────────────────────────────────────────────

const ScanButton: ScannerButton = ({ onClick, children }) => (
  <button type="button" className="bo-pill" style={{ minHeight: 44, padding: "8px 18px" }} onClick={onClick}>{children}</button>
);

export default function BoxOfficePage() {
  // The new POS is the till. ?pos=old puts this device back on the previous one
  // if something goes wrong on the night, and ?pos=new returns it.
  const [newPos, setNewPos] = useState(true);
  useEffect(() => {
    try {
      const want = new URLSearchParams(window.location.search).get("pos");
      if (want === "old") localStorage.setItem("box-office-pos", "old");
      if (want === "new") localStorage.removeItem("box-office-pos");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is browser-only
      setNewPos(localStorage.getItem("box-office-pos") !== "old");
    } catch { /* private window: the new till */ }
  }, []);

  const [authState, setAuthState] = useState<"loading" | "login" | "ready">("loading");
  const [staffName, setStaffName] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(async ({ data }: { data: { user: import("@supabase/supabase-js").User | null } }) => {
      if (!data?.user) { setAuthState("login"); return; }
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        const hostCheck = await leaveIfWrongHost(sessionData.session.access_token);
        if (hostCheck.redirecting) return;
        if (hostCheck.error) { setAuthState("login"); return; }
      }
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
      {newPos
        ? <PosApp staffName={staffName} onSignOut={handleSignOut} />
        : <BoxOfficeContent staffName={staffName} onSignOut={handleSignOut} />}
    </Suspense>
  );
}
