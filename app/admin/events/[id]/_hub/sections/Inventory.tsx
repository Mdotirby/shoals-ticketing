"use client";

/**
 * Inventory & seating — eventhub.dc.html ?tab=inventory. What can be sold,
 * what is held back and where it sits in the room: capacity against
 * sellable, holds by type, and this show's seat map. Replaces the workspace
 * Inventory & Holds tab.
 *
 * Kills are the offer's scaling (they are set there, not here). Holds are
 * the event_holds rows; checkout does not subtract them yet, so the card
 * says so instead of promising that a release "puts seats on sale". The
 * seat map is the show's own layout with live seat states, read-only; holds
 * are painted onto seats in the seat map builder, not here.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import SeatMap from "@/app/components/seating/SeatMap";
import type { SectionFull } from "@/lib/seating/types";
import { useHub, type HubHold } from "../HubContext";
import { HubActions } from "../HubShell";
import { HubDrawer, HubLoading } from "../ui";

const KINDS: Array<{ key: HubHold["hold_type"]; label: string; tone: string; note: string }> = [
  { key: "artist", label: "Artist", tone: "warn", note: "Held for the band, crew and their guests" },
  { key: "promoter", label: "Promoter", tone: "purp", note: "Held for the promoter and production" },
  { key: "house_comp", label: "House", tone: "blue", note: "Venue and sponsor seats" },
  { key: "other", label: "Other", tone: "dim", note: "Anything else held back" },
];

type SeatMapData = { enabled: boolean; layout: { name?: string; room_width_ft?: number; room_height_ft?: number; sections: SectionFull[] } | null };

export default function Inventory() {
  const hub = useHub();
  const { id, tiers, holds, capacity, sold, offer } = hub;
  const [map, setMap] = useState<SeatMapData | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ ticket_tier_id: "", quantity: "1", hold_type: "artist" as HubHold["hold_type"], owner_label: "", release_note: "" });
  const [error, setError] = useState("");
  const [layouts, setLayouts] = useState<Array<{ id: string; name: string }> | null>(null);
  const [pickLayout, setPickLayout] = useState("");
  const [mapN, setMapN] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/seating/events/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false, layout: null }))
      .then((d) => live && setMap(d))
      .catch(() => live && setMap({ enabled: false, layout: null }));
    return () => { live = false; };
  }, [id, mapN]);

  // Saved room layouts, for attaching one to this show.
  useEffect(() => {
    if (!map || map.enabled) return;
    fetch("/api/seating/layouts").then((r) => (r.ok ? r.json() : [])).then((d) => setLayouts(Array.isArray(d) ? d : [])).catch(() => setLayouts([]));
  }, [map]);

  const attach = async (layoutId: string | null) => {
    if (layoutId === null && !confirm("Detach the seat map? The show goes back to selling from its tiers alone. Seats already sold keep their assignments.")) return;
    const r = await fetch(`/api/seating/events/${id}/map`, layoutId
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ layout_id: layoutId, enabled: true }) }
      : { method: "DELETE" });
    if (!r.ok) { hub.toast("Couldn't change the seat map."); return; }
    setMapN((n) => n + 1);
    hub.toast(layoutId ? "Seat map attached. Buyers pick seats from it now." : "Seat map detached.");
  };

  const byType = (k: HubHold["hold_type"]) => holds.filter((h) => h.hold_type === k);
  const held = holds.reduce((t, h) => t + (Number(h.quantity) || 0), 0);
  const kills = capacity.kills ?? 0;
  const room = capacity.room ?? capacity.sellable + kills;
  const open = Math.max(0, capacity.sellable - sold - held);
  // Room the tiers don't put on sale — neither killed nor sellable.
  const unloaded = Math.max(0, (capacity.room ?? 0) - capacity.sellable - kills);
  const total = Math.max(1, room);
  const pct = (n: number) => `${((n / total) * 100).toFixed(2)}%`;

  const release = async (list: HubHold[]) => {
    if (!list.length) return;
    const n = list.reduce((t, h) => t + h.quantity, 0);
    if (list.length > 1 && !confirm(`Release all ${list.length} holds (${n} tickets)?`)) return;
    setBusy(list[0].hold_type + list.length);
    await Promise.all(list.map((h) => fetch(`/api/events/${id}/holds/${h.id}`, { method: "PATCH" }).catch(() => null)));
    setBusy(null);
    hub.reload(["holds"]);
    hub.toast(`${n} ticket${n === 1 ? "" : "s"} released.`);
  };

  const create = async () => {
    setError("");
    if (!form.owner_label.trim()) { setError("Say who the hold is for."); return; }
    const qty = parseInt(form.quantity) || 0;
    if (qty < 1) { setError("Hold at least one ticket."); return; }
    const r = await fetch(`/api/events/${id}/holds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, quantity: qty, ticket_tier_id: form.ticket_tier_id || null, reason: "" }),
    });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Couldn't create the hold."); return; }
    setDrawer(false);
    setForm({ ticket_tier_id: "", quantity: "1", hold_type: "artist", owner_label: "", release_note: "" });
    hub.reload(["holds"]);
    hub.toast(`${qty} held for ${form.owner_label.trim()}.`);
  };

  const sections = map?.layout?.sections ?? [];
  const seats = sections.flatMap((s) => s.seats ?? []);
  const seatCount = (st: string) => seats.filter((x) => (x as { status?: string }).status === st).length;

  return (
    <>
      <HubActions>
        <button type="button" className="hub-btn hub-btn--primary" onClick={() => setDrawer(true)}>+ New hold</button>
      </HubActions>

      <div className="hub-inv">
        <section className="hub-card hub-card--glow">
          <div className="hub-eyebrow">Capacity vs sellable</div>
          <div className="hub-inv-big">
            <div className="hub-inv-num">{capacity.sellable.toLocaleString()} sellable</div>
            <div className="hub-inv-sub">
              {capacity.room ? `of ${capacity.room.toLocaleString()} capacity` : "set by the tiers"}
              {capacity.kills !== null ? ` · ${kills} killed for this show` : " · no kills recorded"}
            </div>
          </div>
          <div className="hub-capbar">
            <div style={{ width: pct(sold) }} className="is-sold" />
            <div style={{ width: pct(held) }} className="is-held" />
            <div style={{ width: pct(kills) }} className="is-killed" />
            <div style={{ width: pct(open) }} className="is-open" />
            <div style={{ width: pct(unloaded) }} className="is-unloaded" />
          </div>
          <div className="hub-caplegend">
            <div><span className="hub-sw is-sold" /><span>Sold</span><b>{sold.toLocaleString()}</b></div>
            <div><span className="hub-sw is-held" /><span>Held</span><b>{held.toLocaleString()}</b></div>
            <div><span className="hub-sw is-killed" /><span>Killed</span><b>{kills.toLocaleString()}</b></div>
            <div><span className="hub-sw is-open" /><span>Open to sell</span><b>{open.toLocaleString()}</b></div>
            {unloaded > 0 && <div><span className="hub-sw is-unloaded" /><span>Room not loaded in tiers</span><b>{unloaded.toLocaleString()}</b></div>}
          </div>
          {offer && capacity.kills !== null && (
            <div className="hub-card-foot">Kills come from the offer&apos;s scaling. Change them on the deal.</div>
          )}
        </section>

        <section className="hub-card hub-card--glow">
          <div className="hub-card-line">
            <div className="hub-eyebrow">Holds by type</div>
            <span className="hub-spacer" />
            <div className="hub-card-note">Checkout doesn&apos;t subtract holds yet</div>
          </div>
          <div className="hub-holds">
            {KINDS.map((k) => {
              const list = byType(k.key);
              const n = list.reduce((t, h) => t + (Number(h.quantity) || 0), 0);
              return (
                <div key={k.key} className="hub-hold-group">
                  <div className="hub-hold">
                    <span className={`hub-hold-dot is-${k.tone}`} />
                    <div className="hub-hold-text">
                      <div className="hub-hold-label">{k.label}</div>
                      <div className="hub-hold-note">{k.note}</div>
                    </div>
                    <div className="hub-hold-count">{n}</div>
                    <button type="button" className="hub-btn hub-btn--sm" disabled={!list.length || busy !== null} onClick={() => release(list)}>
                      {busy === k.key + list.length ? "Releasing…" : "Release"}
                    </button>
                  </div>
                  {list.map((h) => (
                    <div key={h.id} className="hub-hold-line">
                      <span>{h.quantity} × {h.ticket_tiers?.tier_name || "any tier"}</span>
                      <span className="hub-hold-who">{h.owner_label}{h.release_note ? ` · ${h.release_note}` : ""}</span>
                      {list.length > 1 && <button type="button" className="hub-field-link" onClick={() => release([h])}>Release</button>}
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="hub-hold-group">
              <div className="hub-hold">
                <span className="hub-hold-dot is-kill" />
                <div className="hub-hold-text">
                  <div className="hub-hold-label">Kills</div>
                  <div className="hub-hold-note">Seats removed for this show — set on the offer&apos;s scaling</div>
                </div>
                <div className="hub-hold-count">{kills}</div>
                <span className="hub-hold-spacer" />
              </div>
            </div>
          </div>
        </section>

        <section className="hub-card hub-card--glow hub-inv-map">
          <div className="hub-card-line">
            <div className="hub-eyebrow">Seat map · this show</div>
            {map?.layout?.name && <div className="hub-card-note">{map.layout.name}</div>}
            <span className="hub-spacer" />
            {map?.enabled && <button type="button" className="hub-card-link" onClick={() => attach(null)}>Detach</button>}
            <Link href="/admin/seating" className="hub-card-link">{map?.enabled ? "Edit holds in the seat map builder →" : "Build a room in Seating →"}</Link>
          </div>
          {map === null ? (
            <HubLoading label="the seat map" />
          ) : map.enabled && map.layout && sections.length ? (
            <>
              <div className="hub-inv-mapwrap">
                <SeatMap
                  sections={sections}
                  roomWidthFt={map.layout.room_width_ft || 100}
                  roomHeightFt={map.layout.room_height_ft || 80}
                  interactive={false}
                  selectedSeatIds={new Set()}
                  onSeatClick={() => {}}
                />
              </div>
              <div className="hub-maplegend">
                <span><i className="hub-sw is-open" />Open {seatCount("available")}</span>
                <span><i className="hub-sw is-sold" />Sold {seatCount("sold")}</span>
                <span><i className="hub-sw is-held" />Held at checkout {seatCount("held")}</span>
              </div>
            </>
          ) : (
            <div className="hub-inv-ga">
              <div className="hub-inv-ga-title">General admission</div>
              <div className="hub-inv-ga-body">This show sells from its tiers with no seat map. Attach a saved room layout to sell assigned seats or tables.</div>
              {layouts && layouts.length > 0 && (
                <div className="hub-inv-attach">
                  <select className="hub-in hub-in--sm" value={pickLayout} onChange={(e) => setPickLayout(e.target.value)}>
                    <option value="">Choose a room…</option>
                    {layouts.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <button type="button" className="hub-btn hub-btn--sm" disabled={!pickLayout} onClick={() => attach(pickLayout)}>Attach</button>
                </div>
              )}
              <div className="hub-inv-tiers">
                {tiers.map((t) => {
                  const tierHeld = holds.filter((h) => h.ticket_tier_id === t.id).reduce((n, h) => n + h.quantity, 0);
                  const cap = t.capacity || 0;
                  const w = (n: number) => `${cap ? (n / cap) * 100 : 0}%`;
                  return (
                    <div key={t.id} className="hub-inv-tier">
                      <div className="hub-attr-line">
                        <div className="hub-attr-name">{t.tier_name}</div>
                        <div className="hub-attr-orders">{(t.quantity_sold || 0).toLocaleString()} sold{tierHeld ? ` · ${tierHeld} held` : ""}</div>
                        <div className="hub-attr-rev">{cap.toLocaleString()}</div>
                      </div>
                      <div className="hub-capbar hub-capbar--thin">
                        <div style={{ width: w(t.quantity_sold || 0) }} className="is-sold" />
                        <div style={{ width: w(tierHeld) }} className="is-held" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {drawer && (
        <HubDrawer onClose={() => setDrawer(false)}>
          <div className="hub-drawer-head">
            <div>
              <div className="hub-eyebrow">Inventory</div>
              <div className="hub-drawer-title">New hold</div>
            </div>
            <button type="button" className="hub-x" onClick={() => setDrawer(false)} aria-label="Close">✕</button>
          </div>
          {error && <div className="hub-error">{error}</div>}
          <div className="hub-field">
            <div className="hub-field-head"><div className="hub-field-label">Type</div></div>
            <div className="hub-choices">
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={`hub-choice hub-choice--sm${form.hold_type === k.key ? " is-on" : ""}`} onClick={() => setForm({ ...form, hold_type: k.key })}>{k.label}</button>
              ))}
            </div>
          </div>
          <div className="hub-field">
            <div className="hub-field-head"><label className="hub-field-label" htmlFor="hold-tier">Tier</label></div>
            <select id="hold-tier" className="hub-in" value={form.ticket_tier_id} onChange={(e) => setForm({ ...form, ticket_tier_id: e.target.value })}>
              <option value="">Any tier</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{t.tier_name}</option>)}
            </select>
          </div>
          <div className="hub-field">
            <div className="hub-field-head"><label className="hub-field-label" htmlFor="hold-qty">Quantity</label></div>
            <input id="hold-qty" className="hub-in" inputMode="numeric" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") })} />
          </div>
          <div className="hub-field">
            <div className="hub-field-head"><label className="hub-field-label" htmlFor="hold-who">Held for</label></div>
            <input id="hold-who" className="hub-in" placeholder="e.g. Cole Phillips team" value={form.owner_label} onChange={(e) => setForm({ ...form, owner_label: e.target.value })} />
          </div>
          <div className="hub-field">
            <div className="hub-field-head"><label className="hub-field-label" htmlFor="hold-note">Release note</label></div>
            <input id="hold-note" className="hub-in" placeholder="e.g. releases day of show" value={form.release_note} onChange={(e) => setForm({ ...form, release_note: e.target.value })} />
          </div>
          <div className="hub-modal-actions">
            <button type="button" className="hub-btn hub-btn--quiet" onClick={() => setDrawer(false)}>Cancel</button>
            <button type="button" className="hub-btn hub-btn--primary" onClick={create}>Create hold</button>
          </div>
        </HubDrawer>
      )}
    </>
  );
}
