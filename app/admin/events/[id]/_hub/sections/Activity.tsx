"use client";

/**
 * Activity — eventhub.dc.html ?tab=activity. Who changed what on this show,
 * and when, filterable by area.
 *
 * Two sources, and the row says which:
 *   • The audit log (/api/admin/audit?event_id=) — changes recorded with who
 *     made them and, where the log keeps it, before → after: a live show's
 *     title, date or venue edited, a refund, an offer revision, an unlock.
 *   • The show's own records — a code, link, hold or guest created, an offer
 *     version, the settlement started or finalized. These carry a date but
 *     not an author, so the row says "not recorded" rather than guessing.
 * Roles without read_audit see the second source only, and are told so.
 */

import { useEffect, useMemo, useState } from "react";
import { useHub } from "../HubContext";
import { HubLoading } from "../ui";

type Row = { when: string; who: string | null; area: string; what: string; before?: string; after?: string; recorded: boolean };

const AREAS = ["All", "Details", "Tickets", "Inventory", "Promotions", "Marketing", "Orders", "Guest list", "Deal", "Settlement"];
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const show = (v: unknown) => {
  if (v === null || v === undefined || v === "") return "—";
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s.replace(/[+-]\d{2}:\d{2}$|Z$/, "")).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return s;
};
const FIELD: Record<string, string> = { title: "Title", date: "Date and time", venue: "Venue", event_venue_id: "Room", venue_id: "Host" };

type Audit = { id: string; action: string; target_type: string; detail: Record<string, unknown> | null; created_at: string; actor_name: string | null; actor_role: string | null };

function fromAudit(e: Audit): Row[] {
  const who = e.actor_name ? `${e.actor_name}${e.actor_role === "agent" ? " · agent" : ""}` : "System";
  const d = e.detail ?? {};
  switch (e.action) {
    case "event.edited_while_selling":
      return ((d.changes as Array<{ field: string; before: unknown; after: unknown }>) ?? []).map((c) => ({
        when: e.created_at, who, area: "Details", what: FIELD[c.field] ?? c.field, before: show(c.before), after: show(c.after), recorded: true,
      }));
    case "event.unlocked_for_edit":
      return [{ when: e.created_at, who, area: "Details", what: "Unlocked a selling show's title, date and venue for editing", recorded: true }];
    case "order.refunded":
      return [{ when: e.created_at, who, area: "Orders", what: `Refunded an order${d.reason ? ` — ${String(d.reason).replace(/_/g, " ")}` : ""}`, before: "Paid", after: d.amount !== undefined ? `Refunded $${Number(d.amount).toFixed(2)}` : "Refunded", recorded: true }];
    case "offer.revision_created":
      return [{ when: e.created_at, who, area: "Deal", what: "Started a revision of the signed offer", recorded: true }];
    case "settlement_ledger.backfill":
      return [{ when: e.created_at, who, area: "Settlement", what: "Rebuilt the ticket ledger from the orders", recorded: true }];
    default:
      return [{ when: e.created_at, who, area: e.target_type === "event" ? "Details" : "Settlement", what: e.action.replace(/[._]/g, " "), recorded: true }];
  }
}

export default function Activity() {
  const hub = useHub();
  const { id } = hub;
  const [audit, setAudit] = useState<Audit[] | "denied" | null>(null);
  const [records, setRecords] = useState<Row[] | null>(null);
  const [area, setArea] = useState("All");

  useEffect(() => {
    let live = true;
    fetch(`/api/admin/audit?event_id=${id}&limit=200`)
      .then((r) => (r.status === 401 || r.status === 403 ? "denied" : r.ok ? r.json().then((d) => d.entries ?? []) : []))
      .then((d) => live && setAudit(d))
      .catch(() => live && setAudit([]));

    // Dated records the show already keeps.
    (async () => {
      const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
      const sb = getSupabaseBrowser();
      const [promos, links, holds, guests, offers, settles] = await Promise.all([
        fetch(`/api/promo-codes?event_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        sb.from("trackable_links").select("label, slug, created_at").eq("event_id", id),
        sb.from("event_holds").select("quantity, hold_type, owner_label, created_at, released_at").eq("event_id", id),
        fetch(`/api/artists/guests?event_id=${id}`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
        sb.from("artist_offers").select("version, status, created_at, updated_at").eq("event_id", id),
        sb.from("settlements").select("status, created_at, updated_at").eq("event_id", id),
      ]);
      const out: Row[] = [];
      for (const p of Array.isArray(promos) ? promos : []) if (p.created_at) out.push({ when: p.created_at, who: null, area: "Promotions", what: `${p.code} created${p.is_presale ? " (presale)" : ""}`, recorded: false });
      for (const l of links.data ?? []) out.push({ when: l.created_at, who: null, area: "Marketing", what: `Tracking link ${l.label || l.slug} created`, recorded: false });
      for (const h of holds.data ?? []) {
        if (h.created_at) out.push({ when: h.created_at, who: null, area: "Inventory", what: `${h.quantity} held for ${h.owner_label || h.hold_type}`, recorded: false });
        if (h.released_at) out.push({ when: h.released_at, who: null, area: "Inventory", what: `${h.quantity} released (${h.owner_label || h.hold_type})`, recorded: false });
      }
      for (const g of Array.isArray(guests) ? guests : []) if (g.created_at) out.push({ when: g.created_at, who: g.added_by ?? null, area: "Guest list", what: `${[g.first_name, g.last_name].filter(Boolean).join(" ")}${g.quantity > 1 ? ` +${g.quantity - 1}` : ""} added`, recorded: !!g.added_by });
      for (const o of offers.data ?? []) {
        out.push({ when: o.created_at, who: null, area: "Deal", what: `Offer v${o.version ?? 1} drafted`, recorded: false });
        if (o.status === "accepted" && o.updated_at) out.push({ when: o.updated_at, who: null, area: "Deal", what: `Offer v${o.version ?? 1} countersigned`, recorded: false });
      }
      for (const s of settles.data ?? []) {
        out.push({ when: s.created_at, who: null, area: "Settlement", what: "Settlement started", recorded: false });
        if (s.status === "finalized" && s.updated_at) out.push({ when: s.updated_at, who: null, area: "Settlement", what: "Settlement finalized", recorded: false });
      }
      if (live) setRecords(out);
    })().catch(() => live && setRecords([]));
    return () => { live = false; };
  }, [id]);

  const rows = useMemo(() => {
    const a = Array.isArray(audit) ? audit.flatMap(fromAudit) : [];
    return [...a, ...(records ?? [])].sort((x, y) => y.when.localeCompare(x.when));
  }, [audit, records]);

  if (audit === null || records === null) return <HubLoading label="Activity" />;

  const shown = rows.filter((r) => area === "All" || r.area === area);

  return (
    <div className="hub-activity">
      <div className="hub-choices">
        {AREAS.map((a) => (
          <button key={a} type="button" className={`hub-choice hub-choice--sm${area === a ? " is-on" : ""}`} onClick={() => setArea(a)}>
            {a}{a !== "All" ? <span className="hub-choice-n">{rows.filter((r) => r.area === a).length || ""}</span> : null}
          </button>
        ))}
      </div>
      <section className="hub-card hub-card--glow">
        {audit === "denied" && <div className="hub-card-foot hub-card-foot--quiet hub-act-note">Your role can&apos;t read the audit log, so only the show&apos;s own dated records are listed.</div>}
        {shown.map((r, i) => (
          <div key={i} className="hub-act-row">
            <div className="hub-act-when">{when(r.when)}</div>
            <div className={`hub-act-who${r.who ? "" : " is-dim"}`}>{r.who ?? "Not recorded"}</div>
            <div><span className="hub-src">{r.area}</span></div>
            <div className="hub-act-what">
              <span>{r.what}</span>
              {(r.before || r.after) && (
                <span className="hub-act-diff"><s>{r.before}</s><i>→</i><b>{r.after}</b></span>
              )}
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="hub-alert-none hub-orders-none">{rows.length ? "No changes in this area yet." : "No changes logged. Every recorded edit, refund and revision on this show will appear here with who made it."}</div>}
      </section>
      <div className="hub-card-foot hub-card-foot--quiet">
        Rows with a name come from the audit log. &ldquo;Not recorded&rdquo; rows are dated from the show&apos;s own records — the system doesn&apos;t yet log who made those.
      </div>
    </div>
  );
}
