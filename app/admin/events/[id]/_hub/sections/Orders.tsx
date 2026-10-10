"use client";

/**
 * Orders — eventhub.dc.html ?tab=orders. Every order for the show from
 * every place it sold: search, filter by source, export, and the revenue
 * breakdown. Click an order and it opens right here (?order=…) as the full
 * order editor — buyer details, resend, payment corrections, comp, refund,
 * seats and tickets (app/admin/orders/[id]/[orderId]/OrderWorkspace) —
 * with a way back to the list. Replaces the workspace Orders tab, the Event
 * Sales page and the standalone order page, which all redirect here.
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OrderWorkspace from "@/app/admin/orders/[id]/[orderId]/OrderWorkspace";
import { fmtUSD } from "@/app/components/admin/ui";
import { useHub } from "../HubContext";
import { HubActions } from "../HubShell";
import { HubEmpty, HubLoading } from "../ui";
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


export default function Orders() {
  const hub = useHub();
  const { id, event, revenue } = hub;
  const { data: orders, refresh } = useEventOrders(id);
  const [q, setQ] = useState("");
  const [src, setSrc] = useState("All");
  const router = useRouter();
  const params = useSearchParams();
  const open = params.get("order");
  const go = (orderId: string | null) =>
    router.replace(`/admin/events/${id}?tab=orders${orderId ? `&order=${orderId}` : ""}`, { scroll: false });

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return (orders ?? []).filter((o) =>
      (src === "All" || srcOf(o) === src || (src === "Box office" && srcOf(o) === "Cash"))
      && (!ql || `${o.customer_name ?? ""} ${o.customer_email ?? ""} ${o.id} ${ref(o.id)}`.toLowerCase().includes(ql)),
    );
  }, [orders, q, src]);

  if (!event) return null;
  if (open) {
    return (
      <div className="hub-order-embed">
        <OrderWorkspace key={open} eventId={id} orderId={open} onBack={() => { refresh(); hub.reload(["tiers", "revenue"]); go(null); }} />
      </div>
    );
  }
  if (orders === null) return <HubLoading label="Orders" />;

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
                    <button key={x.id} type="button" className="hub-order-row is-click" onClick={() => go(x.id)}>
                      <div className="hub-order-id">{ref(x.id)}<span>{when(x.created_at)}</span></div>
                      <div className="hub-order-who"><b>{x.customer_name || "Guest"}</b><span>{x.customer_email || "—"}</span></div>
                      <div><span className="hub-src">{srcOf(x)}</span></div>
                      <div className="hub-num hub-link-n" data-label="Qty">{x.quantity ?? 1}</div>
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

    </>
  );
}
