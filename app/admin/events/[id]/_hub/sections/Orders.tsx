"use client";

/**
 * Orders — eventhub.dc.html ?tab=orders. Every order for this show from
 * every place it sold: search, filter by source, open one in the drawer to
 * see its tickets and history and to refund, resend or transfer it; and the
 * revenue breakdown beside it. Replaces the workspace Orders tab and the
 * Event Sales page (/admin/orders/[id]).
 *
 * Production's rules hold here exactly as on the order page:
 *   • A refund is the whole order, all-in, by card, for one of two reasons —
 *     our mistake or a cancelled show (lib/orders/refundPolicy). There is no
 *     partial refund to offer.
 *   • Transfer moves the order and its tickets to a new name and email
 *     (PATCH …/customer) and sends the tickets there.
 * The full order page stays one click away for seat repair and payment
 * requests.
 */

import { useEffect, useMemo, useState } from "react";
import { fmtUSD } from "@/app/components/admin/ui";
import { useHub } from "../HubContext";
import { HubActions } from "../HubShell";
import { HubDrawer, HubEmpty, HubLoading } from "../ui";
import { useEventOrders, type HubOrder } from "../useEventData";

const SRC: Record<string, string> = {
  online: "Online", inline_checkout: "Online", box_office: "Box office", terminal: "Terminal", cash: "Cash", comp: "Comp",
};
const srcOf = (o: HubOrder) => SRC[o.source || "online"] ?? (o.source || "Online").replace(/_/g, " ");
const CHIPS = ["All", "Online", "Box office", "Terminal", "Comp"];
const STATE: Record<string, { label: string; tone: string }> = {
  paid: { label: "Paid", tone: "good" },
  refunded: { label: "Refunded", tone: "dim" },
  pending: { label: "Pending", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
  cancelled: { label: "Cancelled", tone: "dim" },
};
const ref = (id: string) => id.replace(/-/g, "").slice(-6).toUpperCase();
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

type Detail = {
  order: HubOrder & { notes?: string | null; promo_codes?: { code: string } | null };
  tickets: Array<{ id: string; qr_code: string | null; ticket_type_id: string | null; is_scanned: boolean | null; scanned_at: string | null; created_at: string }>;
  ledger: Array<{ type: string; created_at?: string; gross_amount?: number }>;
};

export default function Orders() {
  const hub = useHub();
  const { id, event, revenue, tiers } = hub;
  const { data: orders, refresh } = useEventOrders(id);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [panel, setPanel] = useState<null | "refund" | "transfer">(null);
  const [reason, setReason] = useState<"glitch" | "show_cancelled">("glitch");
  const [note, setNote] = useState("");
  const [xfer, setXfer] = useState({ name: "", email: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setDetail(null);
    setPanel(null);
    setMsg(null);
    fetch(`/api/admin/orders/${open}`).then((r) => (r.ok ? r.json() : null)).then(setDetail).catch(() => setDetail(null));
  }, [open]);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (orders ?? []).filter((o) =>
      (src === "All" || srcOf(o) === src || (src === "Box office" && srcOf(o) === "Cash"))
      && (!ql || `${o.customer_name ?? ""} ${o.customer_email ?? ""} ${o.id} ${ref(o.id)}`.toLowerCase().includes(ql)),
    );
  }, [orders, q, src]);

  if (!event) return null;
  if (orders === null) return <HubLoading label="Orders" />;

  const tierName = new Map(tiers.map((t) => [t.id, t.tier_name]));
  const tickets = orders.filter((o) => o.status === "paid").reduce((t, o) => t + (Number(o.quantity) || 1), 0);

  const exportCsv = () => {
    const rows = [["Order", "Date", "Buyer", "Email", "Source", "Qty", "Total", "State", "Tracking link"]];
    for (const o of shown) rows.push([ref(o.id), new Date(o.created_at).toISOString(), o.customer_name ?? "", o.customer_email ?? "", srcOf(o), String(o.quantity ?? 1), String(o.total_amount ?? 0), o.status, o.tracking_link_slug ?? ""]);
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${event.title.replace(/[^\w]+/g, "-").toLowerCase()}-orders.csv`;
    a.click();
    hub.toast(`Exported ${shown.length} order${shown.length === 1 ? "" : "s"}.`);
  };

  const act = async (fn: () => Promise<Response>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn();
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "That didn't work.");
      setMsg({ tone: "good", text: ok });
      setPanel(null);
      refresh();
      hub.reload(["tiers", "revenue"]);
      const fresh = await fetch(`/api/admin/orders/${open}`).then((x) => (x.ok ? x.json() : null));
      setDetail(fresh);
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "That didn't work." });
    } finally {
      setBusy(false);
    }
  };

  const rev = revenue.data;
  const revRows = rev
    ? [
        { label: "Face value", value: rev.ticketRevenue },
        { label: "Service fees", value: Number(rev.serviceFeesGross) || 0 },
        { label: "Facility fees", value: Number(rev.facilityFeesGross) || 0 },
        { label: "Sales tax collected", value: rev.taxCollected },
        ...(rev.refundTotal ? [{ label: "Refunded (already netted)", value: -rev.refundTotal, dim: true }] : []),
        { label: "Card processing", value: -rev.processingFees },
        { label: "Gross, net of refunds", value: rev.grossRevenue, total: true },
        { label: "Net to venue", value: rev.netToVenue, total: true },
      ]
    : [];

  const o = detail?.order;
  const st = o ? STATE[o.status] ?? { label: o.status, tone: "dim" } : null;
  const history = detail
    ? [
        { t: detail.order.created_at, label: `Order placed · ${srcOf(detail.order)}` },
        ...(detail.order.promo_codes?.code ? [{ t: detail.order.created_at, label: `Promo code ${detail.order.promo_codes.code}` }] : []),
        ...detail.tickets.filter((t) => t.is_scanned && t.scanned_at).map((t) => ({ t: t.scanned_at!, label: "Scanned in at the door" })),
        ...detail.ledger.filter((l) => l.type === "refund" && l.created_at).map((l) => ({ t: l.created_at!, label: `Refunded ${fmtUSD(Math.abs(Number(l.gross_amount) || 0))}` })),
      ].sort((a, b) => a.t.localeCompare(b.t))
    : [];

  return (
    <>
      <HubActions>
        <button type="button" className="hub-btn" onClick={exportCsv} disabled={!shown.length}>Export CSV</button>
      </HubActions>

      {orders.length === 0 ? (
        <HubEmpty
          title="No orders yet"
          body="Orders appear here from the first sale, whether online, at the box office or on a terminal."
          ctas={[{ label: "View on storefront", href: `/events/${id}` }]}
        />
      ) : (
        <div className="hub-orders">
          <section className="hub-card hub-card--glow hub-orders-book">
            <div className="hub-orders-filter">
              <input className="hub-input hub-orders-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or order number" />
              <div className="evl-seg">
                {CHIPS.map((c) => (
                  <button key={c} type="button" className={`evl-seg-btn${src === c ? " is-on" : ""}`} onClick={() => setSrc(c)}>{c}</button>
                ))}
              </div>
            </div>
            <div className="hub-tiers-scroll">
              <div className="hub-order-table">
                <div className="hub-order-row hub-order-row--head">
                  <div>Order</div><div>Buyer</div><div>Source</div><div className="hub-num">Qty</div><div className="hub-num">Total</div><div>State</div>
                </div>
                {shown.slice(0, 300).map((x) => {
                  const s = STATE[x.status] ?? { label: x.status, tone: "dim" };
                  return (
                    <button key={x.id} type="button" className="hub-order-row is-click" onClick={() => setOpen(x.id)}>
                      <div className="hub-order-id">{ref(x.id)}<span>{when(x.created_at)}</span></div>
                      <div className="hub-order-who"><b>{x.customer_name || "Guest"}</b><span>{x.customer_email || "—"}</span></div>
                      <div><span className="hub-src">{srcOf(x)}</span></div>
                      <div className="hub-num hub-link-n">{x.quantity ?? 1}</div>
                      <div className="hub-num hub-link-rev">{fmtUSD(Number(x.total_amount) || 0)}</div>
                      <div className={`hub-order-state is-${s.tone}`}>{s.label}</div>
                    </button>
                  );
                })}
                {shown.length === 0 && (
                  <div className="hub-alert-none hub-orders-none">No orders match &ldquo;{q}&rdquo;. Try a last name, the email, or the number on the confirmation.</div>
                )}
              </div>
            </div>
            <div className="hub-card-foot hub-card-foot--quiet">
              {shown.length.toLocaleString()} of {orders.length.toLocaleString()} orders · {tickets.toLocaleString()} paid tickets{shown.length > 300 ? " · showing the latest 300 — search to narrow" : ""}
            </div>
          </section>

          <section className="hub-card hub-card--glow">
            <div className="hub-eyebrow">Revenue breakdown</div>
            {revenue.state === "denied" && <div className="hub-alert-none">Your role can&apos;t see the money for this show.</div>}
            {revenue.state === "loading" && <div className="hub-alert-none">Loading…</div>}
            <div className="hub-rev">
              {revRows.map((r) => (
                <div key={r.label} className={`hub-rev-row${r.total ? " is-total" : ""}${"dim" in r && r.dim ? " is-dim" : ""}`}>
                  <span>{r.label}</span>
                  <b>{r.value < 0 ? `(${fmtUSD(-r.value)})` : fmtUSD(r.value)}</b>
                </div>
              ))}
            </div>
            <div className="hub-card-foot hub-card-foot--quiet">Face value is what settles with the artist. Service and facility fees are venue revenue and settle separately.</div>
          </section>
        </div>
      )}

      {open && (
        <HubDrawer onClose={() => setOpen(null)}>
          {!detail || !o || !st ? (
            <div className="hub-alert-none">Loading the order…</div>
          ) : (
            <>
              <div className="hub-drawer-head">
                <div>
                  <div className="hub-eyebrow">{ref(o.id)} · {srcOf(o)}</div>
                  <div className="hub-drawer-title">{o.customer_name || "Guest"}</div>
                  <div className="hub-card-sub">{o.customer_email || "No email on file"}</div>
                </div>
                <button type="button" className="hub-x" onClick={() => setOpen(null)} aria-label="Close">✕</button>
              </div>
              <div className="hub-od-total">
                <div className={`hub-order-state is-${st.tone}`}>{st.label}</div>
                <div className="hub-od-amount">{fmtUSD(Number(o.total_amount) || 0)}</div>
              </div>
              {msg && <div className={msg.tone === "bad" ? "hub-error" : "hub-ok"}>{msg.text}</div>}
              <div>
                <div className="hub-od-sub">Tickets</div>
                {detail.tickets.length === 0 && <div className="hub-alert-none">No tickets on this order.</div>}
                {detail.tickets.map((t) => (
                  <div key={t.id} className="hub-od-line">
                    <div className="hub-od-line-text">
                      <div className="hub-unlock-what">{(t.ticket_type_id && tierName.get(t.ticket_type_id)) || "Ticket"}</div>
                      <div className="hub-promo-sub">{t.qr_code ? t.qr_code.slice(-10).toUpperCase() : t.id.slice(0, 8)}</div>
                    </div>
                    <div className={`hub-order-state is-${o.status === "refunded" ? "dim" : t.is_scanned ? "good" : "dim"}`}>
                      {o.status === "refunded" ? "Void" : t.is_scanned ? "Scanned" : "Valid"}
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div className="hub-od-sub">History</div>
                {history.map((e, i) => (
                  <div key={i} className="hub-od-hist"><span>{when(e.t)}</span><span>{e.label}</span></div>
                ))}
              </div>
              {o.status === "paid" && (
                <div className="hub-od-actions">
                  <button type="button" className={`hub-btn hub-btn--sm${panel === "refund" ? " is-on" : ""}`} onClick={() => setPanel(panel === "refund" ? null : "refund")}>Refund…</button>
                  <button type="button" className="hub-btn hub-btn--sm" disabled={busy || !o.customer_email} onClick={() => act(() => fetch(`/api/admin/orders/${o.id}/resend-email`, { method: "POST" }), `Tickets sent again to ${o.customer_email}.`)}>Resend</button>
                  <button type="button" className={`hub-btn hub-btn--sm${panel === "transfer" ? " is-on" : ""}`} onClick={() => { setXfer({ name: "", email: "" }); setPanel(panel === "transfer" ? null : "transfer"); }}>Transfer…</button>
                </div>
              )}
              {panel === "refund" && o.status === "paid" && (
                <div className="hub-od-panel">
                  <div className="hub-od-panel-title">Why?</div>
                  <div className="hub-choices">
                    <button type="button" className={`hub-choice hub-choice--sm${reason === "glitch" ? " is-on" : ""}`} onClick={() => setReason("glitch")}>Our mistake</button>
                    <button type="button" className={`hub-choice hub-choice--sm${reason === "show_cancelled" ? " is-on" : ""}`} onClick={() => setReason("show_cancelled")}>Show cancelled</button>
                  </div>
                  <input className="hub-in hub-in--sm" placeholder="Note for the order (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <div className="hub-field-hint">The whole order, {fmtUSD(Number(o.total_amount) || 0)} all-in, back to the card. Tickets are voided right away and any held seats go back on sale. The money reaches the buyer in 5–10 business days.</div>
                  <button
                    type="button"
                    className="hub-btn hub-btn--bad hub-btn--block"
                    disabled={busy}
                    onClick={() => confirm(`Refund ${fmtUSD(Number(o.total_amount) || 0)} to ${o.customer_name || "this buyer"}? This can't be undone.`) &&
                      act(() => fetch(`/api/admin/orders/${o.id}/refund`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, note: note.trim() || undefined }) }), "Refunded. The tickets are void.")}
                  >
                    {busy ? "Refunding…" : "Issue refund"}
                  </button>
                </div>
              )}
              {panel === "transfer" && o.status === "paid" && (
                <div className="hub-od-panel">
                  <div className="hub-od-panel-title">Transfer to</div>
                  <input className="hub-in hub-in--sm" placeholder="New holder's name" value={xfer.name} onChange={(e) => setXfer({ ...xfer, name: e.target.value })} />
                  <input className="hub-in hub-in--sm" placeholder="new.holder@email.com" type="email" value={xfer.email} onChange={(e) => setXfer({ ...xfer, email: e.target.value })} />
                  <div className="hub-field-hint">Moves the order and every ticket on it to this name and email, then sends the tickets there. The QR codes don&apos;t change, so anyone already holding them can still get in.</div>
                  <button
                    type="button"
                    className="hub-btn hub-btn--primary hub-btn--block"
                    disabled={busy || !xfer.name.trim() || !/^\S+@\S+\.\S+$/.test(xfer.email.trim())}
                    onClick={() => act(async () => {
                      const r = await fetch(`/api/admin/orders/${o.id}/customer`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_name: xfer.name.trim(), customer_email: xfer.email.trim() }) });
                      if (!r.ok) return r;
                      return fetch(`/api/admin/orders/${o.id}/resend-email`, { method: "POST" });
                    }, `Transferred to ${xfer.name.trim()} and sent to ${xfer.email.trim()}.`)}
                  >
                    {busy ? "Transferring…" : "Transfer tickets"}
                  </button>
                </div>
              )}
              <a className="hub-card-link" href={`/admin/orders/${id}/${o.id}`}>Open the full order page (seats, payment requests) →</a>
            </>
          )}
        </HubDrawer>
      )}
    </>
  );
}
