"use client";

/**
 * Promotions — eventhub.dc.html ?tab=promotions. Discount codes for this
 * show, and the codes that change what a buyer can see (presales and
 * code-locked tiers). Replaces the codes half of the edit form's Promo &
 * tracking tab.
 *
 * Production's promo model is percent or amount off, a use limit, a start
 * and an end, applying to the whole order; the mockup's "fixed price" type
 * and per-tier "applies to" aren't things checkout can honour yet, so the
 * drawer doesn't offer them. Status is Active / Paused / Used up / Ended /
 * Scheduled, from the row's own fields; Active and Paused toggle.
 */

import { useCallback, useEffect, useState } from "react";
import { fmtUSD } from "@/app/components/admin/ui";
import { useHub } from "../HubContext";
import { HubActions } from "../HubShell";
import { HubDrawer, HubEmpty, HubLoading } from "../ui";

type Promo = {
  id: string;
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  max_uses: number | null;
  current_uses: number | null;
  active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  is_presale: boolean | null;
};

type Presale = { enabled: boolean; code: string | null; starts_at: string | null; ends_at: string | null; capacity: number | null };

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }) : null;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

function statusOf(p: Promo, now: number): { label: string; tone: string; toggles: boolean } {
  if (p.max_uses && (p.current_uses ?? 0) >= p.max_uses) return { label: "Used up", tone: "dim", toggles: false };
  if (p.expires_at && new Date(p.expires_at).getTime() < now) return { label: "Ended", tone: "dim", toggles: false };
  if (!p.active) return { label: "Paused", tone: "warn", toggles: true };
  if (p.starts_at && new Date(p.starts_at).getTime() > now) return { label: "Scheduled", tone: "dim", toggles: true };
  return { label: "Active", tone: "good", toggles: true };
}

const blank = () => ({ code: "", type: "percentage" as Promo["discount_type"], value: 10, limit: 50, start: "", end: "" });

export default function Promotions() {
  const hub = useHub();
  const { id, tiers } = hub;
  const [promos, setPromos] = useState<Promo[] | null>(null);
  const [presale, setPresale] = useState<{ artist: Presale | null; venue: Presale | null } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [pd, setPd] = useState(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const load = useCallback(() => {
    fetch(`/api/promo-codes?event_id=${id}`).then((r) => (r.ok ? r.json() : [])).then((d) => setPromos(Array.isArray(d) ? d : [])).catch(() => setPromos([]));
    fetch(`/api/events/${id}/presale`).then((r) => (r.ok ? r.json() : null)).then(setPresale).catch(() => setPresale(null));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const toggle = async (p: Promo) => {
    setBusy(p.id);
    const r = await fetch(`/api/promo-codes?id=${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) });
    setBusy(null);
    if (!r.ok) { hub.toast("Couldn't change that code."); return; }
    setPromos((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    hub.reload(["promos"]);
    hub.toast(`${p.code} ${p.active ? "paused" : "is live again"}.`);
  };

  const create = async () => {
    setError("");
    const code = pd.code.trim().toUpperCase();
    if (!code) { setError("Give the code a name."); return; }
    if (pd.type === "percentage" && (pd.value <= 0 || pd.value > 100)) { setError("A percent off is between 1 and 100."); return; }
    if (pd.end && pd.start && pd.end < pd.start) { setError("The code ends before it starts."); return; }
    const r = await fetch("/api/promo-codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: id,
        code,
        discount_type: pd.type,
        discount_value: pd.value,
        max_uses: pd.limit || null,
        starts_at: pd.start ? `${pd.start}T00:00:00` : null,
        expires_at: pd.end ? `${pd.end}T23:59:59` : null,
      }),
    });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Couldn't create the code."); return; }
    setDrawer(false);
    setPd(blank());
    load();
    hub.reload(["promos"]);
    hub.toast(`${code} is live.`);
  };

  const unlocks: Array<{ code: string; what: string; window: string; uses: string; status: string; tone: string }> = [];
  for (const [key, label] of [["artist", "artist"], ["venue", "venue"]] as const) {
    const p = presale?.[key];
    if (!p?.code) continue;
    const ended = !!p.ends_at && new Date(p.ends_at).getTime() < now;
    const before = !!p.starts_at && new Date(p.starts_at).getTime() > now;
    unlocks.push({
      code: p.code,
      what: `Unlocks the ${label} presale window`,
      window: [when(p.starts_at), when(p.ends_at)].filter(Boolean).join(" – ") || "No window set",
      uses: p.capacity ? `cap ${p.capacity}` : "",
      status: !p.enabled ? "Off" : ended ? "Ended" : before ? "Scheduled" : "Active",
      tone: !p.enabled || ended ? "dim" : before ? "dim" : "good",
    });
  }
  for (const t of tiers) {
    const code = typeof t.unlock_code === "string" ? t.unlock_code : null;
    if (!code) continue;
    const full = t.capacity > 0 && t.quantity_sold >= t.capacity;
    unlocks.push({
      code,
      what: `Shows the hidden ${t.tier_name} tier`,
      window: "Until the tier sells out",
      uses: `${t.quantity_sold} sold`,
      status: full ? "Sold out" : "Active",
      tone: full ? "dim" : "good",
    });
  }
  for (const p of promos ?? []) {
    if (!p.is_presale) continue;
    const s = statusOf(p, now);
    unlocks.push({ code: p.code, what: "Presale access code", window: [day(p.starts_at), day(p.expires_at)].filter(Boolean).join(" – ") || "No end date", uses: `${p.current_uses ?? 0} used`, status: s.label, tone: s.tone });
  }

  const discounts = (promos ?? []).filter((p) => !p.is_presale);
  const valueLabel = pd.type === "percentage" ? `${pd.value}% off` : `${fmtUSD(pd.value)} off`;
  const preview = `${pd.code.trim().toUpperCase() || "CODE"} gives ${valueLabel} the whole order${pd.limit ? `, for the first ${pd.limit} uses` : ""}${pd.start || pd.end ? `, ${pd.start ? day(`${pd.start}T12:00:00`) : "now"} to ${pd.end ? day(`${pd.end}T12:00:00`) : "the show"}` : ""}. Fees still apply on top.`;

  return (
    <>
      <HubActions>
        <button type="button" className="hub-btn hub-btn--primary" onClick={() => setDrawer(true)}>+ New code</button>
      </HubActions>

      {promos === null ? (
        <HubLoading label="Promotions" />
      ) : !discounts.length && !unlocks.length ? (
        <HubEmpty title="No promo codes" body="Create a discount code, or a presale code that unlocks tickets early." ctas={[{ label: "+ New code", onClick: () => setDrawer(true) }]} />
      ) : (
        <div className="hub-promos">
          <section className="hub-card hub-card--glow">
            <div className="hub-eyebrow">Promo codes &amp; discounts</div>
            {discounts.length === 0 ? (
              <div className="hub-alert-none">No discount codes on this show.</div>
            ) : (
              <div className="hub-tiers-scroll">
                <div className="hub-promo-table">
                  <div className="hub-promo-row hub-promo-row--head">
                    <div>Code</div><div>Type</div><div>Value</div><div>Uses / limit</div><div>Window</div><div>Status</div>
                  </div>
                  {discounts.map((p) => {
                    const s = statusOf(p, now);
                    const used = p.current_uses ?? 0;
                    return (
                      <div key={p.id} className="hub-promo-row">
                        <div>
                          <div className="hub-promo-code">{p.code}</div>
                          <div className="hub-promo-sub">Whole order</div>
                        </div>
                        <div className="hub-promo-type">{p.discount_type === "percentage" ? "Percent off" : "Amount off"}</div>
                        <div className="hub-promo-value">{p.discount_type === "percentage" ? `${p.discount_value}%` : fmtUSD(p.discount_value)}</div>
                        <div>
                          <div className="hub-promo-uses">{used} / {p.max_uses ?? "∞"}</div>
                          <div className="hub-attr-bar"><div style={{ width: `${p.max_uses ? Math.min(100, Math.round((used / p.max_uses) * 100)) : 0}%` }} /></div>
                        </div>
                        <div className="hub-promo-window">{[day(p.starts_at) ?? "Now", day(p.expires_at) ?? "show"].join(" – ")}</div>
                        <div>
                          <button
                            type="button"
                            className={`hub-tier-status is-${s.tone} hub-promo-status`}
                            disabled={!s.toggles || busy === p.id}
                            title={s.toggles ? "Click to pause or resume" : undefined}
                            onClick={() => toggle(p)}
                          >
                            {busy === p.id ? "…" : s.label}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="hub-card hub-card--quiet">
            <div className="hub-card-line">
              <div className="hub-eyebrow">Presale &amp; unlock codes</div>
              <span className="hub-spacer" />
              <div className="hub-card-note">These change what a buyer can see, not what they pay</div>
            </div>
            {unlocks.length === 0 && <div className="hub-alert-none">No presale or unlock codes. Set them on Tickets &amp; pricing.</div>}
            {unlocks.map((u) => (
              <div key={u.code + u.what} className="hub-unlock">
                <div className="hub-unlock-code">{u.code}</div>
                <div className="hub-unlock-text">
                  <div className="hub-unlock-what">{u.what}</div>
                  <div className="hub-promo-sub">{u.window}</div>
                </div>
                <div className="hub-unlock-uses">{u.uses}</div>
                <div className={`hub-unlock-status is-${u.tone}`}>{u.status}</div>
              </div>
            ))}
          </section>
        </div>
      )}

      {drawer && (
        <HubDrawer onClose={() => setDrawer(false)}>
          <div className="hub-drawer-head">
            <div><div className="hub-drawer-title">New promo code</div></div>
            <button type="button" className="hub-x" onClick={() => setDrawer(false)} aria-label="Close">✕</button>
          </div>
          {error && <div className="hub-error">{error}</div>}
          <div className="hub-field">
            <div className="hub-field-head"><label className="hub-field-label" htmlFor="pd-code">Code</label></div>
            <input id="pd-code" className="hub-in" placeholder="e.g. FANWEEK" value={pd.code} onChange={(e) => setPd({ ...pd, code: e.target.value.toUpperCase().replace(/\s/g, "") })} />
          </div>
          <div className="hub-field">
            <div className="hub-field-head"><div className="hub-field-label">Type</div></div>
            <div className="hub-choices">
              <button type="button" className={`hub-choice${pd.type === "percentage" ? " is-on" : ""}`} onClick={() => setPd({ ...pd, type: "percentage", value: 10 })}>Percent off</button>
              <button type="button" className={`hub-choice${pd.type === "fixed" ? " is-on" : ""}`} onClick={() => setPd({ ...pd, type: "fixed", value: 5 })}>Amount off</button>
            </div>
          </div>
          {[
            { label: "Value", value: pd.type === "percentage" ? `${pd.value}%` : fmtUSD(pd.value), dec: () => setPd({ ...pd, value: Math.max(1, pd.value - (pd.type === "percentage" ? 5 : 1)) }), inc: () => setPd({ ...pd, value: Math.min(pd.type === "percentage" ? 100 : 9999, pd.value + (pd.type === "percentage" ? 5 : 1)) }) },
            { label: "Use limit", value: pd.limit ? String(pd.limit) : "No limit", dec: () => setPd({ ...pd, limit: Math.max(0, pd.limit - 10) }), inc: () => setPd({ ...pd, limit: pd.limit + 10 }) },
          ].map((f) => (
            <div key={f.label} className="hub-drawer-step">
              <div className="hub-field-label">{f.label}</div>
              <button type="button" className="hub-step hub-step--lg" onClick={f.dec}>−</button>
              <div className="hub-drawer-step-value">{f.value}</div>
              <button type="button" className="hub-step hub-step--lg" onClick={f.inc}>+</button>
            </div>
          ))}
          <div className="hub-fields hub-fields--two">
            <div className="hub-field">
              <div className="hub-field-head"><label className="hub-field-label" htmlFor="pd-start">Starts</label></div>
              <input id="pd-start" type="date" className="hub-in" value={pd.start} onChange={(e) => setPd({ ...pd, start: e.target.value })} />
            </div>
            <div className="hub-field">
              <div className="hub-field-head"><label className="hub-field-label" htmlFor="pd-end">Ends</label></div>
              <input id="pd-end" type="date" className="hub-in" value={pd.end} onChange={(e) => setPd({ ...pd, end: e.target.value })} />
            </div>
          </div>
          <div className="hub-field">
            <div className="hub-field-head"><div className="hub-field-label">Applies to</div></div>
            <div className="hub-field-hint">The whole order, every tier. Codes for a single tier aren&apos;t supported at checkout yet — for that, lock the tier with an unlock code on Tickets &amp; pricing.</div>
          </div>
          <div className="hub-drawer-preview">{preview}</div>
          <button type="button" className="hub-btn hub-btn--primary hub-btn--block" onClick={create}>Create code</button>
        </HubDrawer>
      )}
    </>
  );
}
