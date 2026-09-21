"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTabParam } from "@/lib/admin/useTabParam";
import { useAdminNav } from "@/app/components/admin/AdminNavContext";
import { fmtUSD } from "@/app/components/admin/ui";
import { REFUND_REASONS, refundBlocker, type RefundReason } from "@/lib/orders/refundPolicy";
import ByShow from "./_panels/ByShow";

/**
 * Orders & refunds — handoff/screens/orders.dc.html.
 *
 * One cross-event order book: support questions arrive by name, email or a
 * Stripe receipt, not by show, so the search covers every order. The old
 * sales-by-show list is the second tab, unchanged.
 *
 * Refunds follow the house policy (lib/orders/refundPolicy.ts), not the
 * mockup: only for a cancelled show or a glitch on our side, always the full
 * all-in amount, never for cash. The route enforces the same rule, so this
 * page only shows the answer before anyone presses the button.
 */

const VIEWS = [
  { key: "book", label: "Order book" },
  { key: "shows", label: "By show" },
] as const;

const SCOPES = [
  { key: "all", label: "All orders" },
  { key: "refunds", label: "Refunds" },
  { key: "comps", label: "Comps" },
] as const;

type Row = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  quantity: number | string | null;
  total_amount: number | null;
  status: string;
  source: string | null;
  created_at: string;
  event_id: string;
  events: { title: string; date: string } | null;
};

type Detail = {
  order: Row & {
    notes: string | null;
    stripe_payment_intent_id: string | null;
    utm_source: string | null;
    events: { id: string; title: string; date: string; venue: string | null; booking_status: string | null };
  };
  tickets: { id: string; qr_code: string; is_scanned: boolean; scanned_at: string | null }[];
  ledger: {
    type: string;
    gross_amount: number;
    ticket_revenue: number;
    ticketing_fee: number;
    facility_fee: number;
    tax_collected: number;
    stripe_fee: number;
    net_to_venue: number;
  }[];
};

const shortId = (id: string) => id.slice(0, 8).toUpperCase();
const when = (d: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) =>
  new Date(d).toLocaleString("en-US", opts);

function stateOf(o: Pick<Row, "status" | "source" | "total_amount">): { label: string; tone: string } {
  if (o.status === "refunded") return { label: "Refunded", tone: "bad" };
  if (o.source === "comp") return { label: "Comp", tone: "quiet" };
  if (o.source === "cash") return { label: "Paid · cash", tone: "good" };
  if (o.status === "paid") return { label: "Paid", tone: "good" };
  return { label: o.status, tone: "quiet" };
}

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersInner />
    </Suspense>
  );
}

function OrdersInner() {
  // Artists see only their assigned shows — the "By show" list already
  // scopes to those; the cross-show book isn't theirs to search.
  const { role } = useAdminNav();
  const views = role === "artist" ? VIEWS.filter((v) => v.key === "shows") : VIEWS;
  const [view, setView] = useTabParam(views.map((v) => v.key));
  return (
    <div className="admin-form-page ee-page">
      {views.length > 1 && (
      <div className="merged-tabs ee-tabs" role="tablist">
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            className={`merged-tab${view === v.key ? " is-on" : ""}`}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>
      )}
      {view === "shows" ? <ByShow /> : <OrderBook />}
    </div>
  );
}

function OrderBook() {
  // The event workspace links here with ?event_id= to show one show's orders.
  const eventId = useSearchParams().get("event_id");
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<(typeof SCOPES)[number]["key"]>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ scope });
    if (q.trim()) params.set("q", q.trim());
    if (eventId) params.set("event_id", eventId);
    setLoading(true);
    return fetch(`/api/admin/orders?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data.orders) ? data.orders : []);
        setTotal(data.total ?? 0);
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [q, scope, eventId]);

  // Debounced so typing a name doesn't fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <>
      <div className="card ee-state ob-head">
        <div className="ee-state-text">
          <span className="ee-eyebrow">One order book{eventId ? " · one show" : ", every show"}</span>
          <div className="ee-state-title">
            <h1 className="admin-page-title">Orders &amp; refunds</h1>
          </div>
          <p className="ee-state-body">
            Find any order by name, email, order number or Stripe payment id. A refund is issued here, and only for a
            cancelled show or a glitch on our side — always the full amount the buyer paid.
          </p>
          <div className="ob-search-row">
            <label className="ob-search">
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, email, order number or pi_…"
                aria-label="Search orders"
              />
            </label>
            <div className="merged-tabs ob-scopes" role="tablist">
              {SCOPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={scope === s.key}
                  className={`merged-tab${scope === s.key ? " is-on" : ""}`}
                  onClick={() => setScope(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {eventId && (
              <Link href="/admin/orders" className="btn">
                All shows
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="ee-grid ob-grid">
        <section className="card ee-card">
          <span className="ee-eyebrow">
            {loading ? "Searching…" : `${total.toLocaleString()} order${total === 1 ? "" : "s"}${total > rows.length ? ` · showing ${rows.length}` : ""}`}
          </span>
          <div className="ob-rows">
            {!loading && rows.length === 0 && <p className="ee-field-note">No orders match.</p>}
            {rows.map((o) => {
              const st = stateOf(o);
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`ob-row${selected === o.id ? " is-on" : ""}`}
                  onClick={() => setSelected(o.id)}
                >
                  <span className="ob-row-main">
                    <span className="ob-row-who">
                      <strong>{o.customer_name || "—"}</strong>
                      <em>{shortId(o.id)}</em>
                    </span>
                    <span className="ob-row-show">
                      {o.events ? `${o.events.title} · ${when(o.events.date, { month: "short", day: "numeric" })}` : ""}
                    </span>
                  </span>
                  <span className="ob-row-money">
                    <strong>{fmtUSD(Number(o.total_amount) || 0)}</strong>
                    <span className={`ob-tone-${st.tone}`}>{st.label}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="ee-rail">
          {selected ? (
            <OrderDetail key={selected} orderId={selected} onRefunded={load} />
          ) : (
            <section className="card ee-card">
              <span className="ee-eyebrow">Order detail</span>
              <p className="ee-field-note">Pick an order to see its money, its tickets and whether it can be refunded.</p>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}

function OrderDetail({ orderId, onRefunded }: { orderId: string; onRefunded: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState<RefundReason | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [done, setDone] = useState("");

  const load = useCallback(() => {
    fetch(`/api/admin/orders/${orderId}`)
      .then((r) => r.json())
      .then((data) => (data.error ? setError(data.error) : setD(data)))
      .catch(() => setError("Failed to load order"));
  }, [orderId]);
  useEffect(load, [load]);

  if (error) return <div className="admin-form-error">{error}</div>;
  if (!d) {
    return (
      <section className="card ee-card">
        <p className="ee-field-note">Loading order…</p>
      </section>
    );
  }

  const { order, tickets, ledger } = d;
  const total = Number(order.total_amount) || 0;
  const sale = ledger.find((l) => l.type === "sale");
  const refundRows = ledger.filter((l) => l.type !== "sale");
  const blocker = refundBlocker(order, order.events, reason);
  const reasonNeeded = !reason && order.status !== "refunded" && order.source !== "cash";

  const refund = async () => {
    if (!reason) return;
    if (
      !confirm(
        `Refund ${fmtUSD(total)} to ${order.customer_name || "this buyer"}?\n\n` +
          `Reason: ${REFUND_REASONS[reason]}\n\n` +
          "The full amount goes back to their card, the tickets stop scanning, and any seats are released. This can't be undone."
      )
    )
      return;
    setRefunding(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Refund failed");
      setDone(`Refunded ${fmtUSD(total)}. The ledger reversal lands when Stripe confirms.`);
      load();
      onRefunded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setRefunding(false);
    }
  };

  const lines: [string, number][] = sale
    ? [
        ["Face value", sale.ticket_revenue],
        ["Service fee", sale.ticketing_fee],
        ["Facility fee", sale.facility_fee],
        ["Sales tax", sale.tax_collected],
        ["Card surcharge", Math.max(0, sale.gross_amount - sale.ticket_revenue - sale.ticketing_fee - sale.facility_fee - sale.tax_collected)],
      ]
    : [];

  return (
    <>
      <section className="card ee-card">
        <span className="ee-eyebrow">Order detail</span>
        <dl className="ob-detail">
          <div><dt>Order</dt><dd>{shortId(order.id)}</dd></div>
          <div><dt>Buyer</dt><dd>{[order.customer_name, order.customer_email?.includes("@noemail.") ? null : order.customer_email].filter(Boolean).join(" · ") || "—"}</dd></div>
          <div><dt>Show</dt><dd>{order.events.title} · {when(order.events.date, { month: "short", day: "numeric", year: "numeric" })}</dd></div>
          <div><dt>Placed</dt><dd>{when(order.created_at)} · {order.source || "online"}</dd></div>
          {order.utm_source && <div><dt>Source</dt><dd>{order.utm_source}</dd></div>}
          {order.stripe_payment_intent_id && <div><dt>Payment</dt><dd className="ob-mono">{order.stripe_payment_intent_id}</dd></div>}
        </dl>

        <span className="ee-eyebrow ob-sub">Money</span>
        <dl className="ee-money-rows">
          {lines.filter(([, v]) => v).map(([label, v]) => (
            <div key={label}><dt>{label}</dt><dd>{fmtUSD(v)}</dd></div>
          ))}
          <div><dt>Charged</dt><dd>{fmtUSD(sale ? sale.gross_amount : total)}</dd></div>
          {refundRows.map((r, i) => (
            <div key={i}><dt>Refunded</dt><dd className="ob-tone-bad">{fmtUSD(r.gross_amount)}</dd></div>
          ))}
        </dl>

        <span className="ee-eyebrow ob-sub">Tickets · {tickets.length}</span>
        <ul className="ob-tickets">
          {tickets.map((t) => (
            <li key={t.id}>
              <span className="ob-mono">{t.qr_code.slice(0, 8).toUpperCase()}</span>
              <span className={t.is_scanned ? "ob-tone-good" : ""}>
                {order.status === "refunded"
                  ? "Void — refunded"
                  : t.is_scanned
                  ? `Scanned${t.scanned_at ? ` · ${when(t.scanned_at, { hour: "numeric", minute: "2-digit" })}` : ""}`
                  : "Valid · not yet scanned"}
              </span>
            </li>
          ))}
        </ul>
        <Link href={`/admin/orders/${order.event_id}/${order.id}`} className="ee-action ob-full">
          <strong>Open the full order</strong>
          <span>Resend tickets, correct a payment, notes.</span>
        </Link>
      </section>

      <section className="card ee-card">
        <span className="ee-eyebrow">Refund</span>
        {order.status === "refunded" ? (
          <p className="ee-field-note">This order has been refunded.</p>
        ) : order.source === "cash" ? (
          <p className="ee-field-note">{refundBlocker(order, order.events, "glitch")}</p>
        ) : (
          <>
            <p className="ee-state-body">
              Only for a cancelled show or something that went wrong on our side, and always all-in: the buyer gets back
              everything they paid — {fmtUSD(total)}. The tickets stop scanning and any seats go back on sale.
            </p>
            <div className="ob-reasons" role="radiogroup" aria-label="Refund reason">
              {(Object.keys(REFUND_REASONS) as RefundReason[]).map((r) => (
                <label key={r} className={`ob-reason${reason === r ? " is-on" : ""}`}>
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                  <span>{REFUND_REASONS[r]}</span>
                </label>
              ))}
            </div>
            {blocker && !reasonNeeded && <p className="ee-field-note ob-tone-warn">{blocker}</p>}
            <button type="button" className="btn ob-refund-btn" onClick={refund} disabled={!!blocker || refunding}>
              {refunding ? "Refunding…" : `Refund ${fmtUSD(total)} — all-in`}
            </button>
          </>
        )}
        {done && <p className="ee-field-note ob-tone-good">{done}</p>}
        {error && <div className="admin-form-error">{error}</div>}
      </section>
    </>
  );
}
