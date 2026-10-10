"use client";

/**
 * Deal — eventhub.dc.html ?tab=deal. The show's offer, worked on here: the
 * offer builder itself (app/admin/offers/[id]/OfferWorkspace — Details, P&L
 * and Deal lab, save, Excel export) for a draft or sent offer, or the signed
 * terms and revision history (OfferSigned) for a countersigned one. Both
 * also render on their own pages; /admin/offers/[id] and /[id]/edit send a
 * linked offer here.
 *
 * A show can carry more than one live version — a countersigned offer and a
 * draft revision of it — so the banner lists them. `?offer=` picks one and
 * `?view=signed` opens its signed terms; with neither, an open revision is
 * shown first (it's the one being worked on), else the signed deal.
 * Offers not yet tied to a show stay on the Offers page until linked here.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import OfferWorkspace, { type OfferHref } from "@/app/admin/offers/[id]/OfferWorkspace";
import OfferSigned from "@/app/admin/offers/[id]/edit/OfferSigned";
import { useHub } from "../HubContext";
import { HubEmpty, HubLoading, HubModal } from "../ui";

type Version = {
  id: string;
  version: number | null;
  status: string | null;
  revision_of: string | null;
  artist_name: string | null;
  agent_name: string | null;
  agency: string | null;
  updated_at: string | null;
  created_at: string;
};

const shortDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

export default function Deal() {
  const hub = useHub();
  const { id, role } = hub;
  const router = useRouter();
  const params = useSearchParams();
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [candidates, setCandidates] = useState<Array<{ id: string; artist_name: string | null; event_date: string | null; status: string | null; version: number | null }> | null>(null);
  const [loadN, setLoadN] = useState(0);
  const canEdit = ["owner", "super_admin", "venue_admin", "full_admin"].includes(role);

  useEffect(() => {
    let live = true;
    import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
      const { data } = await getSupabaseBrowser()
        .from("artist_offers")
        .select("id, version, status, revision_of, artist_name, agent_name, agency, updated_at, created_at")
        .eq("event_id", id)
        .is("superseded_at", null)
        .order("created_at", { ascending: true });
      if (live) setVersions((data as Version[]) ?? []);
    });
    return () => { live = false; };
  }, [id, loadN]);

  // Links inside the builder and the signed view stay in the hub.
  const hrefFor: OfferHref = useCallback(
    (offerId, signed) => `/admin/events/${id}?tab=deal&offer=${offerId}${signed ? "&view=signed" : ""}`,
    [id],
  );

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

  const link = async (offerId: string, attach: boolean) => {
    const r = await fetch(`/api/offers/${offerId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event_id: attach ? id : null }) });
    if (!r.ok) { hub.toast((await r.json().catch(() => ({}))).error || "Couldn't change the link."); return; }
    setPicking(false);
    setLoadN((n) => n + 1);
    hub.reload(["offer"]);
    router.replace(`/admin/events/${id}?tab=deal`, { scroll: false });
    hub.toast(attach ? "Offer linked. The deal, break even and settlement read from it now." : "Offer unlinked.");
  };

  if (versions === null) return <HubLoading label="the deal" />;

  const picker = picking && (
    <HubModal eyebrow="Deal" title="Link an offer" width={560} onClose={() => setPicking(false)}>
      <div className="hub-modal-body">Offers not yet attached to a show. Linking one brings in its deal, scaling and expenses.</div>
      <div className="hub-pick-list">
        {candidates === null && <div className="hub-alert-none">Loading offers…</div>}
        {candidates?.length === 0 && <div className="hub-alert-none">Every offer is already linked to a show.</div>}
        {candidates?.map((c) => (
          <button key={c.id} type="button" className="hub-switch-row" onClick={() => link(c.id, true)}>
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

  if (versions.length === 0) {
    return (
      <>
        <HubEmpty
          title="No offer linked"
          body="Link the signed offer for this show to bring in its deal, scaling and expenses, or start a new offer."
          ctas={[{ label: "Link an offer", onClick: openPicker }, { label: "Create offer", href: "/admin/offers/new" }]}
        />
        {picker}
      </>
    );
  }

  const asked = params.get("offer");
  const openRev = versions.find((v) => v.status !== "accepted" && v.revision_of);
  const signedV = versions.find((v) => v.status === "accepted");
  const current = versions.find((v) => v.id === asked) ?? openRev ?? signedV ?? versions[versions.length - 1];
  const showSigned = current.status === "accepted" || params.get("view") === "signed";

  return (
    <div className="hub-deal">
      {picker}
      <div className="hub-deal-banner">
        <span className={`hub-dot hub-dot--${current.status === "accepted" ? "good" : "warn"}`} />
        <div className="hub-deal-banner-text">
          <div className="hub-msg-title">
            {current.artist_name || "Linked offer"} · v{current.version ?? 1} {current.status === "accepted" ? "countersigned" : current.status || "draft"}
            {current.updated_at ? ` ${shortDay(current.updated_at)}` : ""}
          </div>
          <div className="hub-promo-sub">
            {[current.agent_name, current.agency].filter(Boolean).join(", ") || "No agent on the offer"} ·{" "}
            {current.status === "accepted" ? "Signed terms change only through a revision." : "Edit and save it right here."}
          </div>
        </div>
        {versions.length > 1 && (
          <div className="hub-choices">
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`hub-choice hub-choice--sm${v.id === current.id ? " is-on" : ""}`}
                onClick={() => router.replace(hrefFor(v.id, v.status === "accepted"), { scroll: false })}
              >
                v{v.version ?? 1} · {v.status === "accepted" ? "signed" : v.revision_of ? "revision" : v.status || "draft"}
              </button>
            ))}
          </div>
        )}
        {canEdit && current.status !== "accepted" && !current.revision_of && (
          <button type="button" className="hub-card-link" onClick={() => confirm("Unlink this offer from the show?") && link(current.id, false)}>Unlink</button>
        )}
      </div>

      <div className="hub-offer-embed">
        {showSigned
          ? <OfferSigned key={`s-${current.id}-${loadN}`} id={current.id} embedded hrefFor={hrefFor} />
          : <OfferWorkspace key={`b-${current.id}-${loadN}`} id={current.id} embedded hrefFor={hrefFor} />}
      </div>
    </div>
  );
}
