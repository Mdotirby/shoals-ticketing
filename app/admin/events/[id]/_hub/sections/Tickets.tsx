"use client";

/**
 * Tickets & pricing — eventhub.dc.html ?tab=tickets. The show's tiers with
 * their face price, the service and facility fee each one charges and how
 * (added / included / waived), quantity, sold and status; then the windows
 * the show sells in and a key to the fee modes. Replaces the edit form's
 * Tickets and On-sale & fees tabs.
 *
 * Where production differs from the mockup, production's model wins:
 *   • Fee AMOUNTS come from the room's rate card; a tier only chooses the
 *     mode. A tier that hasn't chosen inherits the show's, and says so.
 *   • A tier has no on / paused / draft switch, so Status is read from what
 *     is true — sold out, code-locked, before on-sale, off sale, on sale.
 *   • Presales are the artist and venue windows, each with its own code.
 *   • Online off-sale is set by the venue's sales window, so it is shown,
 *     not edited.
 *
 * A tier that has sold can only go up in price, and its quantity can't drop
 * below what has sold — the same rule PUT /api/events/[id]/ticket-types and
 * the edit form keep.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { chicagoToUtcIso, utcToChicago } from "@/lib/dates";
import { resolveTierFees, normalizeUnlockCode, type FeeMode } from "@/lib/fees/tierFees";
import { useHub, useSectionDirty } from "../HubContext";
import { HubEmpty, HubLoading } from "../ui";
import type { HubTab } from "../config";

type Tier = {
  key: string;
  id?: string;
  name: string;
  price: string;
  capacity: string;
  svc: FeeMode | "";
  fac: FeeMode | "";
  code: string;
};

type Presale = { enabled: boolean; code: string; starts_at: string; ends_at: string; capacity: string };
type Windows = { onsaleDate: string; onsaleTime: string; artist: Presale; venue: Presale };
type Draft = { tiers: Tier[]; win: Windows };

type RoomFees = { ticketing_fee: number | null; facility_fee: number | null; tax_rate: number | null };
type Inventory = Record<string, { sold: number; price: number }>;

const NO_PRESALE: Presale = { enabled: false, code: "", starts_at: "", ends_at: "", capacity: "" };
const usd = (n: number) => `$${n.toFixed(2)}`;
const usd0 = (n: number) => (Number.isInteger(n) ? `$${n}` : usd(n));
const CYCLE: Record<FeeMode, FeeMode> = { added: "included", included: "waived", waived: "added" };
const MODE_LABEL: Record<FeeMode, string> = { added: "Added", included: "Included", waived: "Waived" };

let keySeq = 0;
const newKey = () => `new-${++keySeq}`;

function presaleFrom(row: Partial<Presale> & { capacity?: number | string | null } | null): Presale {
  if (!row) return { ...NO_PRESALE };
  return {
    enabled: !!row.enabled,
    code: row.code ?? "",
    starts_at: (row.starts_at ?? "").slice(0, 16),
    ends_at: (row.ends_at ?? "").slice(0, 16),
    capacity: row.capacity ? String(row.capacity) : "",
  };
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
}

export default function Tickets({ go }: { go: (t: HubTab) => void }) {
  const hub = useHub();
  const { id, event } = hub;
  const [saved, setSaved] = useState<Draft | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [inv, setInv] = useState<Inventory>({});
  const [closesAt, setClosesAt] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomFees | null>(null);
  const [priceWarn, setPriceWarn] = useState<string | null>(null);
  const [codeEdit, setCodeEdit] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loadN, setLoadN] = useState(0);

  // Tiers, presales and sales — reloaded after every save.
  useEffect(() => {
    if (!event) return;
    let live = true;
    Promise.all([
      fetch(`/api/events/${id}/ticket-types?admin=1`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/events/${id}/presale`).then((r) => (r.ok ? r.json() : {})),
      fetch(`/api/admin/ticketing/${id}`).then((r) => (r.ok ? r.json() : null)),
    ]).then(([tiers, pre, tk]: [unknown, { artist?: Presale | null; venue?: Presale | null }, { inventory?: Array<{ id: string; sold: number; price: number }>; window?: { storefrontClosesAt?: string | null } } | null]) => {
      if (!live) return;
      const on = event.on_sale_at ? utcToChicago(String(event.on_sale_at)) : { date: "", time: "" };
      const draft: Draft = {
        tiers: (Array.isArray(tiers) ? tiers : []).map((t: Record<string, unknown>) => ({
          key: String(t.id),
          id: String(t.id),
          name: String(t.tier_name ?? ""),
          price: String(t.price ?? 0),
          capacity: String(t.capacity ?? 0),
          svc: (t.service_fee_mode as FeeMode) ?? "",
          fac: (t.facility_fee_mode as FeeMode) ?? "",
          code: String(t.unlock_code ?? ""),
        })),
        win: { onsaleDate: on.date, onsaleTime: on.time, artist: presaleFrom(pre?.artist ?? null), venue: presaleFrom(pre?.venue ?? null) },
      };
      setSaved(draft);
      setD(draft);
      const map: Inventory = {};
      for (const t of tk?.inventory ?? []) map[t.id] = { sold: Number(t.sold) || 0, price: Number(t.price) || 0 };
      setInv(map);
      setClosesAt(tk?.window?.storefrontClosesAt ?? null);
    }).catch(() => live && setError("Couldn't load the tiers."));
    return () => { live = false; };
  }, [id, event, loadN]);

  // The room's rate card — the fee amounts every tier inherits.
  useEffect(() => {
    const roomId = event?.event_venue_id;
    if (!roomId) { setRoom(null); return; }
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) =>
      getSupabaseBrowser().from("event_venues").select("ticketing_fee, facility_fee, tax_rate").eq("id", String(roomId)).maybeSingle()
        .then(({ data }: { data: RoomFees | null }) => setRoom(data)),
    );
  }, [event?.event_venue_id]);

  const count = useMemo(() => {
    if (!d || !saved) return 0;
    const before = new Map(saved.tiers.map((t) => [t.key, JSON.stringify(t)]));
    let n = 0;
    for (const t of d.tiers) { if (before.get(t.key) !== JSON.stringify(t)) n++; before.delete(t.key); }
    n += before.size;
    if (d.win.onsaleDate !== saved.win.onsaleDate || d.win.onsaleTime !== saved.win.onsaleTime) n++;
    if (JSON.stringify(d.win.artist) !== JSON.stringify(saved.win.artist)) n++;
    if (JSON.stringify(d.win.venue) !== JSON.stringify(saved.win.venue)) n++;
    return n;
  }, [d, saved]);

  const save = useCallback(async () => {
    if (!d || !saved) return false;
    setError("");
    for (const [i, t] of d.tiers.entries()) {
      const price = parseFloat(t.price), cap = parseInt(t.capacity);
      const s = t.id ? inv[t.id] : undefined;
      if (!t.name.trim()) { setError(`Tier ${i + 1} needs a name.`); return false; }
      if (isNaN(price) || price < 0) { setError(`${t.name}: the price must be a number.`); return false; }
      if (isNaN(cap) || cap < 1) { setError(`${t.name}: the quantity must be at least 1.`); return false; }
      if (s && s.sold > 0 && price < s.price) { setError(`${t.name}: the price can only go up once tickets have sold (currently ${usd(s.price)}).`); return false; }
      if (s && cap < s.sold) { setError(`${t.name}: the quantity can't go below the ${s.sold} already sold.`); return false; }
    }

    const tiersChanged = JSON.stringify(d.tiers) !== JSON.stringify(saved.tiers);
    if (tiersChanged) {
      const r = await fetch(`/api/events/${id}/ticket-types`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tiers: d.tiers.map((t, i) => ({
            ...(t.id ? { id: t.id } : {}),
            tier_name: t.name.trim(),
            price: parseFloat(t.price),
            capacity: parseInt(t.capacity),
            sort_order: i,
            service_fee_mode: t.svc || null,
            facility_fee_mode: t.fac || null,
            unlock_code: normalizeUnlockCode(t.code) || null,
          })),
        }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Couldn't save the tiers."); return false; }
    }

    // The event's own price and free flag follow the tiers, as the edit form kept them.
    const eventPatch: Record<string, unknown> = {};
    if (tiersChanged && d.tiers.length) {
      eventPatch.price = Math.min(...d.tiers.map((t) => parseFloat(t.price) || 0));
      eventPatch.is_free = d.tiers.every((t) => (parseFloat(t.price) || 0) === 0);
    }
    if (d.win.onsaleDate !== saved.win.onsaleDate || d.win.onsaleTime !== saved.win.onsaleTime) {
      eventPatch.on_sale_at = d.win.onsaleDate ? chicagoToUtcIso(d.win.onsaleDate, d.win.onsaleTime) : null;
    }
    if (Object.keys(eventPatch).length) {
      const r = await fetch(`/api/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eventPatch) });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Tiers saved, but the on-sale time didn't."); return false; }
    }

    if (JSON.stringify(d.win.artist) !== JSON.stringify(saved.win.artist) || JSON.stringify(d.win.venue) !== JSON.stringify(saved.win.venue)) {
      const r = await fetch(`/api/events/${id}/presale`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artist: d.win.artist, venue: d.win.venue }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Couldn't save the presales."); return false; }
    }

    setPriceWarn(null);
    setLoadN((n) => n + 1);
    hub.reload(["event", "tiers"]);
    return true;
  }, [d, saved, inv, id, hub]);

  const discard = useCallback(() => { setD(saved); setError(""); setPriceWarn(null); }, [saved]);
  useSectionDirty("tickets", count, save, discard);

  if (!event) return null;
  if (!d || !saved) return <HubLoading label="Tickets & pricing" />;

  const ctx = {
    ticketingFee: Number(room?.ticketing_fee ?? event.ticketing_fee ?? 3) || 0,
    facilityFee: Number(room?.facility_fee ?? 0) || 0,
    feesIncludedInPrice: event.fees_included_in_price === true,
    facilityFeeEnabled: d.tiers.length > 0 && !d.tiers.every((t) => (parseFloat(t.price) || 0) === 0),
  };

  const upd = (key: string, patch: Partial<Tier>) =>
    setD((prev) => (prev ? { ...prev, tiers: prev.tiers.map((t) => (t.key === key ? { ...t, ...patch } : t)) } : prev));
  const setWin = (patch: Partial<Windows>) => setD((prev) => (prev ? { ...prev, win: { ...prev.win, ...patch } } : prev));
  const setPre = (which: "artist" | "venue", patch: Partial<Presale>) =>
    setD((prev) => (prev ? { ...prev, win: { ...prev.win, [which]: { ...prev.win[which], ...patch } } } : prev));

  const addTier = () =>
    setD((prev) => (prev ? { ...prev, tiers: [...prev.tiers, { key: newKey(), name: "New tier", price: "40", capacity: "50", svc: "", fac: "", code: "" }] } : prev));
  const removeTier = (key: string) => setD((prev) => (prev ? { ...prev, tiers: prev.tiers.filter((t) => t.key !== key) } : prev));

  const onsaleIso = d.win.onsaleDate ? chicagoToUtcIso(d.win.onsaleDate, d.win.onsaleTime) : null;
  const beforeOnsale = !!onsaleIso && new Date(onsaleIso).getTime() > Date.now();
  const offSale = !!closesAt && new Date(closesAt).getTime() < Date.now();

  if (!d.tiers.length && !saved.tiers.length) {
    return (
      <HubEmpty
        title="No ticket tiers yet"
        body="Add at least one tier with a price and a quantity. Each tier can add, include or waive its fees, and can be locked behind an unlock code."
        ctas={[{ label: "+ Add tier", onClick: addTier }]}
      />
    );
  }

  return (
    <div className="hub-tickets">
      <section className="hub-card hub-card--glow hub-tiers-card">
        {error && <div className="hub-error">{error}</div>}
        <div className="hub-card-line">
          <div className="hub-eyebrow">Tiers</div>
          <span className="hub-spacer" />
          <div className="hub-card-note">Click a fee&apos;s mode to switch between added, included and waived</div>
        </div>
        <div className="hub-tiers-scroll">
          <div className="hub-tiers">
            <div className="hub-tier-row hub-tier-row--head">
              <div>Tier</div><div>Face</div><div>Service fee</div><div>Facility fee</div><div>Qty</div><div className="hub-num">Sold</div><div>Status</div>
            </div>
            {d.tiers.map((t) => {
              const s = t.id ? inv[t.id] : undefined;
              const sold = s?.sold ?? 0;
              const floor = sold > 0 ? s!.price : 0;
              const face = parseFloat(t.price) || 0;
              const cap = parseInt(t.capacity) || 0;
              const fees = resolveTierFees(ctx, { service_fee_mode: t.svc || null, facility_fee_mode: t.fac || null });
              const net = face - (fees.service.mode === "included" ? fees.service.earned : 0) - (fees.facility.mode === "included" ? fees.facility.earned : 0);
              const status = cap > 0 && sold >= cap ? { label: "Sold out", tone: "bad" }
                : offSale ? { label: "Off sale", tone: "dim" }
                : t.code.trim() ? { label: "Code only", tone: "purp" }
                : beforeOnsale ? { label: `Opens ${fmtWhen(onsaleIso!)}`, tone: "dim" }
                : (event.status || "published") !== "published" ? { label: "Draft", tone: "dim" }
                : { label: "On sale", tone: "good" };
              const step = (delta: number) => {
                const next = Math.max(0, Math.round((face + delta) * 100) / 100);
                if (sold > 0 && next < floor) { setPriceWarn(t.key); return; }
                setPriceWarn(null);
                upd(t.key, { price: String(next) });
              };
              const feeCell = (which: "svc" | "fac") => {
                const r = which === "svc" ? fees.service : fees.facility;
                const amount = which === "svc" ? ctx.ticketingFee : ctx.facilityFee;
                const inherited = !t[which];
                return (
                  <div className="hub-fee">
                    <span className={`hub-fee-amt${r.mode === "waived" ? " is-off" : ""}`}>{usd(amount)}</span>
                    <button
                      type="button"
                      className={`hub-fee-mode is-${r.mode}`}
                      title={inherited ? "Inherited from the show — click to set this tier's own" : "Set on this tier"}
                      onClick={() => upd(t.key, { [which]: CYCLE[r.mode] } as Partial<Tier>)}
                    >
                      {MODE_LABEL[r.mode]}{inherited ? " ·" : ""}
                    </button>
                  </div>
                );
              };
              return (
                <div key={t.key} className="hub-tier">
                  <div className="hub-tier-row">
                    <div className="hub-tier-name">
                      <input value={t.name} onChange={(e) => upd(t.key, { name: e.target.value })} className="hub-tier-input" aria-label="Tier name" />
                      <div className="hub-tier-meta">
                        <span>Buyer pays {usd(face + fees.addedToFace)} · you net {usd(net)}</span>
                        {codeEdit === t.key ? (
                          <input
                            autoFocus
                            value={t.code}
                            placeholder="CODE"
                            onChange={(e) => upd(t.key, { code: e.target.value.toUpperCase().replace(/\s/g, "") })}
                            onBlur={() => setCodeEdit(null)}
                            onKeyDown={(e) => e.key === "Enter" && setCodeEdit(null)}
                            className="hub-code-input"
                            aria-label="Unlock code"
                          />
                        ) : (
                          <button type="button" className={`hub-code${t.code ? " is-on" : ""}`} onClick={() => setCodeEdit(t.key)}>
                            {t.code ? `Code ${t.code}` : "+ Unlock code"}
                          </button>
                        )}
                        {!sold && <button type="button" className="hub-field-link hub-tier-remove" onClick={() => removeTier(t.key)}>Remove</button>}
                      </div>
                    </div>
                    <div className="hub-stepper">
                      <button type="button" className={`hub-step${sold > 0 && face <= floor ? " is-floor" : ""}`} onClick={() => step(-1)} aria-label="Lower price">−</button>
                      <input
                        className="hub-step-value"
                        value={t.price}
                        inputMode="decimal"
                        onChange={(e) => upd(t.key, { price: e.target.value.replace(/[^0-9.]/g, "") })}
                        onBlur={() => { if (sold > 0 && (parseFloat(t.price) || 0) < floor) { setPriceWarn(t.key); upd(t.key, { price: String(floor) }); } }}
                        aria-label="Face price"
                      />
                      <button type="button" className="hub-step" onClick={() => step(1)} aria-label="Raise price">+</button>
                    </div>
                    {feeCell("svc")}
                    {feeCell("fac")}
                    <div className="hub-stepper">
                      <button type="button" className="hub-step" onClick={() => upd(t.key, { capacity: String(Math.max(sold, 1, cap - 10)) })} aria-label="Fewer">−</button>
                      <input className="hub-step-value hub-step-value--qty" value={t.capacity} inputMode="numeric" onChange={(e) => upd(t.key, { capacity: e.target.value.replace(/\D/g, "") })} aria-label="Quantity" />
                      <button type="button" className="hub-step" onClick={() => upd(t.key, { capacity: String(cap + 10) })} aria-label="More">+</button>
                    </div>
                    <div className="hub-num hub-tier-sold">{sold.toLocaleString()}{sold > 0 ? " ↑" : ""}</div>
                    <div><span className={`hub-tier-status is-${status.tone}`}>{status.label}</span></div>
                  </div>
                  {priceWarn === t.key && (
                    <div className="hub-tier-warn">
                      <span className="hub-tier-warn-icon">↑</span>
                      <div className="hub-tier-warn-text">
                        {t.name} has sold {sold} at {usd0(floor)}. Its price can go up but not below that. Lowering it would mean refunding the difference to all {sold} buyers.
                      </div>
                      <button type="button" className="hub-card-link" onClick={() => go("promotions")}>Make a promo code →</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="hub-tiers-foot">
          <button type="button" className="hub-btn" onClick={addTier}>+ Add tier</button>
          <div className="hub-tiers-note">
            A tier that has sold tickets can only go up in price. People who already bought paid the old price, and a lower price would mean refunding the difference to every one of them. To sell cheaper, add a new tier or use a promo code.
          </div>
        </div>
      </section>

      <div className="hub-tickets-pair">
        <section className="hub-card">
          <div className="hub-eyebrow">On-sale windows</div>
          <div className="hub-wins">
            <div className="hub-win">
              <div><div className="hub-win-label">General on-sale</div><div className="hub-win-sub">Everyone · Central time</div></div>
              <div className="hub-win-pair">
                <input type="date" className="hub-in hub-in--sm" value={d.win.onsaleDate} onChange={(e) => setWin({ onsaleDate: e.target.value })} />
                <input type="time" className="hub-in hub-in--sm" value={d.win.onsaleTime} onChange={(e) => setWin({ onsaleTime: e.target.value })} />
              </div>
            </div>
            {(["artist", "venue"] as const).map((which) => {
              const p = d.win[which];
              const name = which === "artist" ? "Artist presale" : "Venue presale";
              return (
                <div key={which} className="hub-win-group">
                  <div className="hub-win">
                    <div><div className="hub-win-label">{name}</div><div className="hub-win-sub">{p.enabled ? (p.code ? `Code ${p.code}` : "Needs a code") : "Off"}</div></div>
                    <div className="hub-choices">
                      <button type="button" className={`hub-choice hub-choice--sm${p.enabled ? " is-on" : ""}`} onClick={() => setPre(which, { enabled: true })}>On</button>
                      <button type="button" className={`hub-choice hub-choice--sm${!p.enabled ? " is-on" : ""}`} onClick={() => setPre(which, { enabled: false })}>Off</button>
                    </div>
                  </div>
                  {p.enabled && (
                    <>
                      <div className="hub-win">
                        <div><div className="hub-win-label">Opens</div></div>
                        <input type="datetime-local" className="hub-in hub-in--sm" value={p.starts_at} onChange={(e) => setPre(which, { starts_at: e.target.value })} />
                      </div>
                      <div className="hub-win">
                        <div><div className="hub-win-label">Closes</div></div>
                        <input type="datetime-local" className="hub-in hub-in--sm" value={p.ends_at} onChange={(e) => setPre(which, { ends_at: e.target.value })} />
                      </div>
                      <div className="hub-win">
                        <div><div className="hub-win-label">Code</div><div className="hub-win-sub">Buyers type this to unlock</div></div>
                        <input className="hub-in hub-in--sm" maxLength={15} value={p.code} onChange={(e) => setPre(which, { code: e.target.value.toUpperCase().replace(/\s/g, "") })} />
                      </div>
                      <div className="hub-win">
                        <div><div className="hub-win-label">Cap</div><div className="hub-win-sub">Blank for no limit</div></div>
                        <input className="hub-in hub-in--sm" inputMode="numeric" value={p.capacity} onChange={(e) => setPre(which, { capacity: e.target.value.replace(/\D/g, "") })} />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            <div className="hub-win">
              <div><div className="hub-win-label">Online off-sale</div><div className="hub-win-sub">Set by the venue&apos;s sales window</div></div>
              <div className="hub-win-fixed">{closesAt ? fmtWhen(closesAt) : "—"}</div>
            </div>
          </div>
        </section>

        <section className="hub-card hub-card--quiet">
          <div className="hub-eyebrow">How fees read to the buyer</div>
          <div className="hub-feekey">
            <div><span className="hub-feekey-label is-added">Added</span><span>Shown as its own line at checkout, on top of the face price.</span></div>
            <div><span className="hub-feekey-label is-included">Included</span><span>Built into the face price. The buyer sees one number; the fee comes out of your net.</span></div>
            <div><span className="hub-feekey-label is-waived">Waived</span><span>Not charged at all on this tier.</span></div>
          </div>
          <div className="hub-card-foot">
            Amounts are the room&apos;s rate card{room ? "" : " (no room picked — platform defaults)"}. A mode with a dot is the show&apos;s default; clicking it sets the tier&apos;s own.
          </div>
        </section>
      </div>
    </div>
  );
}
