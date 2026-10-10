"use client";

/**
 * Marketing — eventhub.dc.html ?tab=marketing. Tracking links with what
 * each one sold, the sales timeline, attribution by channel, the show's
 * ads, and messaging its buyers. Replaces the workspace Marketing tab, the
 * links half of the edit form's Promo & tracking, the marketing event page
 * and the Ad engine's summary.
 *
 * Every figure is the show's own: a link's orders and revenue are the paid
 * orders carrying its slug; a channel is the link's source (or the order's
 * utm_source), and Direct is everything without one. The timeline is built
 * from dates the system records — presales, on-sale, links going out, and
 * sell-through milestones from the orders — never an invented event.
 *
 * Ads reads the Ad engine for this show: pre-launch checks, budget caps
 * (editable) and campaigns (pause / resume). Building creatives and
 * launching campaigns stays in the Ad engine. Messaging one show's buyers
 * isn't built yet, so that card says so beside the real audience size.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import TrackableLinkQRModal from "@/app/components/admin/TrackableLinkQRModal";
import { fmtUSD } from "@/app/components/admin/ui";
import { localTodayISO } from "@/lib/dates";
import { useHub } from "../HubContext";
import { HubActions } from "../HubShell";
import { HubDrawer, HubEmpty, HubLoading } from "../ui";
import { isPaidSale, useEventLinks, useEventOrders, type HubLink } from "../useEventData";

const usd = (n: number) => fmtUSD(n, { cents: false });
const shortDay = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

type AdOverview = {
  counts: { assets: number; videos: number; hooks: number; creatives: number };
  budget_cap: { daily_cap_total: number; campaign_cap_total: number } | null;
  campaigns: Array<{ id: string; name: string; platform: string; status: string; mode: string; current_daily_budget: number; current_total_spend: number }>;
  performance: { totals: { spend: number; conversions: number; revenue: number; roas: number } };
  validation_meta: { ready: boolean; missing: string[]; checks: Record<string, { required?: number; have?: number; ok: boolean }> };
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export default function Marketing() {
  const hub = useHub();
  const { id, event, capacity } = hub;
  const { data: orders } = useEventOrders(id);
  const { data: links, refresh: refreshLinks } = useEventLinks(id);
  const [ads, setAds] = useState<AdOverview | null | "none">(null);
  const [caps, setCaps] = useState<{ daily: number; total: number } | null>(null);
  const [qr, setQr] = useState<{ url: string; label: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  // The link the drawer is editing; null when it's making a new one.
  const [editing, setEditing] = useState<HubLink | null>(null);
  const [form, setForm] = useState({ label: "", slug: "", source: "", medium: "", campaign: "" });
  const [error, setError] = useState("");
  const [presale, setPresale] = useState<{ artist?: { enabled?: boolean; starts_at?: string | null } | null; venue?: { enabled?: boolean; starts_at?: string | null } | null } | null>(null);

  const loadAds = useCallback(() => {
    fetch(`/api/ad-engine/events/${id}/overview`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : "none"))
      .then((d) => {
        setAds(d);
        if (d && d !== "none") setCaps({ daily: d.budget_cap?.daily_cap_total ?? 0, total: d.budget_cap?.campaign_cap_total ?? 0 });
      })
      .catch(() => setAds("none"));
  }, [id]);
  useEffect(() => { loadAds(); }, [loadAds]);
  useEffect(() => {
    fetch(`/api/events/${id}/presale`).then((r) => (r.ok ? r.json() : null)).then(setPresale).catch(() => {});
  }, [id]);

  const paid = useMemo(() => (orders ?? []).filter(isPaidSale), [orders]);

  const perLink = useMemo(() => {
    const m = new Map<string, { orders: number; rev: number }>();
    for (const o of paid) {
      if (!o.tracking_link_slug) continue;
      const r = m.get(o.tracking_link_slug) ?? { orders: 0, rev: 0 };
      r.orders += 1;
      r.rev += Number(o.total_amount) || 0;
      m.set(o.tracking_link_slug, r);
    }
    return m;
  }, [paid]);

  const channels = useMemo(() => {
    const src = new Map((links ?? []).map((l) => [l.slug, l.source || l.label || l.slug]));
    const m = new Map<string, number>();
    for (const o of paid) {
      const name = (o.tracking_link_slug && src.get(o.tracking_link_slug)) || o.utm_source || "Direct";
      const key = name.charAt(0).toUpperCase() + name.slice(1);
      m.set(key, (m.get(key) ?? 0) + (Number(o.total_amount) || 0));
    }
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, rev]) => ({ name, rev, pct: Math.round((rev / total) * 100) }));
  }, [paid, links]);

  const timeline = useMemo(() => {
    if (!event) return [];
    type T = { day: string; label: string; sub: string; n: string; tone: string };
    const rows: T[] = [];
    const ticketsOn = (day: string) => paid.filter((o) => localTodayISO(new Date(o.created_at)) === day).reduce((t, o) => t + (Number(o.quantity) || 1), 0);
    const pre = [presale?.artist && { ...presale.artist, who: "Artist" }, presale?.venue && { ...presale.venue, who: "Venue" }].filter(Boolean) as Array<{ enabled?: boolean; starts_at?: string | null; who: string }>;
    for (const p of pre) {
      if (!p.enabled || !p.starts_at) continue;
      const d = p.starts_at.slice(0, 10);
      rows.push({ day: d, label: `${p.who} presale opens`, sub: "Code-only window", n: ticketsOn(d) ? `${ticketsOn(d)} sold` : "", tone: "purp" });
    }
    if (event.on_sale_at) {
      const d = localTodayISO(new Date(String(event.on_sale_at)));
      rows.push({ day: d, label: "General on-sale", sub: "Open to everyone", n: ticketsOn(d) ? `${ticketsOn(d)} sold` : "", tone: "good" });
    }
    for (const l of links ?? []) {
      const d = localTodayISO(new Date(l.created_at));
      const sold = perLink.get(l.slug)?.orders ?? 0;
      rows.push({ day: d, label: `Link out: ${l.label || l.slug}`, sub: [l.source, l.medium].filter(Boolean).join(" · ") || "Tracking link", n: sold ? `${sold} order${sold === 1 ? "" : "s"}` : "", tone: "blue" });
    }
    // Sell-through milestones, read from the orders in the order they sold.
    if (capacity.sellable > 0) {
      const asc = [...paid].sort((a, b) => a.created_at.localeCompare(b.created_at));
      let run = 0;
      const marks = [25, 50, 75, 100];
      for (const o of asc) {
        const before = run;
        run += Number(o.quantity) || 1;
        for (const m of marks) {
          const at = Math.ceil((capacity.sellable * m) / 100);
          if (before < at && run >= at) rows.push({ day: localTodayISO(new Date(o.created_at)), label: m === 100 ? "Sold out" : `${m}% sold`, sub: `${at.toLocaleString()} of ${capacity.sellable.toLocaleString()}`, n: "", tone: m === 100 ? "bad" : "warn" });
        }
      }
    }
    // The best day, when it isn't already one of the dates above.
    const byDay = new Map<string, number>();
    for (const o of paid) { const d = localTodayISO(new Date(o.created_at)); byDay.set(d, (byDay.get(d) ?? 0) + (Number(o.quantity) || 1)); }
    const best = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && !rows.some((r) => r.day === best[0])) rows.push({ day: best[0], label: "Best day so far", sub: "Most tickets in a single day", n: `${best[1]} sold`, tone: "good" });
    return rows.sort((a, b) => a.day.localeCompare(b.day));
  }, [event, paid, links, perLink, presale, capacity.sellable]);

  if (!event) return null;
  if (orders === null || links === null) return <HubLoading label="Marketing" />;

  const buyers = new Set(paid.map((o) => (o.customer_email || "").trim().toLowerCase()).filter(Boolean)).size;
  const shortUrl = (slug: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/t/${slug}`;

  const blankForm = { label: "", slug: "", source: "", medium: "", campaign: "" };
  const openNew = () => { setEditing(null); setForm(blankForm); setError(""); setDrawer(true); };
  const openEdit = (l: HubLink) => {
    setEditing(l);
    setForm({ label: l.label ?? "", slug: l.slug, source: l.source ?? "", medium: l.medium ?? "", campaign: l.campaign ?? "" });
    setError("");
    setDrawer(true);
  };

  const saveLink = async () => {
    setError("");
    const label = form.label.trim();
    if (!label) { setError("Give the link a label."); return; }
    if (editing) {
      // The slug is the link itself — it's out in the world, so it never changes.
      const r = await fetch(`/api/events/${id}/trackable-links/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, source: form.source.trim() || null, medium: form.medium.trim() || null, campaign: form.campaign.trim() || null }),
      });
      if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Couldn't save the link."); return; }
      setDrawer(false);
      refreshLinks();
      hub.toast(`${label} saved.`);
      return;
    }
    const slug = slugify(form.slug || form.label);
    if (!slug) { setError("Give the link a label."); return; }
    const r = await fetch(`/api/events/${id}/trackable-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, slug, source: form.source.trim(), medium: form.medium.trim(), campaign: form.campaign.trim(), destination_type: "event_page" }),
    });
    if (!r.ok) { setError((await r.json().catch(() => ({}))).error || "Couldn't create the link."); return; }
    setDrawer(false);
    setForm(blankForm);
    refreshLinks();
    hub.toast(`${label} is ready — ${shortUrl(slug)}`);
  };

  const setActive = async (l: HubLink, on: boolean) => {
    const r = await fetch(`/api/events/${id}/trackable-links/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: on }) });
    if (!r.ok) { hub.toast("Couldn't change the link."); return; }
    refreshLinks();
    hub.toast(on ? `${l.label || l.slug} is live again.` : `${l.label || l.slug} paused — it opens the event page without crediting the sale.`);
  };

  const removeLink = async (l: HubLink) => {
    const sold = perLink.get(l.slug)?.orders ?? 0;
    if (!confirm(`Delete ${l.label || l.slug}?${sold ? `\n\nIts ${sold} order${sold === 1 ? "" : "s"} keep their slug but lose the label here.` : ""} Anything already printed or posted with this link stops being tracked.`)) return;
    const r = await fetch(`/api/events/${id}/trackable-links?linkId=${l.id}`, { method: "DELETE" });
    if (!r.ok) { hub.toast("Couldn't delete the link."); return; }
    setDrawer(false);
    refreshLinks();
    hub.toast("Link deleted.");
  };

  const copyLink = async (l: HubLink) => {
    try { await navigator.clipboard.writeText(shortUrl(l.slug)); hub.toast(`Copied ${shortUrl(l.slug)}`); }
    catch { hub.toast(shortUrl(l.slug)); }
  };

  const saveCaps = async (next: { daily: number; total: number }) => {
    setCaps(next);
    await fetch(`/api/ad-engine/events/${id}/budget-cap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_cap_total: next.daily, campaign_cap_total: next.total }),
    });
    loadAds();
  };

  const control = async (cid: string, action: "pause" | "resume") => {
    await fetch(`/api/ad-engine/campaigns/${cid}/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    loadAds();
    hub.toast(action === "pause" ? "Campaign paused." : "Campaign running.");
  };

  const ad = ads && ads !== "none" ? ads : null;
  const checkRows = ad
    ? [
        ["Creatives", ad.validation_meta.checks.creatives],
        ["Videos", ad.validation_meta.checks.videos],
        ["Hooks", ad.validation_meta.checks.hooks],
        ["Budget cap set", ad.validation_meta.checks.budget_cap_set],
        ["Meta identity selected", ad.validation_meta.checks.identity_selected],
      ].filter(([, c]) => c) as Array<[string, { required?: number; have?: number; ok: boolean }]>
    : [];

  return (
    <>
      <HubActions>
        <button type="button" className="hub-btn" onClick={openNew}>+ Tracking link</button>
      </HubActions>

      <div className="hub-mkt">
        <section className="hub-card hub-card--glow">
          <div className="hub-eyebrow">Tracking links</div>
          {links.length === 0 ? (
            <HubEmpty title="No tracking links yet" body="Make one link for each place you post this show, so every sale is credited to the right channel." ctas={[{ label: "+ New tracking link", onClick: openNew }]} />
          ) : (
            <div className="hub-tiers-scroll">
              <div className="hub-link-table">
                <div className="hub-link-row hub-link-row--head">
                  <div>Label</div><div>Slug</div><div>Source / medium / campaign</div><div className="hub-num">Clicks</div><div className="hub-num">Orders</div><div className="hub-num">Revenue</div><div className="hub-num">Manage</div>
                </div>
                {links.map((l) => {
                  const s = perLink.get(l.slug);
                  return (
                    <div key={l.id} className={`hub-link-row${l.is_active === false ? " is-paused" : ""}`}>
                      <div className="hub-link-name">{l.label || l.slug}{l.is_active === false && <span className="hub-link-paused">Paused</span>}</div>
                      <div className="hub-link-slug">/t/{l.slug}</div>
                      <div className="hub-link-utm">{[l.source, l.medium, l.campaign].filter(Boolean).join(" / ") || "—"}</div>
                      <div className="hub-num hub-link-n" data-label="Clicks">{(l.clicks ?? 0).toLocaleString()}</div>
                      <div className="hub-num hub-link-n" data-label="Orders">{s?.orders ?? 0}</div>
                      <div className={`hub-num hub-link-rev${s?.rev ? "" : " is-dim"}`}>{usd(s?.rev ?? 0)}</div>
                      <div className="hub-link-actions">
                        <button type="button" className="evl-act" title="Copy link" onClick={() => copyLink(l)}>⧉</button>
                        <button type="button" className="evl-act" title="QR code" onClick={() => setQr({ url: shortUrl(l.slug), label: l.label || l.slug })}>▦</button>
                        <button type="button" className="evl-act" title="Edit" onClick={() => openEdit(l)}>✎</button>
                        <button type="button" className="evl-act" title={l.is_active === false ? "Resume" : "Pause"} onClick={() => setActive(l, l.is_active === false)}>{l.is_active === false ? "▶" : "❚❚"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <div className="hub-mkt-pair">
          <section className="hub-card hub-card--glow">
            <div className="hub-eyebrow">Sales timeline</div>
            <div className="hub-tl">
              {timeline.length === 0 && <div className="hub-alert-none">Nothing on the timeline yet — no on-sale date, links or sales.</div>}
              {timeline.map((e, i) => (
                <div key={i} className="hub-tl-row">
                  <div className="hub-tl-date">{shortDay(e.day)}</div>
                  <div className="hub-tl-rail"><span className={`hub-tl-dot is-${e.tone}`} /><span className="hub-tl-line" /></div>
                  <div className="hub-tl-text"><div className="hub-tl-label">{e.label}</div><div className="hub-tl-sub">{e.sub}</div></div>
                  <div className="hub-tl-n">{e.n}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="hub-card hub-card--glow">
            <div className="hub-eyebrow">Attribution by channel</div>
            <div className="hub-attr">
              {channels.length === 0 && <div className="hub-alert-none">No paid orders yet.</div>}
              {channels.map((c, i) => (
                <div key={c.name}>
                  <div className="hub-attr-line">
                    <div className="hub-attr-name">{c.name}</div>
                    <div className="hub-attr-orders">{c.pct}%</div>
                    <div className="hub-attr-rev">{usd(c.rev)}</div>
                  </div>
                  <div className="hub-attr-bar hub-attr-bar--thick"><div className={i === 0 ? "is-lead" : ""} style={{ width: `${c.pct}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="hub-card-foot hub-card-foot--quiet">By the tracking link on the order, or its UTM source. Direct means the buyer arrived without either.</div>
          </section>
        </div>

        <section className="hub-card hub-card--glow">
          <div className="hub-card-line">
            <div className="hub-eyebrow">Ads</div>
            <span className="hub-spacer" />
            <div className="hub-card-note">
              {ad ? `${usd(ad.performance.totals.spend)} spent · ${ad.performance.totals.conversions} conversions · ${ad.performance.totals.roas.toFixed(1)}× ROAS` : ads === null ? "Loading…" : "Not set up for this show"}
            </div>
          </div>
          {ads === null ? null : !ad ? (
            <div className="hub-alert-none">The Ad engine has nothing for this show yet. <a className="hub-card-link" href={`/admin/events/${id}/ads`}>Open the Ad engine →</a></div>
          ) : (
            <>
              <div className="hub-ads-grid">
                <div>
                  <div className="hub-ads-sub">Pre-launch checks</div>
                  {checkRows.map(([label, c]) => (
                    <div key={label} className="hub-ads-check">
                      <span className={`hub-check-mark${c.ok ? " is-done" : ""}`}>{c.ok ? "✓" : "!"}</span>
                      <div className="hub-ads-check-label">{label}{c.required !== undefined ? ` · ${c.have ?? 0} of ${c.required}` : ""}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="hub-ads-sub">Budget caps</div>
                  {caps && ([
                    ["Daily cap", "Across every campaign for this show", "daily", 10],
                    ["Total cap", "The most this show will ever spend", "total", 100],
                  ] as const).map(([label, sub, key, step]) => (
                    <div key={key} className="hub-ads-cap">
                      <div className="hub-ads-cap-text"><div className="hub-ads-check-label">{label}</div><div className="hub-promo-sub">{sub}</div></div>
                      <button type="button" className="hub-step hub-step--lg" onClick={() => saveCaps({ ...caps, [key]: Math.max(0, caps[key] - step) })}>−</button>
                      <div className="hub-drawer-step-value">{caps[key] ? usd(caps[key]) : "None"}</div>
                      <button type="button" className="hub-step hub-step--lg" onClick={() => saveCaps({ ...caps, [key]: caps[key] + step })}>+</button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="hub-tiers-scroll">
                <div className="hub-camp-table">
                  <div className="hub-camp-row hub-camp-row--head"><div>Campaign</div><div className="hub-num">Spend</div><div className="hub-num">Daily</div><div>Mode</div><div>State</div></div>
                  {ad.campaigns.length === 0 && <div className="hub-alert-none">No campaigns yet. Build creatives and launch from the Ad engine.</div>}
                  {ad.campaigns.map((c) => {
                    const running = c.status === "active" || c.status === "running";
                    return (
                      <div key={c.id} className="hub-camp-row">
                        <div><div className="hub-link-name">{c.name}</div><div className="hub-promo-sub">{c.platform}</div></div>
                        <div className="hub-num hub-link-n" data-label="Spend">{usd(c.current_total_spend || 0)}</div>
                        <div className="hub-num hub-link-n" data-label="Daily">{usd(c.current_daily_budget || 0)}</div>
                        <div className="hub-promo-type">{c.mode}</div>
                        <div>
                          <button type="button" className={`hub-tier-status hub-promo-status is-${running ? "good" : "warn"}`} onClick={() => control(c.id, running ? "pause" : "resume")}>
                            {running ? "Running" : c.status === "paused" ? "Paused" : c.status}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="hub-card-foot hub-card-foot--quiet">Per-campaign orders and ROAS aren&apos;t tracked yet — the totals above are the show&apos;s. <a className="hub-card-link" href={`/admin/events/${id}/ads`}>Creatives and launching live in the Ad engine →</a></div>
            </>
          )}
        </section>

        <section className="hub-card hub-msg">
          <div className="hub-msg-text">
            <div className="hub-msg-title">Message this show&apos;s buyers</div>
            <div className="hub-msg-body">
              {buyers.toLocaleString()} {buyers === 1 ? "person has" : "people have"} a paid ticket (unique emails). Sending to one show&apos;s buyers isn&apos;t built yet — broadcasts today go to the whole subscriber list.
            </div>
          </div>
          <a href="/admin/marketing?tab=broadcasts" className="hub-btn">Broadcasts →</a>
        </section>
      </div>

      {drawer && (
        <HubDrawer onClose={() => setDrawer(false)}>
          <div className="hub-drawer-head">
            <div><div className="hub-eyebrow">Marketing</div><div className="hub-drawer-title">{editing ? editing.label || editing.slug : "New tracking link"}</div></div>
            <button type="button" className="hub-x" onClick={() => setDrawer(false)} aria-label="Close">✕</button>
          </div>
          {error && <div className="hub-error">{error}</div>}
          {([
            ["label", "Label", "e.g. Instagram story"],
            ["slug", "Slug", slugify(form.label) || "instagram-story"],
            ["source", "Source", "instagram"],
            ["medium", "Medium", "social"],
            ["campaign", "Campaign", "onsale"],
          ] as const).map(([k, label, ph]) => (
            <div key={k} className="hub-field">
              <div className="hub-field-head"><label className="hub-field-label" htmlFor={`tl-${k}`}>{label}</label></div>
              <input
                id={`tl-${k}`}
                className="hub-in"
                placeholder={ph}
                value={form[k]}
                disabled={k === "slug" && !!editing}
                onChange={(e) => setForm({ ...form, [k]: k === "slug" ? slugify(e.target.value) : e.target.value })}
              />
              {k === "slug" && editing && <div className="hub-field-foot"><div className="hub-field-hint">The slug is the link people already have, so it can&apos;t change. Make a new link instead.</div></div>}
            </div>
          ))}
          <div className="hub-drawer-preview">Short link: {shortUrl(editing ? editing.slug : slugify(form.slug || form.label) || "your-slug")} — opens this show&apos;s page and credits the sale to it.</div>
          {editing && (
            <div className="hub-link-tools">
              <button type="button" className="hub-btn hub-btn--sm" onClick={() => copyLink(editing)}>Copy link</button>
              <button type="button" className="hub-btn hub-btn--sm" onClick={() => setQr({ url: shortUrl(editing.slug), label: editing.label || editing.slug })}>QR code</button>
              <button type="button" className="hub-btn hub-btn--sm" onClick={() => { setActive(editing, editing.is_active === false); setDrawer(false); }}>{editing.is_active === false ? "Resume" : "Pause"}</button>
              <span className="hub-spacer" />
              <button type="button" className="hub-btn hub-btn--sm hub-btn--quiet hub-danger" onClick={() => removeLink(editing)}>Delete</button>
            </div>
          )}
          <button type="button" className="hub-btn hub-btn--primary hub-btn--block" onClick={saveLink}>{editing ? "Save link" : "Create link"}</button>
        </HubDrawer>
      )}

      {qr && <TrackableLinkQRModal url={qr.url} label={qr.label} eventTitle={event.title} onClose={() => setQr(null)} />}
    </>
  );
}
