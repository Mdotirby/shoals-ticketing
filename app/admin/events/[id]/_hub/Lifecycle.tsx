"use client";

/**
 * The header's ⋯ menu — eventhub.dc.html's Duplicate, Postpone or
 * reschedule, and Cancel event — and the two modals behind them.
 *
 * What each does is what production can stand behind:
 *   • Duplicate copies details and tiers into a draft (POST …/duplicate) and
 *     opens it.
 *   • Postpone moves the date, doors and show time. Tickets stay valid for
 *     the new date. A show's date can't be blank, so there is no "TBD" —
 *     the modal says to unpublish instead if the date is unknown.
 *   • Cancel marks the show cancelled and off the storefront, then refunds
 *     every paid card order in full under the "show cancelled" reason
 *     (lib/orders/refundPolicy — the only way a refund is allowed). Cash
 *     orders are listed for the box office; comps have nothing to refund.
 * Neither emails buyers yet, and both say so rather than promise it.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { defaultDoorsTime, safeDate } from "@/lib/dates";
import { fmtUSD } from "@/app/components/admin/ui";
import { useHub } from "./HubContext";
import { HubModal } from "./ui";
import { useEventOrders } from "./useEventData";

const REASONS = ["Artist illness", "Travel or routing", "Weather", "Venue issue", "Low sales", "Other"];

export function LifecycleMenu() {
  const hub = useHub();
  const { id, event } = hub;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<null | "postpone" | "cancel">(null);
  const [busy, setBusy] = useState(false);

  if (!event) return null;
  const cancelled = event.booking_status === "cancelled";

  const duplicate = async () => {
    setOpen(false);
    setBusy(true);
    const r = await fetch(`/api/events/${id}/duplicate`, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { hub.toast(d.error || "Couldn't duplicate the show."); return; }
    hub.toast(`Duplicated as a draft: ${d.title}.`);
    router.push(`/admin/events/${d.id}?tab=details`);
  };

  return (
    <div className="hub-pop-anchor">
      <button type="button" className="hub-more-btn" onClick={() => setOpen(!open)} aria-label="More actions" disabled={busy}>⋯</button>
      {open && (
        <>
          <div className="hub-pop-scrim" onClick={() => setOpen(false)} />
          <div className="hub-pop hub-pop--more">
            <button type="button" className="hub-more-item" onClick={duplicate}>
              <b>Duplicate</b><span>Copies details and tiers into a draft. No orders, holds or deal.</span>
            </button>
            {!cancelled && (
              <button type="button" className="hub-more-item is-warn" onClick={() => { setOpen(false); setModal("postpone"); }}>
                <b>Postpone or reschedule</b><span>Pick a new date; tickets stay valid</span>
              </button>
            )}
            {!cancelled && (
              <button type="button" className="hub-more-item is-bad" onClick={() => { setOpen(false); setModal("cancel"); }}>
                <b>Cancel event</b><span>Take it off sale and refund every card order</span>
              </button>
            )}
          </div>
        </>
      )}
      {modal === "postpone" && <Postpone onClose={() => setModal(null)} />}
      {modal === "cancel" && <Cancel onClose={() => setModal(null)} />}
    </div>
  );
}

function Postpone({ onClose }: { onClose: () => void }) {
  const hub = useHub();
  const { id, event, sold } = hub;
  const raw = event?.date ?? "";
  const [date, setDate] = useState(raw.slice(0, 10));
  const [show, setShow] = useState(raw.slice(11, 16) === "00:00" ? "" : raw.slice(11, 16));
  const [doors, setDoors] = useState((event?.doors_time ?? "").slice(0, 5) || defaultDoorsTime(raw.slice(11, 16)) || "");
  const [busy, setBusy] = useState(false);
  if (!event) return null;
  const before = safeDate(event.date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const after = date ? new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "";
  const same = date === raw.slice(0, 10) && show === raw.slice(11, 16);

  const go = async () => {
    setBusy(true);
    const r = await fetch(`/api/events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: `${date}T${show || "19:00"}:00`, doors_time: doors || null }),
    });
    setBusy(false);
    if (!r.ok) { hub.toast((await r.json().catch(() => ({}))).error || "Couldn't move the show."); return; }
    hub.reload(["event"]);
    onClose();
    hub.toast(`Moved to ${after}. The change is recorded in Activity.`);
  };

  return (
    <HubModal eyebrow="Postpone or reschedule" title={`Move ${event.title}`} width={600} onClose={onClose}>
      <div className="hub-fields hub-pp-fields">
        <div className="hub-field"><div className="hub-field-head"><label className="hub-field-label" htmlFor="pp-date">New date</label></div><input id="pp-date" type="date" className="hub-in" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="hub-field"><div className="hub-field-head"><label className="hub-field-label" htmlFor="pp-doors">Doors</label></div><input id="pp-doors" type="time" className="hub-in" value={doors} onChange={(e) => setDoors(e.target.value)} /></div>
        <div className="hub-field"><div className="hub-field-head"><label className="hub-field-label" htmlFor="pp-show">Show</label></div><input id="pp-show" type="time" className="hub-in" value={show} onChange={(e) => { if (!doors || doors === defaultDoorsTime(show)) setDoors(defaultDoorsTime(e.target.value) ?? ""); setShow(e.target.value); }} /></div>
      </div>
      <div className="hub-pp-what">
        <div className="hub-od-panel-title">What happens to the {sold.toLocaleString()} ticket{sold === 1 ? "" : "s"} sold</div>
        <div className="hub-radio is-on"><span className="hub-radio-dot" /><div><b>Tickets stay valid for the new date</b><span>Nobody has to do anything. The new date shows on their tickets and the event page right away.</span></div></div>
        <div className="hub-field-hint">Refunding everyone is a cancellation — use Cancel event. Don&apos;t know the new date yet? Unpublish the show until you do; a show can&apos;t be dated &ldquo;TBD&rdquo;.</div>
      </div>
      <div className="hub-modal-body hub-note-warn">Buyers aren&apos;t emailed about the move automatically yet. Tell them from your own list until that&apos;s built.</div>
      <div className="hub-modal-actions">
        <button type="button" className="hub-btn hub-btn--quiet" onClick={onClose}>Keep the date</button>
        <button type="button" className="hub-btn hub-btn--warn" disabled={busy || !date || same} onClick={go}>
          {busy ? "Moving…" : same ? "Pick a new date" : `Move from ${before} to ${after}`}
        </button>
      </div>
    </HubModal>
  );
}

function Cancel({ onClose }: { onClose: () => void }) {
  const hub = useHub();
  const { id, event } = hub;
  const { data: orders, refresh } = useEventOrders(id);
  const [reason, setReason] = useState("Artist illness");
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: string[]; total: number } | null>(null);
  if (!event) return null;

  const paid = (orders ?? []).filter((o) => o.status === "paid");
  const card = paid.filter((o) => o.source !== "cash" && o.source !== "comp" && (Number(o.total_amount) || 0) > 0);
  const cash = paid.filter((o) => o.source === "cash");
  const cardTotal = card.reduce((t, o) => t + (Number(o.total_amount) || 0), 0);
  const ok = confirmText.trim().toUpperCase() === "CANCEL";
  const day = safeDate(event.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    // 1. Mark it cancelled and pull it from the storefront — refunds under
    //    "show cancelled" are only allowed once the show says so.
    const r = await fetch(`/api/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ booking_status: "cancelled", status: "draft" }) });
    if (!r.ok) { setBusy(false); hub.toast((await r.json().catch(() => ({}))).error || "Couldn't cancel the show."); return; }
    // 2. Refund every card order, one at a time, so a failure names its order.
    const state = { done: 0, failed: [] as string[], total: card.length };
    setProgress({ ...state });
    for (const o of card) {
      const rr = await fetch(`/api/admin/orders/${o.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "show_cancelled", note: `Show cancelled — ${reason}` }),
      }).catch(() => null);
      if (rr && rr.ok) state.done++;
      else state.failed.push(`${o.customer_name || o.customer_email || o.id.slice(0, 8)}`);
      setProgress({ ...state, failed: [...state.failed] });
    }
    setBusy(false);
    refresh();
    hub.reload();
    hub.toast(`Cancelled. ${state.done} of ${state.total} orders refunded${state.failed.length ? `; ${state.failed.length} need another try from Orders` : ""}.`);
  };

  return (
    <HubModal eyebrow="Cancel event" title={`Cancel ${event.title} on ${day}?`} tone="bad" width={600} onClose={busy ? () => {} : onClose}>
      {progress ? (
        <>
          <div className="hub-modal-body">
            The show is cancelled and off the storefront. Refunded {progress.done} of {progress.total} card order{progress.total === 1 ? "" : "s"}{busy ? "…" : "."}
          </div>
          <div className="hub-allot-bar"><div className="is-good" style={{ width: `${progress.total ? ((progress.done + progress.failed.length) / progress.total) * 100 : 100}%` }} /></div>
          {progress.failed.length > 0 && <div className="hub-error">Couldn&apos;t refund: {progress.failed.join(", ")}. Try them again from Orders.</div>}
          {!busy && cash.length > 0 && <div className="hub-modal-body hub-note-warn">{cash.length} cash order{cash.length === 1 ? "" : "s"} must be refunded at the box office — the drawer is physical.</div>}
          {!busy && <div className="hub-modal-actions"><button type="button" className="hub-btn hub-btn--primary" onClick={onClose}>Done</button></div>}
        </>
      ) : (
        <>
          <div className="hub-field">
            <div className="hub-field-head"><div className="hub-field-label">Reason (recorded on every refunded order)</div></div>
            <div className="hub-choices">
              {REASONS.map((r) => <button key={r} type="button" className={`hub-choice hub-choice--sm${reason === r ? " is-on" : ""}`} onClick={() => setReason(r)}>{r}</button>)}
            </div>
          </div>
          <div className="hub-pp-what">
            <div className="hub-od-panel-title">Refunds</div>
            <div className="hub-radio is-on"><span className="hub-radio-dot" /><div><b>Full refund including fees</b><span>{orders === null ? "Counting orders…" : `${fmtUSD(cardTotal)} back to the card on ${card.length} order${card.length === 1 ? "" : "s"}. Tickets are voided as each refund lands.`}</span></div></div>
            {cash.length > 0 && <div className="hub-field-hint">{cash.length} cash order{cash.length === 1 ? "" : "s"} can&apos;t be refunded to a card — refund {cash.length === 1 ? "it" : "them"} at the box office.</div>}
            <div className="hub-field-hint">A cancelled show refunds the whole order, every time — the refund policy doesn&apos;t allow face value only.</div>
          </div>
          <div className="hub-modal-body hub-note-warn">Buyers aren&apos;t emailed about the cancellation automatically yet. Their card refund shows on their statement in 5–10 business days.</div>
          <div className="hub-field">
            <div className="hub-field-head"><label className="hub-field-label" htmlFor="cx-confirm">Type CANCEL to confirm</label></div>
            <input id="cx-confirm" className="hub-in" placeholder="CANCEL" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </div>
          <div className="hub-modal-actions">
            <button type="button" className="hub-btn hub-btn--quiet" onClick={onClose}>Don&apos;t cancel</button>
            <button type="button" className={`hub-btn${ok ? " hub-btn--bad" : ""}`} disabled={!ok || busy || orders === null} onClick={go}>Cancel event and refund</button>
          </div>
        </>
      )}
    </HubModal>
  );
}
