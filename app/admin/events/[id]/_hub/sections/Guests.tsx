"use client";

/**
 * Guest list & comps — eventhub.dc.html ?tab=guests. The artists' and the
 * house's guests for this show, edited here and checked in at the door.
 * Replaces the workspace Guest List tab and the guest-list route's editing.
 *
 * Allotments are the artist_event_assignments comp limits; the house list
 * has none. An entry's list is whoever added it, so it is shown, not
 * switched — a new guest goes on the house list or on a named artist's.
 * Edits, additions and removals wait for the save bar like every editable
 * section. Check-in is read-only here: the door does it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useHub, useSectionDirty } from "../HubContext";
import { HubLoading } from "../ui";

type G = {
  key: string;
  id?: string;
  name: string;
  qty: number;
  notes: string;
  list: "artist" | "house";
  by: string | null;
  artistId: string | null;
  checkedIn: boolean;
};

type Assignment = { artist_id: string; comp_limit: number | null; name: string };

let seq = 0;
const nameOf = (first: string, last: string) => [first, last].filter((x) => x && x.trim()).join(" ");
const splitName = (n: string) => {
  const t = n.trim().replace(/\s+/g, " ");
  const i = t.lastIndexOf(" ");
  return i < 0 ? { first_name: t, last_name: "" } : { first_name: t.slice(0, i), last_name: t.slice(i + 1) };
};

export default function Guests() {
  const hub = useHub();
  const { id, role } = hub;
  const [saved, setSaved] = useState<G[] | null>(null);
  const [d, setD] = useState<G[] | null>(null);
  const [artists, setArtists] = useState<Assignment[]>([]);
  const [n, setN] = useState({ name: "", qty: 2, to: "house", note: "" });
  const [error, setError] = useState("");
  const [loadN, setLoadN] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(`/api/artists/guests?event_id=${id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; first_name: string; last_name: string; quantity: number; notes: string | null; list?: "artist" | "house"; added_by?: string | null; artist_id: string | null; checked_in_at?: string | null }>) => {
        if (!live) return;
        const list: G[] = (Array.isArray(rows) ? rows : []).map((r) => ({
          key: r.id, id: r.id, name: nameOf(r.first_name, r.last_name), qty: Number(r.quantity) || 1, notes: r.notes ?? "",
          list: r.list === "artist" ? "artist" : "house", by: r.added_by ?? null, artistId: r.artist_id, checkedIn: !!r.checked_in_at,
        }));
        setSaved(list);
        setD(list);
      })
      .catch(() => live && setError("Couldn't load the guest list."));
    return () => { live = false; };
  }, [id, loadN]);

  // Assigned artists and their comp limits — staff only; an artist sees their own list.
  useEffect(() => {
    if (role === "artist") return;
    import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
      const sb = getSupabaseBrowser();
      const { data: rows } = await sb.from("artist_event_assignments").select("artist_id, comp_limit").eq("event_id", id);
      const ids = (rows ?? []).map((r: { artist_id: string }) => r.artist_id);
      // Names through the users route, which already decides who may see them.
      const people: Array<{ id: string; first_name: string | null; last_name: string | null }> = ids.length
        ? await fetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])).catch(() => [])
        : [];
      const names = new Map((Array.isArray(people) ? people : []).map((p) => [p.id, nameOf(p.first_name ?? "", p.last_name ?? "") || "Artist"]));
      setArtists((rows ?? []).map((r: { artist_id: string; comp_limit: number | null }) => ({ ...r, name: names.get(r.artist_id) ?? "Artist" })));
    }).catch(() => {});
  }, [id, role]);

  const count = useMemo(() => {
    if (!d || !saved) return 0;
    const before = new Map(saved.map((g) => [g.key, JSON.stringify(g)]));
    let c = 0;
    for (const g of d) { if (before.get(g.key) !== JSON.stringify(g)) c++; before.delete(g.key); }
    return c + before.size;
  }, [d, saved]);

  const save = useCallback(async () => {
    if (!d || !saved) return false;
    setError("");
    if (d.some((g) => !g.name.trim())) { setError("Every guest needs a name."); return false; }
    const gone = saved.filter((g) => !d.some((x) => x.key === g.key));
    const added = d.filter((g) => !g.id);
    const changed = d.filter((g) => g.id && JSON.stringify(g) !== JSON.stringify(saved.find((s) => s.key === g.key)));
    try {
      for (const g of gone) {
        const r = await fetch(`/api/artists/guests?id=${g.id}`, { method: "DELETE" });
        if (!r.ok) throw new Error(`Couldn't remove ${g.name}.`);
      }
      for (const g of added) {
        const r = await fetch("/api/artists/guests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: id, ...splitName(g.name), quantity: g.qty, notes: g.notes, ...(g.artistId ? { artist_id: g.artistId } : {}) }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Couldn't add ${g.name}.`);
      }
      for (const g of changed) {
        const r = await fetch("/api/artists/guests", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: g.id, ...splitName(g.name), quantity: g.qty, notes: g.notes }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Couldn't update ${g.name}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the guest list.");
      setLoadN((x) => x + 1);
      return false;
    }
    setLoadN((x) => x + 1);
    hub.reload(["guests"]);
    return true;
  }, [d, saved, id, hub]);

  const discard = useCallback(() => { setD(saved); setError(""); }, [saved]);
  useSectionDirty("guests", count, save, discard);

  if (!d || !saved) return <HubLoading label="the guest list" />;

  const upd = (key: string, patch: Partial<G>) => setD((prev) => (prev ? prev.map((g) => (g.key === key ? { ...g, ...patch } : g)) : prev));
  const add = () => {
    if (!n.name.trim()) { setError("Add a name first."); return; }
    setError("");
    const artist = artists.find((a) => a.artist_id === n.to);
    setD((prev) => [...(prev ?? []), {
      key: `new-${++seq}`, name: n.name.trim(), qty: n.qty, notes: n.note.trim(),
      list: artist || role === "artist" ? "artist" : "house", by: artist?.name ?? null, artistId: artist?.artist_id ?? null, checkedIn: false,
    }]);
    setN({ ...n, name: "", note: "", qty: 2 });
  };

  const used = (pred: (g: G) => boolean) => d.filter(pred).reduce((t, g) => t + g.qty, 0);
  const allot = [
    ...artists.map((a) => ({ label: `${a.name} list`, used: used((g) => g.artistId === a.artist_id), limit: a.comp_limit })),
    ...(role === "artist" ? [] : [{ label: "House list", used: used((g) => g.list === "house"), limit: null as number | null }]),
  ];
  const inCount = d.filter((g) => g.checkedIn).reduce((t, g) => t + g.qty, 0);

  return (
    <div className="hub-guests">
      <div className="hub-allot">
        {allot.map((a) => {
          const over = a.limit !== null && a.used > a.limit;
          const full = a.limit !== null && a.used === a.limit;
          return (
            <div key={a.label} className="hub-allot-card">
              <div className="hub-allot-line">
                <div className="hub-allot-label">{a.label}</div>
                <div className={`hub-allot-used${over ? " is-bad" : full ? " is-warn" : ""}`}>{a.used} / {a.limit ?? "—"}</div>
              </div>
              <div className="hub-allot-bar"><div className={over ? "is-bad" : full ? "is-warn" : ""} style={{ width: `${a.limit ? Math.min(100, (a.used / a.limit) * 100) : a.used ? 100 : 0}%` }} /></div>
            </div>
          );
        })}
        <div className="hub-allot-card">
          <div className="hub-allot-line">
            <div className="hub-allot-label">Checked in</div>
            <div className="hub-allot-used">{inCount} / {used(() => true)}</div>
          </div>
          <div className="hub-allot-bar"><div className="is-good" style={{ width: `${used(() => true) ? (inCount / used(() => true)) * 100 : 0}%` }} /></div>
        </div>
      </div>

      <section className="hub-card hub-card--glow">
        {error && <div className="hub-error">{error}</div>}
        <div className="hub-guest-add">
          <input className="hub-in hub-in--sm hub-guest-name" placeholder="Guest name" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          <div className="hub-stepper hub-guest-qty">
            <button type="button" className="hub-step" onClick={() => setN({ ...n, qty: Math.max(1, n.qty - 1) })}>−</button>
            <div className="hub-step-value">{n.qty}</div>
            <button type="button" className="hub-step" onClick={() => setN({ ...n, qty: n.qty + 1 })}>+</button>
          </div>
          {role !== "artist" && (
            <div className="hub-choices">
              <button type="button" className={`hub-choice hub-choice--sm${n.to === "house" ? " is-on" : ""}`} onClick={() => setN({ ...n, to: "house" })}>House</button>
              {artists.map((a) => (
                <button key={a.artist_id} type="button" className={`hub-choice hub-choice--sm${n.to === a.artist_id ? " is-on" : ""}`} onClick={() => setN({ ...n, to: a.artist_id })}>{a.name}</button>
              ))}
            </div>
          )}
          <input className="hub-in hub-in--sm hub-guest-note" placeholder="Note (optional)" value={n.note} onChange={(e) => setN({ ...n, note: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button type="button" className="hub-btn hub-btn--primary" onClick={add}>+ Add guest</button>
        </div>

        <div className="hub-tiers-scroll">
          <div className="hub-guest-table">
            <div className="hub-guest-row hub-guest-row--head">
              <div>Name</div><div>List</div><div>Qty</div><div>Note</div><div>Check-in · read only</div><div />
            </div>
            {d.length === 0 && <div className="hub-alert-none">Guest list is empty. Add artist and house guests — the door sees this list on show night.</div>}
            {d.map((g) => (
              <div key={g.key} className={`hub-guest-row${g.id ? "" : " is-new"}`}>
                <input className="hub-tier-input" value={g.name} onChange={(e) => upd(g.key, { name: e.target.value })} aria-label="Guest name" />
                <div><span className={`hub-guest-list is-${g.list}`} title={g.by ? `Added by ${g.by}` : undefined}>{g.list === "artist" ? (g.by || "Artist") : "House"}</span></div>
                <div className="hub-stepper" data-label="Qty">
                  <button type="button" className="hub-step" onClick={() => upd(g.key, { qty: Math.max(1, g.qty - 1) })}>−</button>
                  <div className="hub-step-value">{g.qty}</div>
                  <button type="button" className="hub-step" onClick={() => upd(g.key, { qty: g.qty + 1 })}>+</button>
                </div>
                <input className="hub-tier-input hub-guest-noteinput" value={g.notes} placeholder="—" onChange={(e) => upd(g.key, { notes: e.target.value })} aria-label="Note" />
                <div className={`hub-order-state is-${g.checkedIn ? "good" : "dim"}`}>{g.checkedIn ? "Checked in" : g.id ? "Not arrived" : "Not saved yet"}</div>
                <button type="button" className="hub-x hub-x--sm" title="Remove" onClick={() => setD((prev) => (prev ? prev.filter((x) => x.key !== g.key) : prev))}>✕</button>
              </div>
            ))}
          </div>
        </div>
        <div className="hub-tiers-foot">
          <div className="hub-tiers-note">A comp is a guest with a real zero — no order, no money. Check-in is done at the door, not here.</div>
          <Link href="/admin/live?tab=guests" className="hub-card-link">Open door view →</Link>
        </div>
      </section>
    </div>
  );
}
