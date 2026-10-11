"use client";

/**
 * Payments to the artist — one list, used twice.
 *
 * The settlement's "Signature & payout" card uses it for payouts; the event
 * hub's Deal section uses it for deposits. They are the same act recorded the
 * same way — how much, when, how it was paid and what to search for in the
 * bank — so they are one component rather than two that drift. The only
 * difference is which endpoint it talks to and what it calls the money.
 *
 * Nothing here moves money. Every row is a record of a payment made
 * elsewhere, by ACH, cheque or cash.
 */

import { useState } from "react";
import { PAYMENT_METHODS } from "@/lib/types/settlement";

export type LedgerRow = {
  id: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  /** ISO timestamp (payouts) or a yyyy-mm-dd date (deposits). */
  when: string | null;
  by?: string | null;
  notes?: string | null;
};

const fmt = (n: number) =>
  "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A date or a timestamp, read as a local day — never shifted by a timezone. */
function day(v: string | null): string {
  if (!v) return "not paid yet";
  const iso = v.length <= 10 ? `${v}T12:00:00` : v;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Today in the browser's own timezone, for the date input's default. */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PaymentLedger({
  rows,
  owed,
  noun = "payment",
  addLabel,
  readOnly = false,
  busy = false,
  migrated = true,
  migrationNote,
  onAdd,
  onDelete,
}: {
  rows: LedgerRow[];
  /** What is still owed before anything in `rows` is counted. */
  owed: number;
  /** "payout" or "deposit" — what one row is called in the copy. */
  noun?: string;
  addLabel?: string;
  readOnly?: boolean;
  busy?: boolean;
  /** false once the migration is missing: the form is hidden, not broken. */
  migrated?: boolean;
  migrationNote?: string;
  onAdd?: (p: { amount: number; method: string; reference: string; when: string }) => void;
  onDelete?: (id: string) => void;
}) {
  const paid = Math.round(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0) * 100) / 100;
  const remaining = Math.round((owed - paid) * 100) / 100;

  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<string>("ACH");
  const [reference, setReference] = useState("");
  const [when, setWhen] = useState(todayLocal());
  // Blank, not pre-filled with the remaining balance: the old card hard-wired
  // the amount to the whole balance due, which is exactly why a part payment
  // had nowhere to go. The remaining figure is offered as a one-click fill
  // instead, so paying in full is still one gesture.
  const [amount, setAmount] = useState("");

  const entered = Math.round((Number(amount) || 0) * 100) / 100;
  // Any amount beyond what is left, including every amount when nothing is
  // left. The `remaining > 0` this used to carry meant a payment against an
  // already-settled balance passed in silence -- the one case where a warning
  // matters most, because it is usually the second entry of the same cheque.
  const over = entered > remaining + 0.005;

  const submit = () => {
    if (!(entered > 0) || !onAdd) return;
    onAdd({ amount: entered, method, reference: reference.trim(), when });
    setAmount("");
    setReference("");
    setOpen(false);
  };

  return (
    <div className="pledger">
      {/* The big number is always the figure that matters right now: what is
          left to pay while something is, what was paid once it is settled,
          and the excess when there is one. Showing $0.00 under "Paid in full"
          put a zero where the money should be. */}
      <div className="pledger-head">
        <span>
          {remaining > 0.004 ? "Still owed" : remaining < -0.004 ? "Overpaid by" : paid > 0 ? "Paid in full" : "Nothing due"}
        </span>
        <b className={remaining < -0.004 ? "is-over" : undefined}>
          {fmt(remaining > 0.004 ? remaining : remaining < -0.004 ? -remaining : paid)}
        </b>
      </div>
      {paid > 0 && (
        <div className="pledger-sub">
          {fmt(paid)} paid across {rows.length} {rows.length === 1 ? noun : `${noun}s`} · {fmt(owed)} owed in all
        </div>
      )}

      {rows.length > 0 && (
        <ul className="pledger-rows">
          {rows.map((r) => (
            <li key={r.id} className={r.when ? undefined : "is-unpaid"}>
              <span className="pledger-amt">{fmt(r.amount)}</span>
              <span className="pledger-meta">
                {[r.method || "method not noted", r.reference || null, day(r.when), r.by ? `by ${r.by}` : null]
                  .filter(Boolean)
                  .join(" · ")}
                {r.notes ? <i>{r.notes}</i> : null}
              </span>
              {!readOnly && onDelete && (
                <button
                  type="button"
                  className="pledger-del"
                  disabled={busy}
                  aria-label={`Remove this ${noun}`}
                  onClick={() => {
                    if (confirm(`Remove this ${noun} of ${fmt(r.amount)}? It stops counting against what is owed.`)) {
                      onDelete(r.id);
                    }
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!migrated ? (
        <div className="pledger-note">{migrationNote}</div>
      ) : readOnly ? null : !open ? (
        <button type="button" className="pledger-add" disabled={busy} onClick={() => setOpen(true)}>
          {addLabel ?? `+ Record a ${noun}`}
        </button>
      ) : (
        <div className="pledger-form">
          <div className="pledger-form-row">
            <label>
              <span>Amount</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                autoFocus
                placeholder="0.00"
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
            <label>
              <span>Date paid</span>
              <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} />
            </label>
          </div>
          <div className="pledger-form-row">
            <label>
              <span>Method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Reference</span>
              <input
                value={reference}
                placeholder="Cheque no., transfer id"
                onChange={(e) => setReference(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
          </div>
          {remaining > 0.004 && (
            <button type="button" className="pledger-fill" onClick={() => setAmount(remaining.toFixed(2))}>
              Pay the rest · {fmt(remaining)}
            </button>
          )}
          {over && (
            <div className="pledger-warn">
              {remaining > 0.004
                ? <>That is {fmt(entered - remaining)} more than is still owed.</>
                : <>Nothing is still owed here{paid > 0 ? `, ${fmt(paid)} has already been recorded` : ""}. Check this is not a {noun} already entered.</>}
              {" "}Recorded anyway if that is right.
            </div>
          )}
          <div className="pledger-form-cta">
            <button type="button" className="pledger-save" disabled={busy || !(entered > 0)} onClick={submit}>
              {busy ? "Saving…" : `Record ${fmt(entered)}`}
            </button>
            <button type="button" className="pledger-cancel" onClick={() => setOpen(false)}>Cancel</button>
          </div>
          <div className="pledger-note">
            Records a payment made elsewhere — by ACH, cheque or cash. Nothing here moves money.
          </div>
        </div>
      )}
    </div>
  );
}
