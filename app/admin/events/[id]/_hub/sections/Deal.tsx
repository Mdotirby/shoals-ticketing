"use client";

/**
 * Deal — eventhub.dc.html ?tab=deal. The linked offer's deal priced against
 * the show: structure and levers, scaling, the expense estimate, and the P&L
 * today, at break even and at sell-out. Replaces /admin/offers/[id] for a
 * show's linked offer; the offers list stays.
 *
 * The offer's own rules hold:
 *   • A countersigned offer is a contract — its terms change only through a
 *     revision on the offer, so here they read-only with a link to revise.
 *   • A draft or sent offer saves from the hub's save bar, writing the same
 *     derived totals the builder writes (lib/offers/totals), so the record
 *     never carries stale net potential or split point.
 *   • Agents never get rebates, so there is no rebate lever or row.
 * The P&L is lib/offers/walkout — the builder's own rail math.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtUSD } from "@/app/components/admin/ui";
import { breakEvenShare, guaranteeInExpenses, walkoutAt, type WalkoutBasis } from "@/lib/offers/walkout";
import { offerTotals } from "@/lib/offers/totals";
import { useHub, useSectionDirty } from "../HubContext";
import { HubEmpty, HubLoading, HubModal } from "../ui";
import type { HubTab } from "../config";

type Offer = Record<string, unknown> & {
  id: string;
  status: string | null;
  version: number | null;
  artist_name: string | null;
  agent_name: string | null;
  agency: string | null;
  deal_type: string | null;
  guarantee: number | null;
  backend_percentage: number | null;
  deposit_amount: number | null;
  fixed_expenses: Array<{ name: string; amount: number }> | null;
  variable_expenses: Array<{ name: string; rate: number; amount: number; locked?: boolean }> | null;
  ticket_scaling: Array<{ name: string; price: number; sellable_cap: number }> | null;
  updated_at: string | null;
};

type Draft = { deal_type: string; guarantee: number; backend_percentage: number; deposit_amount: number; fixed_expenses: Array<{ name: string; amount: number }> };

const usd = (n: number) => fmtUSD(n, { cents: false });
const TYPES: Array<[string, string]> = [["VS", "Guarantee vs %"], ["FLAT", "Flat guarantee"], ["PLUS", "Guarantee plus %"], ["BONUS", "Guarantee + bonus"]];

function draftOf(o: Offer): Draft {
  return {
    deal_type: String(o.deal_type || "FLAT").toUpperCase(),
    guarantee: Number(o.guarantee) || 0,
    backend_percentage: Number(o.backend_percentage) || 0,
    deposit_amount: Number(o.deposit_amount) || 0,
    fixed_expenses: (Array.isArray(o.fixed_expenses) ? o.fixed_expenses : []).map((e) => ({ name: String(e.name ?? ""), amount: Number(e.amount) || 0 })),
  };
}

export default function Deal({ go }: { go: (t: HubTab) => void }) {
  const hub = useHub();
  const { id, event, sold, role } = hub;
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined);
  const [d, setD] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; artist_name: string | null; event_date: string | null; status: string | null; version: number | null }> | null>(null);
  const [loadN, setLoadN] = useState(0);

  useEffect(() => {
    let live = true;
    import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
      const { data } = await getSupabaseBrowser()
        .from("artist_offers")
        .select("*")
        .eq("event_id", id)
        .is("superseded_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!live) return;
      setOffer((data as Offer) ?? null);
      setD(data ? draftOf(data as Offer) : null);
    });
    return () => { live = false; };
  }, [id, loadN]);

  const saved = useMemo(() => (offer ? draftOf(offer) : null), [offer]);
  const signed = offer?.status === "accepted";
  const canEdit = !signed && ["owner", "super_admin", "venue_admin", "full_admin"].includes(role);

  const count = useMemo(() => {
    if (!d || !saved) return 0;
    let n = 0;
    for (const k of ["deal_type", "guarantee", "backend_percentage", "deposit_amount"] as const) if (d[k] !== saved[k]) n++;
    d.fixed_expenses.forEach((e, i) => { if (e.amount !== saved.fixed_expenses[i]?.amount) n++; });
    return n;
  }, [d, saved]);

  const save = useCallback(async () => {
    if (!offer || !d) return false;
    setError("");
    // The builder's derived totals for the new terms — never a half-updated record.
    const merged = { ...offer, ...d };
    const t = offerTotals(merged);
    const body = {
      ...d,
      gross_potential: t.grossPotential,
      adj_gross: t.adjGross,
      net_potential: t.netPotential,
      tax_amount: t.taxAmount,
      total_fixed: t.totalFixed,
      total_variable: t.totalVariable,
      total_expenses: t.totalExpenses,
      splitpoint: t.splitpoint,
      variable_expenses: t.variableExpensesOut,
    };
    const r = await fetch(`/api/offers/${offer.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Couldn't save the deal."); return false; }
    setLoadN((n) => n + 1);
    hub.reload(["offer"]);
    return true;
  }, [offer, d, hub]);

  const discard = useCallback(() => { setD(saved); setError(""); }, [saved]);
  useSectionDirty("deal", count, save, discard);

  const openPicker = async () => {
    setPicking(true);
    const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
    const { data } = await getSupabaseBrowser()
      .from("artist_offers")
      .select("id, artist_name, event_date, status, version")
      .is("event_id", null)
      .is("superseded_at", null)
      .order("created_at", { ascending: false })
      .limit(60);
    setCandidates(data ?? []);
  };

  const link = async (offerId: string | null) => {
    const target = offerId ?? offer?.id;
    if (!target) return;
    const r = await fetch(`/api/offers/${target}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_id: offerId ? id : null }) });
    if (!r.ok) { hub.toast((await r.json().catch(() => ({}))).error || "Couldn't change the link."); return; }
    setPicking(false);
    setLoadN((n) => n + 1);
    hub.reload(["offer"]);
    hub.toast(offerId ? "Offer linked. The deal, break even and settlement read from it now." : "Offer unlinked.");
  };

  if (!event) return null;
  if (offer === undefined) return <HubLoading label="the deal" />;

  const picker = picking && (
    <HubModal eyebrow="Deal" title="Link an offer" width={560} onClose={() => setPicking(false)}>
      <div className="hub-modal-body">Offers not yet attached to a show. Linking one brings in its deal, scaling and expenses.</div>
      <div className="hub-pick-list">
        {candidates === null && <div className="hub-alert-none">Loading offers…</div>}
        {candidates?.length === 0 && <div className="hub-alert-none">Every offer is already linked to a show.</div>}
        {candidates?.map((c) => (
          <button key={c.id} type="button" className="hub-switch-row" onClick={() => link(c.id)}>
            <span className={`hub-dot hub-dot--${c.status === "accepted" ? "good" : "warn"}`} />
            <span className="hub-switch-text">
              <span className="hub-switch-name">{c.artist_name || "Untitled offer"}</span>
              <span className="hub-switch-meta">{c.event_date ? new Date(c.event_date.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "No date"} · v{c.version ?? 1}</span>
            </span>
            <span className="hub-switch-status">{c.status === "accepted" ? "Signed" : c.status || "Draft"}</span>
          </button>
        ))}
      </div>
    </HubModal>
  );

  if (!offer || !d) {
    return (
      <>
        <HubEmpty
          title="No offer linked"
          body="Link the signed offer for this show to bring in its deal, scaling and expenses, or start a new offer."
          ctas={[{ label: "Link an offer", onClick: openPicker }, { label: "Create offer", href: `/admin/offers/new?event_id=${id}` }]}
        />
        {picker}
      </>
    );
  }

  const t = offerTotals({ ...offer, ...d });
  const scaling = Array.isArray(offer.ticket_scaling) ? offer.ticket_scaling : [];
  const offerSellable = scaling.reduce((n, r) => n + (Number(r.sellable_cap) || 0), 0);
  const basis: WalkoutBasis = {
    netPotential: t.netPotential, totalFixed: t.totalFixed, totalVariable: t.totalVariable,
    sellable: offerSellable, guarantee: d.guarantee, backendPct: d.backend_percentage, dealType: d.deal_type,
  };
  const be = offerSellable > 0 ? breakEvenShare(basis) : null;
  const todayShare = offerSellable > 0 ? Math.min(1, sold / offerSellable) : 0;
  const cols = [
    { label: "Today", share: todayShare, sub: `${sold.toLocaleString()} sold` },
    { label: "Break even", share: be ?? 1, sub: be === null ? "not at sell-out" : `${Math.ceil((be ?? 0) * offerSellable).toLocaleString()} sold` },
    { label: "Sell-out", share: 1, sub: `${offerSellable.toLocaleString()} sold` },
  ].map((c) => ({ ...c, w: walkoutAt(c.share, basis) }));
  const inExp = guaranteeInExpenses(d.deal_type);

  const set = (patch: Partial<Draft>) => canEdit && setD((p) => (p ? { ...p, ...patch } : p));
  const lever = (label: string, sub: string, value: string, dec: () => void, inc: () => void) => (
    <div className="hub-lever">
      <div className="hub-lever-text"><div className="hub-unlock-what">{label}</div><div className="hub-promo-sub">{sub}</div></div>
      {canEdit && <button type="button" className="hub-step hub-step--lg" onClick={dec}>−</button>}
      <div className="hub-lever-value">{value}</div>
      {canEdit && <button type="button" className="hub-step hub-step--lg" onClick={inc}>+</button>}
    </div>
  );

  const explain: Record<string, string> = {
    VS: `The artist gets ${usd(d.guarantee)} or ${d.backend_percentage}% of what's left after expenses, whichever is more.`,
    FLAT: `The artist gets ${usd(d.guarantee)} no matter how the show sells. Everything above that and expenses is yours.`,
    PLUS: `The artist gets ${usd(d.guarantee)} plus ${d.backend_percentage}% of what's left after expenses.`,
    BONUS: `The artist gets ${usd(d.guarantee)}, with a bonus of ${d.backend_percentage}% of what's left after expenses.`,
  };

  return (
    <div className="hub-deal">
      {picker}
      <div className="hub-deal-banner">
        <span className={`hub-dot hub-dot--${signed ? "good" : "warn"}`} />
        <div className="hub-deal-banner-text">
          <div className="hub-msg-title">{offer.artist_name || "Linked offer"} · v{offer.version ?? 1} {signed ? "countersigned" : offer.status || "draft"}{offer.updated_at ? ` ${new Date(offer.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>
          <div className="hub-promo-sub">
            {[offer.agent_name, offer.agency].filter(Boolean).join(", ") || "No agent on the offer"} ·{" "}
            {signed ? "Signed terms change only through a revision on the offer." : canEdit ? "Changes here save to the offer." : "Read only for your role."}
          </div>
        </div>
        <a className="hub-card-link" href={`/admin/offers/${offer.id}`}>{signed ? "Revise on the offer →" : "Open offer →"}</a>
        {!signed && canEdit && <button type="button" className="hub-card-link" onClick={() => confirm("Unlink this offer from the show?") && link(null)}>Unlink</button>}
      </div>
      {error && <div className="hub-error">{error}</div>}

      <div className="hub-deal-grid">
        <section className="hub-card hub-card--glow">
          <div className="hub-eyebrow">Deal structure</div>
          <div className="hub-choices hub-deal-types">
            {TYPES.map(([v, l]) => (
              <button key={v} type="button" disabled={!canEdit && d.deal_type !== v} className={`hub-choice hub-choice--sm${d.deal_type === v ? " is-on" : ""}`} onClick={() => set({ deal_type: v })}>{l}</button>
            ))}
          </div>
          <div className="hub-levers">
            {lever("Guarantee", inExp ? "Also the Talent line in expenses — change both" : "Paid whatever the show does", usd(d.guarantee), () => set({ guarantee: Math.max(0, d.guarantee - 500) }), () => set({ guarantee: d.guarantee + 500 }))}
            {d.deal_type !== "FLAT" && lever("Artist backend", "Of net after expenses", `${d.backend_percentage}%`, () => set({ backend_percentage: Math.max(0, d.backend_percentage - 5) }), () => set({ backend_percentage: Math.min(100, d.backend_percentage + 5) }))}
            {lever("Deposit", "Paid to the agency before the show", usd(d.deposit_amount), () => set({ deposit_amount: Math.max(0, d.deposit_amount - 500) }), () => set({ deposit_amount: d.deposit_amount + 500 }))}
          </div>
          <div className="hub-card-foot">{explain[d.deal_type] ?? ""}</div>
        </section>

        <section className="hub-card hub-card--glow">
          <div className="hub-card-line">
            <div className="hub-eyebrow">Scaling</div>
            <span className="hub-spacer" />
            <button type="button" className="hub-card-link" onClick={() => go("tickets")}>Tickets &amp; pricing →</button>
          </div>
          <div className="hub-scale-row hub-scale-row--head"><div>Tier</div><div className="hub-num">Face</div><div className="hub-num">Cap</div><div className="hub-num">Potential</div></div>
          {scaling.map((r, i) => (
            <div key={i} className="hub-scale-row">
              <div className="hub-attr-name">{r.name}</div>
              <div className="hub-num hub-link-n">{fmtUSD(Number(r.price) || 0)}</div>
              <div className="hub-num hub-link-n is-dim">{(Number(r.sellable_cap) || 0).toLocaleString()}</div>
              <div className="hub-num hub-link-rev">{usd((Number(r.price) || 0) * (Number(r.sellable_cap) || 0))}</div>
            </div>
          ))}
          <div className="hub-scale-total"><span>Gross potential at sell-out</span><b>{usd(t.grossPotential)}</b></div>
          <div className="hub-card-foot hub-card-foot--quiet">The offer&apos;s scaling, as agreed with the agent. The tiers on sale are on Tickets &amp; pricing.</div>
        </section>

        <section className="hub-card hub-card--glow">
          <div className="hub-card-line">
            <div className="hub-eyebrow">Expenses estimate</div>
            <span className="hub-spacer" />
            <div className="hub-deal-total">{usd(t.totalExpenses)}</div>
          </div>
          {d.fixed_expenses.map((e, i) => (
            <div key={i} className="hub-exp-row">
              <div className="hub-exp-name">{e.name || "Expense"}</div>
              {canEdit && <button type="button" className="hub-step" onClick={() => set({ fixed_expenses: d.fixed_expenses.map((x, j) => (j === i ? { ...x, amount: Math.max(0, x.amount - 50) } : x)) })}>−</button>}
              <div className="hub-exp-amt">{usd(e.amount)}</div>
              {canEdit && <button type="button" className="hub-step" onClick={() => set({ fixed_expenses: d.fixed_expenses.map((x, j) => (j === i ? { ...x, amount: x.amount + 50 } : x)) })}>+</button>}
            </div>
          ))}
          {t.variableExpensesOut.map((e, i) => (
            <div key={`v${i}`} className="hub-exp-row is-dim">
              <div className="hub-exp-name">{e.name}{e.rate ? ` · ${(Number(e.rate) * 100).toFixed(1)}% of gross` : ""}</div>
              <div className="hub-exp-amt">{usd(Number(e.amount) || 0)}</div>
            </div>
          ))}
          {d.fixed_expenses.length === 0 && t.variableExpensesOut.length === 0 && <div className="hub-alert-none">No expenses on the offer.</div>}
        </section>

        <section className="hub-card hub-card--glow">
          <div className="hub-eyebrow">P&amp;L</div>
          <div className="hub-pnl">
            <div className="hub-pnl-row hub-pnl-row--head">
              <div />
              {cols.map((c) => <div key={c.label} className="hub-num"><b>{c.label}</b><span>{c.sub}</span></div>)}
            </div>
            {[
              { label: "Net box office", get: (w: typeof cols[0]["w"]) => w.netReceipts },
              { label: "Expenses", get: (w: typeof cols[0]["w"]) => -w.expenses },
              { label: inExp ? "Artist backend" : "Artist", get: (w: typeof cols[0]["w"]) => -(inExp ? w.artist - d.guarantee : w.artist) },
            ].map((r) => (
              <div key={r.label} className="hub-pnl-row">
                <div className="hub-pnl-label">{r.label}</div>
                {cols.map((c) => <div key={c.label} className="hub-num hub-link-n">{usd(r.get(c.w))}</div>)}
              </div>
            ))}
            <div className="hub-pnl-row is-total">
              <div className="hub-pnl-label">Venue net</div>
              {cols.map((c) => <div key={c.label} className={`hub-num ${c.w.venue >= 0 ? "is-good" : "is-bad"}`}>{usd(c.w.venue)}</div>)}
            </div>
          </div>
          <div className="hub-card-foot hub-card-foot--quiet">
            Every tier sells the same share; variable expenses scale with it.{inExp ? " The guarantee sits in expenses as Talent, so only the backend is listed as artist." : ""} The settlement uses what actually sold and was spent.
          </div>
        </section>
      </div>
    </div>
  );
}
