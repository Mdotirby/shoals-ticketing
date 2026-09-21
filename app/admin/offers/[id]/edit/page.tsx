"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fmtUSD } from "@/app/components/admin/ui";
import { openRevision, operativeVersion, type OfferVersion } from "@/lib/offers/revisions";

/**
 * Edit offer — handoff/screens/offeredit.dc.html, PHASE1-EDIT-PAGES § 2.
 *
 * A countersigned offer is never edited in place. This page shows the signed
 * terms read-only; the one action is "Create revision", which copies them
 * into a new draft (POST /api/offers/[id]/revise) that opens in the offer
 * builder. The signed version stays operative until that draft is itself
 * countersigned. Internal notes are the exception: they're ours, not the
 * deal, so they stay editable.
 *
 * Drafts and sent offers don't come here — the builder edits them directly —
 * so for those this page just points back to it.
 */

type Offer = Record<string, unknown> & {
  id: string;
  status: string;
  artist_name: string | null;
  event_date: string | null;
  event_id: string | null;
  agent_name: string | null;
  agency: string | null;
  notes: string | null;
  updated_at: string | null;
  version?: number;
  superseded_at?: string | null;
};

type Kpis = { paidTickets: number; compedTickets: number; sellable: number; gross: number };

/** artist_offers.deal_type as the offer builder writes it. */
const DEAL_LABELS: Record<string, string> = {
  FLAT: "Flat guarantee",
  VS: "Guarantee vs. percentage",
  PLUS: "Guarantee plus percentage",
  BONUS: "Guarantee plus bonus",
};

function dateLabel(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric", year: "numeric" }) {
  if (!d) return "—";
  const parsed = d.length === 10 ? new Date(`${d}T12:00:00`) : new Date(d);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString("en-US", opts);
}

/** The signed terms, in the order a buyer of the deal reads them. */
function termsOf(o: Offer): { label: string; value: string; fixed?: boolean }[] {
  const num = (k: string) => (o[k] === null || o[k] === undefined || o[k] === "" ? null : Number(o[k]));
  const money = (k: string) => (num(k) === null ? "—" : fmtUSD(num(k)));
  const dealType = String(o.deal_type ?? "").toUpperCase();
  const radius = [o.radius_distance && `${o.radius_distance} mi`, (o.radius_days_prior || o.radius_days_after) && `${o.radius_days_prior ?? 0} days before / ${o.radius_days_after ?? 0} after`]
    .filter(Boolean)
    .join(" · ");
  // Offer builder scaling rows: name, price, sellable_cap (seats − comps − kills).
  const scaling = Array.isArray(o.ticket_scaling)
    ? (o.ticket_scaling as { name?: string; price?: number | string; sellable_cap?: number | string }[])
        .map((t) => {
          const cap = Number(t.sellable_cap) || 0;
          return `${t.name || "Tier"} ${fmtUSD(Number(t.price) || 0)}${cap ? ` × ${cap.toLocaleString()}` : ""}`;
        })
        .join(" · ")
    : "";
  return [
    { label: "Artist", value: o.artist_name || "—", fixed: true },
    { label: "Date", value: dateLabel(o.event_date) },
    { label: "Guarantee", value: money("guarantee") },
    { label: "Deal type", value: DEAL_LABELS[dealType] ?? (dealType || "—") },
    { label: "Backend", value: num("backend_percentage") === null ? "—" : `${num("backend_percentage")}% to the artist after the split point` },
    { label: "Split point", value: money("splitpoint") },
    { label: "Ticket scaling", value: scaling || "—" },
    { label: "Radius", value: radius || "None" },
    { label: "Deposit", value: num("deposit_amount") ? `${money("deposit_amount")}${o.deposit_due ? ` due ${dateLabel(String(o.deposit_due), { month: "short", day: "numeric", year: "numeric" })}` : ""}` : "None" },
    { label: "Other terms", value: String(o.other_terms || "") || "None" },
  ];
}

export default function EditOfferPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };

  const [offer, setOffer] = useState<Offer | null>(null);
  const [versions, setVersions] = useState<OfferVersion[]>([]);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/offers/${id}`).then((r) => r.json()),
      fetch(`/api/offers/${id}/versions`).then((r) => (r.ok ? r.json() : { versions: [] })),
    ])
      .then(([o, v]) => {
        if (o?.error) {
          setError(o.error);
          return;
        }
        setOffer(o);
        setNotes(o.notes ?? "");
        setVersions(Array.isArray(v.versions) ? v.versions : []);
        setMigrationNeeded(!!v.migrationNeeded);
        // The show this deal is for, if it's on sale — the same figures the
        // event workspace and edit form show.
        if (o.event_id) {
          fetch(`/api/admin/ticketing/${o.event_id}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((t) => t?.kpis && setKpis(t.kpis))
            .catch(() => {});
        }
      })
      .catch(() => setError("Failed to load offer"))
      .finally(() => setLoading(false));
  }, [id]);

  const createRevision = async () => {
    setRevising(true);
    setError("");
    try {
      const res = await fetch(`/api/offers/${id}/revise`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't create a revision");
      router.push(`/admin/offers/${data.offer.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create a revision");
      setRevising(false);
    }
  };

  const saveNotes = async () => {
    setSavingNotes(true);
    setError("");
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't save notes");
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-form-page ee-page">
        <p className="ee-state-body">Loading offer…</p>
      </div>
    );
  }
  if (!offer) {
    return (
      <div className="admin-form-page ee-page">
        <div className="admin-form-error">{error || "Offer not found"}</div>
      </div>
    );
  }

  const signed = offer.status === "accepted";
  const thisVersion = versions.find((v) => v.id === offer.id);
  const versionNo = thisVersion?.version ?? offer.version ?? 1;
  const operative = operativeVersion(versions);
  const superseded = !!(thisVersion?.superseded_at ?? offer.superseded_at);
  const open = openRevision(versions);
  const nextVersion = Math.max(1, ...versions.map((v) => v.version ?? 1)) + 1;
  const title = `${offer.artist_name || "Offer"} — ${dateLabel(offer.event_date, { month: "short", day: "numeric" })}`;

  const state = !signed
    ? {
        tone: "quiet",
        eyebrow: `v${versionNo} · ${offer.status}`,
        body: "This offer isn't countersigned yet, so it's edited directly in the builder. Revisions are only for signed deals.",
      }
    : superseded
    ? {
        tone: "quiet",
        eyebrow: `v${versionNo} · superseded`,
        body: `A later revision was countersigned and replaced this version${operative ? ` (v${operative.version} is operative)` : ""}. It stays on file exactly as it was signed.`,
      }
    : {
        tone: "warn",
        eyebrow: `v${versionNo} · countersigned${offer.updated_at ? ` ${dateLabel(offer.updated_at, { month: "short", day: "numeric" })}` : ""}`,
        body: "A countersigned offer is a contract. Nothing on it can be edited in place — not the guarantee, not the splits, not the date. A revision supersedes it and both versions stay on file.",
      };

  return (
    <div className="admin-form-page ee-page">
      <div className="card ee-state">
        <div className="ee-state-text">
          <div className={`ee-eyebrow ee-eyebrow--${state.tone}`}>
            <span className="ee-dot" />
            {state.eyebrow}
          </div>
          <div className="ee-state-title">
            <h1 className="admin-page-title">{title}</h1>
            <span className="ee-state-meta">{[offer.agent_name, offer.agency].filter(Boolean).join(" · ")}</span>
          </div>
          <p className="ee-state-body">{state.body}</p>
        </div>
        <div className="ee-state-action">
          {!signed ? (
            <Link href={`/admin/offers/${offer.id}`} className="btn btn-primary ee-btn-lg">
              Open in the builder
            </Link>
          ) : open ? (
            <Link href={`/admin/offers/${open.id}`} className="btn btn-primary ee-btn-lg">
              Open revision v{open.version}
            </Link>
          ) : superseded ? null : (
            <button type="button" className="btn btn-primary ee-btn-lg" onClick={createRevision} disabled={revising || migrationNeeded}>
              {revising ? "Creating…" : `Create revision v${nextVersion}`}
            </button>
          )}
          {signed && !superseded && (
            <p className="ee-state-hint">
              {migrationNeeded
                ? "Revisions need plans/offer-revisions-migration.sql run in Supabase first."
                : `v${versionNo} stays operative until the revision is countersigned.`}
            </p>
          )}
        </div>
      </div>

      {error && <div className="admin-form-error">{error}</div>}

      <div className="ee-grid">
        <div className="ee-main">
          <section className="card ee-card">
            <div className="ee-card-head">
              <span className="ee-eyebrow">Terms</span>
              <span className="ee-card-aside">{signed ? "signed values — a revision opens them" : "as drafted"}</span>
            </div>
            <div className="oe-terms">
              {termsOf(offer).map((t) => (
                <div key={t.label} className="oe-term">
                  <div className="oe-term-head">
                    <span>{t.label}</span>
                    <span className={`oe-chip${t.fixed ? " oe-chip--fixed" : ""}`}>{t.fixed ? "fixed" : signed ? "signed" : "draft"}</span>
                  </div>
                  <div className="oe-term-value">{t.value}</div>
                </div>
              ))}
              <div className="oe-term">
                <div className="oe-term-head">
                  <span>Internal notes</span>
                  <span className="oe-chip oe-chip--open">editing</span>
                </div>
                <textarea
                  className="admin-form-textarea oe-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Ours, not the artist's — never part of the signed deal."
                />
                <div className="oe-notes-actions">
                  <button type="button" className="btn" onClick={saveNotes} disabled={savingNotes || notes === (offer.notes ?? "")}>
                    {savingNotes ? "Saving…" : notesSaved ? "Saved" : "Save notes"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="card ee-card">
            <span className="ee-eyebrow">What a revision does not touch</span>
            <p className="ee-state-body">
              The event, its tickets and its orders are unaffected. The offer is the deal with the artist; the event is
              the night you sell. A revision changes what you owe at settlement, not what a buyer bought. If a revision
              moves the date, the event itself still has to be moved separately, on purpose.
            </p>
          </section>
        </div>

        <aside className="ee-rail">
          <section className="card ee-card">
            <span className="ee-eyebrow">Version history</span>
            <ol className="oe-versions">
              {[...versions].reverse().map((v) => {
                const label =
                  v.status === "accepted"
                    ? v.superseded_at
                      ? "Countersigned · superseded"
                      : "Countersigned · operative"
                    : v.status === "declined"
                    ? "Declined"
                    : v.revision_of
                    ? `Revision · ${v.status}`
                    : v.status;
                return (
                  <li key={v.id} className={v.id === offer.id ? "is-current" : undefined}>
                    <span className="oe-v">v{v.version ?? 1}</span>
                    <div>
                      <Link href={v.status === "accepted" ? `/admin/offers/${v.id}/edit` : `/admin/offers/${v.id}`}>
                        {dateLabel(v.updated_at ?? v.created_at, { month: "short", day: "numeric", year: "numeric" })}
                      </Link>
                      <span>
                        {label}
                        {v.guarantee !== null && v.guarantee !== undefined ? ` · ${fmtUSD(Number(v.guarantee))}` : ""}
                        {v.backend_percentage ? ` · ${v.backend_percentage}%` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            {migrationNeeded && (
              <p className="ee-rail-note">Only this version is on file — revisions start once the migration has run.</p>
            )}
          </section>

          {offer.event_id && (
            <section className="card ee-card ee-money">
              <span className="ee-eyebrow">Against the show&apos;s sales</span>
              <dl className="ee-money-rows">
                <div>
                  <dt>Gross sold</dt>
                  <dd>{kpis ? fmtUSD(kpis.gross) : "—"}</dd>
                </div>
                <div>
                  <dt>Tickets out</dt>
                  <dd>{kpis ? `${kpis.paidTickets.toLocaleString()}${kpis.sellable ? ` / ${kpis.sellable.toLocaleString()}` : ""}` : "—"}</dd>
                </div>
                <div>
                  <dt>Guarantee</dt>
                  <dd>{offer.guarantee !== null && offer.guarantee !== undefined ? fmtUSD(Number(offer.guarantee)) : "—"}</dd>
                </div>
              </dl>
              <p className="ee-rail-note">
                Here so a revision&apos;s trade — a bigger guarantee against what the room has actually sold — is visible
                while you decide.
              </p>
              <Link href={`/admin/events/${offer.event_id}`} className="ee-action oe-event-link">
                <strong>Open the event</strong>
                <span>Workspace, inventory and settlement for this show.</span>
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
