"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

/**
 * INVOICES — the mockup's `invoice` screen, as far as the data goes.
 *
 * ── WHY THIS SCREEN DID NOT EXIST ─────────────────────────────────────────
 * `invoices` has a full API (`/api/invoices`, `[id]`, `/checkout`,
 * `/payments`), a Stripe payment link, and a customer-facing page at
 * `/pay/[invoiceId]`. Invoices could be raised from the private-event screen
 * and paid by a client — but there was nowhere to see them all. Receivables
 * only existed one event at a time.
 *
 * ── WHAT THE MOCKUP ASKS FOR AND DOES NOT GET ─────────────────────────────
 * Deposit schedules, trust accounting, and "final invoice — actuals reconciled
 * to BEO" need a deposit schedule table and a BEO document, neither of which
 * exists. The collections panel's "apply 1.5%/mo late terms & re-issue" needs
 * late-fee terms on the invoice; there is no such column. Aging is real and
 * computed from `due_date`, so that is what is here.
 */

type Invoice = {
  id: string;
  invoice_number: string | null;
  client_name: string | null;
  client_company: string | null;
  event_id: string | null;
  total: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  due_date: string | null;
  status: string | null;
  sent_at: string | null;
  created_at: string;
};

const money = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole days a due date is past, in venue-local terms. Negative = not yet due. */
function daysOverdue(due: string | null): number {
  if (!due) return 0;
  const d = new Date(`${due.slice(0, 10)}T00:00:00`);
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t.getTime() - d.getTime()) / 86_400_000);
}

export default function AdminInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    const venueId = getCookie("venue-id");
    return fetch(`/api/invoices${venueId ? `?venue_id=${venueId}` : ""}`)
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) { setDenied(true); return; }
        if (!r.ok) return;
        const d = await r.json();
        if (Array.isArray(d)) setInvoices(d);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Move an invoice between the states a person actually decides.
   *
   * draft / sent / void are human calls: has it gone out, is it cancelled.
   * PAID is not — it is arithmetic, and the rest of this page already treats
   * it that way ("status is set by hand and drifts; the balance is
   * arithmetic"). Flipping the label to paid while balance_due still reads
   * $2,226.57 would put this list, the client's payment page and the
   * dashboard into three different opinions about the same invoice.
   *
   * So choosing Paid records the outstanding balance as a payment through
   * the endpoint that already exists. That writes the invoice_payments row,
   * sets amount_paid, zeroes the balance, sets paid_at and derives the
   * status — the same path a Stripe payment takes, so a cheque and a card
   * land in the same place with the same audit trail.
   */
  const setStatus = async (inv: Invoice, next: string) => {
    setBusyId(inv.id);
    setNote("");
    try {
      if (next === "paid") {
        const balance = Number(inv.balance_due || 0);
        if (balance <= 0) { setNote("That invoice has no balance left."); return; }
        const res = await fetch(`/api/invoices/${inv.id}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: balance,
            payment_method: "other",
            notes: "Marked paid from the invoice list",
          }),
        });
        if (!res.ok) throw new Error();
        setNote(`${inv.invoice_number || "Invoice"} marked paid — ${money(balance)} recorded.`);
      } else {
        const res = await fetch(`/api/invoices/${inv.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: next,
            // Stamp the first send so "average days to collect" has a start
            // point. Never overwritten — re-sending does not reset the clock.
            ...(next === "sent" && !inv.sent_at ? { sent_at: new Date().toISOString() } : {}),
          }),
        });
        if (!res.ok) throw new Error();
        setNote(
          next === "sent"
            ? `${inv.invoice_number || "Invoice"} marked sent — it counts as a receivable now.`
            : `${inv.invoice_number || "Invoice"} set to ${next}.`,
        );
      }
      await load();
    } catch {
      setNote("Could not change that invoice.");
    } finally {
      setBusyId(null);
    }
  };

  const totals = useMemo(() => {
    // An invoice with no balance is not a receivable, whatever its status
    // says — status is set by hand and drifts; the balance is arithmetic.
    const open = invoices.filter((i) => Number(i.balance_due || 0) > 0);
    const outstanding = open.reduce((s, i) => s + Number(i.balance_due || 0), 0);
    const collected = invoices.reduce((s, i) => s + Number(i.amount_paid || 0), 0);
    const buckets = { current: 0, d30: 0, d60: 0, d90: 0, over: 0 };
    for (const i of open) {
      const d = daysOverdue(i.due_date);
      const amt = Number(i.balance_due || 0);
      if (d <= 0) buckets.current += amt;
      else if (d <= 30) buckets.d30 += amt;
      else if (d <= 60) buckets.d60 += amt;
      else if (d <= 90) buckets.d90 += amt;
      else buckets.over += amt;
    }
    const past60 = buckets.d90 + buckets.over;
    return { open, outstanding, collected, buckets, past60 };
  }, [invoices]);

  if (denied) {
    return (
      <div className="admin-form-page inv">
        <h1 className="admin-page-title">Invoices</h1>
        <div className="inv-kpi" style={{ maxWidth: 460, marginTop: 16 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: 0, lineHeight: 1.5 }}>
            Invoices carry client contact details and balances, so the list is staff-only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-form-page inv">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Invoices</h1>
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.42)", margin: "4px 0 0", maxWidth: 580, lineHeight: 1.5 }}>
            Every receivable in one place. Aging is computed from the due date, and an
            invoice counts as outstanding when it has a balance — not when its status
            field says so, because that is set by hand and drifts.
          </p>
        </div>
      </div>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading invoices…</p>}

      {!loading && invoices.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No invoices yet. They are raised from a private event.
        </p>
      )}

      {!loading && invoices.length > 0 && (
        <>
          <div className="inv-kpis" style={{ marginTop: 16 }}>
            <div className="inv-kpi">
              <div className="inv-kpi-label">Outstanding</div>
              <div className="inv-kpi-value">{money(totals.outstanding)}</div>
              <div className="inv-kpi-sub">{totals.open.length} open invoice{totals.open.length === 1 ? "" : "s"}</div>
            </div>
            <div className="inv-kpi">
              <div className="inv-kpi-label">Collected</div>
              <div className="inv-kpi-value" style={{ color: "#8fd6a8" }}>{money(totals.collected)}</div>
              <div className="inv-kpi-sub">across {invoices.length} invoice{invoices.length === 1 ? "" : "s"}</div>
            </div>
            <div className="inv-kpi">
              <div className="inv-kpi-label">Past 60 days</div>
              <div className="inv-kpi-value" style={{ color: totals.past60 > 0 ? "#f87171" : "#fff" }}>{money(totals.past60)}</div>
              <div className="inv-kpi-sub">the collections conversation</div>
            </div>
          </div>

          <div className="inv-kpi" style={{ marginTop: 14 }}>
            <div className="inv-kpi-label" style={{ marginBottom: 12 }}>Aging</div>
            <div className="inv-aging">
              {[
                { label: "Current", value: totals.buckets.current, late: false },
                { label: "1–30", value: totals.buckets.d30, late: false },
                { label: "31–60", value: totals.buckets.d60, late: false },
                { label: "61–90", value: totals.buckets.d90, late: true },
                { label: "90+", value: totals.buckets.over, late: true },
              ].map((b) => (
                <div key={b.label} className={`inv-bucket ${b.late && b.value > 0 ? "inv-bucket--late" : ""}`}>
                  <div className="inv-bucket-label">{b.label}</div>
                  <div className="inv-bucket-value">{money(b.value)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="inv-head" style={{ marginTop: 20 }}>
            <div>Invoice</div>
            <div>Client</div>
            <div>Total</div>
            <div>Paid</div>
            <div>Due</div>
            <div>Status</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {invoices.map((i) => {
              const over = daysOverdue(i.due_date);
              const balance = Number(i.balance_due || 0);
              const status = balance <= 0 ? "paid" : over > 0 ? "overdue" : (i.status || "draft").toLowerCase();
              // The stored status is what a person set. Paid and overdue are
              // arithmetic, so the select shows them but does not pretend
              // they were chosen.
              const stored = (i.status || "draft").toLowerCase();
              const derived = balance <= 0 ? "paid" : stored === "partial" ? "partial" : null;
              return (
                // No longer one big Link: a select inside an anchor fights the
                // navigation on every click.
                <div key={i.id} className="inv-row">
                  <Link href={`/pay/${i.id}`} target="_blank" className="inv-no">{i.invoice_number || "—"}</Link>
                  <Link href={`/pay/${i.id}`} target="_blank" style={{ minWidth: 0 }}>
                    <div className="inv-who">{i.client_company || i.client_name || "—"}</div>
                    <div className="inv-meta">
                      {i.due_date ? `Due ${new Date(`${i.due_date.slice(0,10)}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No due date"}
                      {over > 0 && balance > 0 && ` · ${over} day${over === 1 ? "" : "s"} past`}
                    </div>
                  </Link>
                  <div className="inv-num">{money(Number(i.total || 0))}</div>
                  <div className="inv-num">{money(Number(i.amount_paid || 0))}</div>
                  <div className="inv-num inv-num--due">{money(balance)}</div>
                  <select
                    className={`inv-status inv-status--${status} inv-status-pick`}
                    value={derived ?? stored}
                    disabled={busyId === i.id}
                    onChange={(e) => setStatus(i, e.target.value)}
                    title={
                      derived === "paid"
                        ? "Paid in full — set by the payments on it, not by hand"
                        : over > 0 && balance > 0
                          ? `Overdue by ${over} day${over === 1 ? "" : "s"}`
                          : "Where this invoice has got to"
                    }
                  >
                    <option value="draft">draft</option>
                    <option value="sent">sent</option>
                    <option value="paid">paid</option>
                    <option value="void">void</option>
                    {/* Reached by a part payment, never chosen. */}
                    {derived === "partial" && <option value="partial" disabled>partial</option>}
                  </select>
                </div>
              );
            })}
          </div>

          {note && <p className="inv-note">{note}</p>}

          <p style={{ fontSize: 10.5, color: "rgba(255,255,255,0.34)", marginTop: 14, lineHeight: 1.5, maxWidth: 640 }}>
            The number or the client opens their own payment page — the same link they were sent.
            Marking one <strong>paid</strong> records the outstanding balance as a payment, so the
            list, the dashboard and that page cannot disagree about it.
            Deposit schedules, trust accounting and BEO reconciliation are in the design
            but have no tables behind them yet, so they are not drawn here.
          </p>
        </>
      )}
    </div>
  );
}
