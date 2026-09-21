"use client";

/**
 * The offer builder's right rail (handoff/screens/offers.dc.html): walkout
 * scenarios, comparables from this venue's own settlements, and the actions.
 * It stays put while the tabs change, so the money is never a tab you can
 * forget to visit; walkouts drop out on Deal lab, whose own readout replaces
 * them.
 *
 * Walkouts come from lib/offers/walkout.ts, which runs the shared
 * artistPayout() at each sell-through. Comparables are finalized settlements
 * — real shows in this room — never estimates.
 */

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Eyebrow, fmtUSD } from "@/app/components/admin/ui";
import { breakEvenShare, guaranteeInExpenses, walkoutAt, type WalkoutBasis } from "@/lib/offers/walkout";

type Comparable = {
  id: string;
  event_title?: string | null;
  artist_name?: string | null;
  event_date?: string | null;
  tickets_sold_count?: number | null;
  total_gross?: number | null;
  venue_net_profit?: number | null;
  status?: string;
};

const whole = (n: number) => fmtUSD(n, { cents: false });
const pct = (share: number) => `${Math.round(share * 100)}%`;
const toneOf = (n: number) => (n > 0.5 ? "good" : n < -0.5 ? "bad" : "flat");

function dealSentence(b: WalkoutBasis, costs: number): string {
  const d = String(b.dealType || "").toUpperCase();
  const g = whole(b.guarantee);
  const p = Number(b.backendPct) || 0;
  if (d === "FLAT") return `${g} flat — already in the expenses as the Talent line.`;
  if (d === "DOOR") return `${p}% of net receipts, no guarantee.`;
  if (guaranteeInExpenses(d)) {
    return `${g} guarantee (in expenses as Talent), plus anything ${p}% of net after ${whole(costs)} of costs pays above it.`;
  }
  return `${g} guaranteed vs. ${p}% of net after ${whole(costs)} of costs, whichever is greater.`;
}

export default function OfferRail({
  basis,
  showWalkouts,
  venueId,
  artistName,
  agentEmail,
  saving,
  exporting,
  onSave,
  onExport,
}: {
  basis: WalkoutBasis;
  showWalkouts: boolean;
  venueId: string | null;
  artistName: string;
  agentEmail: string;
  saving: boolean;
  exporting: boolean;
  onSave: () => void;
  onExport: () => void;
}) {
  const scenarios = useMemo(() => {
    if (basis.sellable <= 0) return [];
    const rows: Array<{ label: string; share: number }> = [];
    const be = breakEvenShare(basis);
    // Not the P&L tab's "Breakeven" — that one is the offer workbook's figure,
    // (expenses + the artist's pay AT SELLOUT) ÷ average price, so it counts
    // backend that is only owed if the room sells out. This is the sale count
    // where the venue actually stops losing money on these terms.
    if (be !== null && be > 0) rows.push({ label: "Venue stops losing money", share: be });
    rows.push({ label: "Conservative — 60%", share: 0.6 });
    rows.push({ label: "Strong — 80%", share: 0.8 });
    rows.push({ label: "Sellout", share: 1 });
    return rows.map((r) => ({ ...r, w: walkoutAt(r.share, basis), breakEven: r.label === "Venue stops losing money" }));
  }, [basis]);

  const noBreakEven = basis.sellable > 0 && breakEvenShare(basis) === null;

  const [fetched, setComps] = useState<Comparable[] | null>(null);
  // No venue, nothing to compare against — no fetch, and no setState in the effect.
  const comps = venueId ? fetched : [];
  useEffect(() => {
    if (!venueId) return;
    let live = true;
    fetch(`/api/settlements?venue_id=${encodeURIComponent(venueId)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Comparable[]) => {
        if (!live) return;
        const finalized = (Array.isArray(rows) ? rows : [])
          .filter((s) => s.status === "finalized")
          .sort((a, b) => String(b.event_date || "").localeCompare(String(a.event_date || "")));
        setComps(finalized.slice(0, 5));
      })
      .catch(() => live && setComps([]));
    return () => {
      live = false;
    };
  }, [venueId]);

  const costsAtSellout = basis.totalFixed + basis.totalVariable;

  return (
    <aside className="ofb-rail">
      {showWalkouts && (
        <Card>
          <Eyebrow>Walkout scenarios</Eyebrow>
          <p className="ofb-rail-lede">{dealSentence(basis, costsAtSellout)}</p>
          {scenarios.length === 0 ? (
            <div className="ofb-rail-empty">Add ticket scaling to see what each side walks out with.</div>
          ) : (
            <div className="ofb-scen">
              {scenarios.map(({ label, share, w, breakEven }) => {
                const g = basis.guarantee;
                const d = String(basis.dealType || "").toUpperCase();
                const over = w.artist - g;
                const basisLine = breakEven
                  ? `${pct(share)} of the room — below the P&L tab's breakeven, which counts the sellout backend`
                  : d === "FLAT"
                    ? "Flat guarantee — the artist's pay doesn't move with sales"
                    : d === "DOOR"
                      ? "Straight percentage of net"
                      : over > 0.5
                        ? `Backend pays ${whole(over)} over the guarantee`
                        : "Guarantee holds — the percentage doesn't beat it";
                return (
                  <div key={label} className={`ofb-scen-row${label === "Sellout" ? " is-top" : ""}`}>
                    <div className="ofb-scen-head">
                      <span className="ofb-scen-label">{label}</span>
                      <span className="ofb-scen-sold">{w.sold.toLocaleString("en-US")} sold</span>
                    </div>
                    <div className="ofb-scen-nums">
                      <div>
                        <span>Net receipts</span>
                        <b>{whole(w.netReceipts)}</b>
                      </div>
                      <div>
                        <span>Artist</span>
                        <b>{whole(w.artist)}</b>
                      </div>
                      <div>
                        <span>Venue net</span>
                        <b className={`ofb-tone-${toneOf(w.venue)}`}>{whole(w.venue)}</b>
                      </div>
                    </div>
                    <div className="ofb-scen-basis">{basisLine}</div>
                  </div>
                );
              })}
            </div>
          )}
          {noBreakEven && (
            <div className="ofb-rail-warn">The venue loses money even at sellout on these terms.</div>
          )}
          <div className="ofb-rail-foot">Every tier sells the same share; fixed costs stay put, variable costs scale.</div>
        </Card>
      )}

      <Card>
        <Eyebrow>Comparables — your own history</Eyebrow>
        <div className="ofb-rail-sub">Finalized settlements at this venue, most recent first</div>
        {comps === null ? (
          <div className="ofb-rail-empty">Loading…</div>
        ) : comps.length === 0 ? (
          <div className="ofb-rail-empty">No finalized settlements at this venue yet.</div>
        ) : (
          <div className="ofb-comps">
            {comps.map((c) => {
              const net = Number(c.venue_net_profit) || 0;
              const date = c.event_date
                ? new Date(String(c.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "—";
              return (
                <a key={c.id} className="ofb-comp" href={`/admin/settlements/${c.id}`}>
                  <span className="ofb-comp-name">
                    <b>{c.event_title || c.artist_name || "Show"}</b>
                    <i>{date}</i>
                  </span>
                  <span className="ofb-comp-sold">{(Number(c.tickets_sold_count) || 0).toLocaleString("en-US")} sold</span>
                  <span className="ofb-comp-gross">{whole(Number(c.total_gross) || 0)}</span>
                  <span className={`ofb-comp-net ofb-tone-${toneOf(net)}`}>
                    {net > 0 ? "+" : ""}
                    {whole(net)}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </Card>

      <div className="ofb-rail-actions">
        <Button variant="primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save offer"}
        </Button>
        <Button onClick={onExport} disabled={exporting}>
          {exporting ? "Generating…" : "Export Excel"}
        </Button>
        {agentEmail && (
          <Button
            variant="ghost"
            href={`mailto:${agentEmail}?subject=${encodeURIComponent(`Offer — ${artistName || "your artist"}`)}`}
          >
            Email agent
          </Button>
        )}
      </div>
    </aside>
  );
}
