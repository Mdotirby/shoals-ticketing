"use client";

import { useEffect, useState } from "react";

/**
 * TICKETING — the mockup's `tickets` screen.
 *
 * KPI strip, inventory & release with gates, the sales curve, and codes, for
 * one show. It sits above the order list on this page because "how is this
 * show selling" is the question people open it with; "who bought ticket 412"
 * is the one they scroll for.
 *
 * ── WHAT THE MOCKUP ASKS FOR AND DOES NOT GET ─────────────────────────────
 * Add-ons in the same cart — parking passes, merch bundles, coat check —
 * do not exist in this schema. There are no add-on products, so the panel is
 * omitted rather than mocked.
 *
 * "Pace vs. comparable +12%" and the pace-intervention estimates ("release
 * balcony as a $29 flex tier, +~180 est.") need a nominated comparable show
 * and a forecasting model. Neither exists. This screen is used to decide
 * whether to release inventory; a made-up estimate on it is worse than a
 * blank space, so the curve shows this show's own daily units — a fact — and
 * the pace note states what is measurable.
 */

type Data = {
  event: { id: string; title: string; date: string; venue: string | null; onSaleAt: string | null; isFree: boolean };
  window: { state: string; storefrontOpen: boolean; boxOfficeOpen: boolean };
  kpis: {
    sold: number; paidTickets: number; compedTickets: number; scannedIn: number;
    sellable: number; room: number | null; sellThrough: number;
    gross: number; faceValue: number; feesRetained: number; avgTicket: number; orders: number;
  };
  inventory: { id: string; name: string; price: number; alloc: number; sold: number; comped: number; held: number; sellThrough: number }[];
  eventHolds: { quantity: number; type: string | null; label: string | null }[];
  curve: { date: string; units: number }[];
  codes: { code: string; kind: string; note: string; used: number; max: number | null; active: boolean }[];
  presales: { type: string; code: string | null; starts_at: string | null; ends_at: string | null }[];
};

const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The mockup's thresholds: 85%+ mint, 55%+ plain, below that dim.
const barFill = (pct: number) =>
  pct >= 85 ? "linear-gradient(90deg, #8fd6a8, rgba(143,214,168,0.45))"
    : pct >= 55 ? "linear-gradient(90deg, rgba(255,255,255,0.80), rgba(255,255,255,0.45))"
      : "linear-gradient(90deg, rgba(255,255,255,0.44), rgba(255,255,255,0.22))";

export default function TicketingPanel({ eventId }: { eventId: string }) {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/ticketing/${eventId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401 || r.status === 403) { setErr("You don't have access to this show's inventory."); return; }
        if (!r.ok) { setErr("Could not load inventory."); return; }
        setD(await r.json());
      })
      .catch(() => { if (!cancelled) setErr("Could not load inventory."); });
    return () => { cancelled = true; };
  }, [eventId]);

  if (err) return <div className="tkt"><div className="tkt-card"><p className="tkt-note">{err}</p></div></div>;
  if (!d) return <div className="tkt"><div className="tkt-card"><p className="tkt-note">Loading inventory…</p></div></div>;

  const k = d.kpis;
  const peak = Math.max(1, ...d.curve.map((c) => c.units));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const heldTotal = d.inventory.reduce((s, t) => s + t.held, 0) + d.eventHolds.reduce((s, h) => s + h.quantity, 0);

  return (
    <div className="tkt">

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="tkt-kpis">
        {[
          { label: "Sold", value: k.sold.toLocaleString(), sub: k.sellable > 0 ? `${k.sellThrough}% of ${k.sellable.toLocaleString()} sellable` : "no tiers loaded", tone: "#fff" },
          { label: "Gross", value: money(k.gross), sub: `${k.orders} order${k.orders === 1 ? "" : "s"}`, tone: "#fff" },
          { label: "Face value", value: money(k.faceValue), sub: `${money(k.avgTicket)} avg ticket`, tone: "#fff" },
          { label: "Fees retained", value: money(k.feesRetained), sub: "service + facility", tone: "#fff" },
          { label: "Checked in", value: k.scannedIn.toLocaleString(), sub: `${k.compedTickets} comped of ${k.sold}`, tone: k.scannedIn > 0 ? "#8fd6a8" : "#fff" },
        ].map((c) => (
          <div key={c.label} className="tkt-kpi">
            <div className="tkt-kpi-label">{c.label}</div>
            <div className="tkt-kpi-value" style={{ color: c.tone }}>{c.value}</div>
            <div className="tkt-kpi-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Inventory & release ──────────────────────────────────────── */}
      <div className="tkt-card">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div className="tkt-eyebrow">Inventory &amp; release</div>
          <span style={{ flex: 1 }} />
          <span className="tkt-note">
            {d.window.state === "past" ? "Sales closed"
              : d.window.state === "late" ? "Web closed · box office open until midnight"
                : d.window.storefrontOpen ? "On sale" : "Not on sale"}
          </span>
        </div>

        <div className="tkt-ihead" style={{ marginTop: 14 }}>
          <div>Ticket type</div>
          <div>Alloc</div>
          <div>Sold</div>
          <div>Held</div>
          <div>Sell-through</div>
          <div>Gate</div>
        </div>

        {d.inventory.length === 0 && (
          <p className="tkt-note" style={{ marginTop: 14 }}>
            No tiers loaded for this show, so there is nothing on sale. The storefront has
            no price to show.
          </p>
        )}

        {d.inventory.map((t) => (
          <div key={t.id} className="tkt-irow">
            <div style={{ minWidth: 0 }}>
              <div className="tkt-iname">{t.name}</div>
              <div className="tkt-iwhen">
                {money(t.price)}
                {t.comped > 0 && ` · ${t.comped} comped`}
              </div>
            </div>
            <div className="tkt-inum">{t.alloc.toLocaleString()}</div>
            <div className="tkt-inum">{t.sold.toLocaleString()}</div>
            <div className="tkt-inum">{t.held ? t.held.toLocaleString() : "—"}</div>
            <div>
              <div className="tkt-bar"><span style={{ width: `${Math.min(100, t.sellThrough)}%`, background: barFill(t.sellThrough) }} /></div>
              <div className="tkt-pct" style={{ marginTop: 4, color: t.sellThrough >= 85 ? "#8fd6a8" : "var(--tkt-w72)" }}>
                {t.alloc > 0 ? `${t.sellThrough}%` : "—"}
              </div>
            </div>
            <div>
              <span className={`tkt-gate ${d.presales.length > 0 ? "tkt-gate--code" : d.event.onSaleAt && new Date(d.event.onSaleAt) > new Date() ? "tkt-gate--timed" : ""}`}>
                {d.presales.length > 0 ? "Code"
                  : d.event.onSaleAt && new Date(d.event.onSaleAt) > new Date() ? "Timed"
                    : "Public"}
              </span>
            </div>
          </div>
        ))}

        {(heldTotal > 0 || d.eventHolds.length > 0) && (
          <p className="tkt-note" style={{ marginTop: 12 }}>
            {heldTotal.toLocaleString()} seat{heldTotal === 1 ? "" : "s"} withheld
            {d.eventHolds.length > 0 && ` — ${d.eventHolds.map((h) => `${h.quantity} ${h.label || h.type || "held"}`).join(", ")}`}
            . Held seats are already out of the sellable cap, so they do not reduce sell-through twice.
          </p>
        )}
      </div>

      {/* ── Sales curve ──────────────────────────────────────────────── */}
      {d.curve.length > 1 && (
        <div className="tkt-card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div className="tkt-eyebrow">Sales curve</div>
            <span style={{ flex: 1 }} />
            <span className="tkt-note">daily units · peak {peak}</span>
          </div>
          <div className="tkt-curve">
            {d.curve.map((c) => (
              <div
                key={c.date}
                className={`tkt-curve-bar ${c.date === today ? "tkt-curve-bar--today" : ""}`}
                style={{ height: `${Math.max(3, (c.units / peak) * 100)}%` }}
                title={`${c.date} · ${c.units} ticket${c.units === 1 ? "" : "s"}`}
              />
            ))}
          </div>
          <div className="tkt-curve-axis">
            <span>{d.curve[0]?.date}</span>
            <span>{d.curve[d.curve.length - 1]?.date}</span>
          </div>
          <p className="tkt-note" style={{ marginTop: 10 }}>
            This show&apos;s own daily units. The design draws it against a comparable show —
            that needs a nominated comparable and a forecasting model, neither of which
            exists, and a guessed pace figure on the screen you use to decide whether to
            release inventory is worse than none.
          </p>
        </div>
      )}

      {/* ── Codes ────────────────────────────────────────────────────── */}
      <div className="tkt-card">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div className="tkt-eyebrow">Codes</div>
          <span style={{ flex: 1 }} />
          <span className="tkt-note">access codes unlock · promo codes discount</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
          {d.codes.length === 0 && d.presales.length === 0 && (
            <p className="tkt-note">No codes on this show.</p>
          )}
          {d.presales.map((p) => (
            <div key={p.type} className="tkt-code">
              <span className="tkt-code-name">{p.code || "—"}</span>
              <span className="tkt-gate tkt-gate--code" style={{ flex: "none" }}>Access</span>
              <span className="tkt-code-note">{p.type} presale</span>
              <span className="tkt-code-used">
                {p.starts_at ? new Date(p.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
              </span>
            </div>
          ))}
          {d.codes.map((c) => (
            <div key={c.code} className="tkt-code" style={{ opacity: c.active ? 1 : 0.55 }}>
              <span className="tkt-code-name">{c.code}</span>
              <span className={`tkt-gate ${c.kind === "Access" ? "tkt-gate--code" : "tkt-gate--timed"}`} style={{ flex: "none" }}>{c.kind}</span>
              <span className="tkt-code-note">{c.note}{!c.active && " · inactive"}</span>
              <span className="tkt-code-used">{c.used}{c.max ? ` / ${c.max}` : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
