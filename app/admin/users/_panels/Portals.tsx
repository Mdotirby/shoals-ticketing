"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";

/**
 * PORTALS — who from outside the building gets a login, and to what.
 *
 * Artists and agents both sign in to see their own show: an artist to pull a
 * guest list against a comp limit, an agent to watch sales on the shows they
 * represent. Both were managed on /portal, a page built before the current
 * structure, and access control lived somewhere else again. Granting an artist
 * a login on one page while their role and capabilities were governed on
 * another is how someone ends up with a portal account nobody remembers
 * issuing.
 *
 * So it sits in the identity hub beside People and Access. Same subject.
 *
 * ── The distinction this screen has to keep straight ─────────────────────
 * An artist record and an artist LOGIN are not the same thing. An artist can
 * exist to be assigned to a show and never be given credentials — that is the
 * normal case, and the list says so per row rather than implying everyone can
 * sign in.
 */

type AdminUser = {
  id: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url?: string | null;
  website_url?: string | null;
};
type EventRow = { id: string; title: string; date: string };
type Assignment = { id: string; event_id: string; event_title: string; event_date: string; comp_limit: number };
type Artist = AdminUser & { assignments: Assignment[] };
type Agent = { id: string; agent_name?: string | null; name?: string | null; agency?: string | null; agent_email?: string | null; email?: string | null; user_id?: string | null };

const PLACEHOLDER = /@placeholder\.venuecore\.local$/i;
/** A login only exists when there is a real address behind it. */
const hasLogin = (u: { email: string | null }) => !!u.email && !PLACEHOLDER.test(u.email);

const nameOf = (u: AdminUser) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || "Unnamed";

const when = (d: string) =>
  d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

export default function Portals() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", website: "", eventId: "", compLimit: 4 });

  /** Which artist row has its assignment editor open. */
  const [openArtist, setOpenArtist] = useState<string | null>(null);
  const [assignDraft, setAssignDraft] = useState({ eventId: "", compLimit: 4 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const venueId = getCookie("venue-id") || "";
      const params = new URLSearchParams({ all: "1" });
      if (venueId) params.set("venue_id", venueId);

      const [usersRes, eventsRes, agentsRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch(`/api/events?${params}`),
        fetch("/api/agents"),
      ]);
      const allUsers = await usersRes.json().catch(() => []);
      const eventRows: EventRow[] = await eventsRes.json().catch(() => []);
      const agentRows = await agentsRes.json().catch(() => []);
      if (Array.isArray(eventRows)) setEvents(eventRows);
      if (Array.isArray(agentRows)) setAgents(agentRows);

      if (!Array.isArray(allUsers)) { setLoading(false); return; }
      const artistUsers: AdminUser[] = allUsers.filter((u: AdminUser) => u.role === "artist");

      const { data: assignData } = await getSupabaseBrowser()
        .from("artist_event_assignments")
        .select("id, artist_id, event_id, comp_limit");

      setArtists(
        artistUsers.map((u) => ({
          ...u,
          assignments: (assignData ?? [])
            .filter((a: { artist_id: string }) => a.artist_id === u.id)
            .map((a: { id: string; event_id: string; comp_limit: number }) => {
              const ev = Array.isArray(eventRows) ? eventRows.find((e) => e.id === a.event_id) : null;
              return {
                id: a.id,
                event_id: a.event_id,
                event_title: ev?.title ?? "Unknown show",
                event_date: ev?.date ?? "",
                comp_limit: a.comp_limit,
              };
            }),
        })),
      );
    } catch {
      setMsg({ tone: "bad", text: "Could not load portals." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const addArtist = async () => {
    if (!form.name.trim()) { setMsg({ tone: "bad", text: "An artist needs a name." }); return; }
    // Credentials are all-or-nothing: half a login is a login that cannot be used.
    if ((form.email.trim() && !form.password.trim()) || (!form.email.trim() && form.password.trim())) {
      setMsg({ tone: "bad", text: "Give both an email and a password, or neither — a half login cannot sign in." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim() || null,
          password: form.password.trim() || null,
          role: "artist",
          venue_id: getCookie("venue-id") || null,
          first_name: form.name.trim(),
          last_name: null,
        }),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ tone: "bad", text: created.error || "Could not create the artist." }); return; }

      if (form.website.trim()) {
        await fetch("/api/admin/users", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: created.id, website_url: form.website.trim() }),
        }).catch(() => {});
      }

      if (form.eventId) {
        const { error } = await getSupabaseBrowser()
          .from("artist_event_assignments")
          .insert({ artist_id: created.id, event_id: form.eventId, comp_limit: form.compLimit });
        if (error) {
          setMsg({ tone: "bad", text: `Artist created, but the show assignment failed: ${error.message}` });
          setForm({ name: "", email: "", password: "", website: "", eventId: "", compLimit: 4 });
          setShowAdd(false);
          await load();
          return;
        }
      }

      setMsg({
        tone: "ok",
        text: `${form.name.trim()} added${form.email.trim() ? " with a portal login" : " — no login yet"}.`,
      });
      setForm({ name: "", email: "", password: "", website: "", eventId: "", compLimit: 4 });
      setShowAdd(false);
      await load();
    } catch {
      setMsg({ tone: "bad", text: "Could not create the artist." });
    } finally {
      setBusy(false);
    }
  };

  const assign = async (artistId: string) => {
    if (!assignDraft.eventId) return;
    setBusy(true);
    const { error } = await getSupabaseBrowser()
      .from("artist_event_assignments")
      .insert({ artist_id: artistId, event_id: assignDraft.eventId, comp_limit: assignDraft.compLimit });
    setBusy(false);
    if (error) { setMsg({ tone: "bad", text: error.message }); return; }
    setAssignDraft({ eventId: "", compLimit: 4 });
    setOpenArtist(null);
    await load();
  };

  const unassign = async (assignmentId: string) => {
    setBusy(true);
    const { error } = await getSupabaseBrowser().from("artist_event_assignments").delete().eq("id", assignmentId);
    setBusy(false);
    if (error) { setMsg({ tone: "bad", text: error.message }); return; }
    await load();
  };

  const upcoming = useMemo(
    () => events.filter((e) => e.date && new Date(e.date.length === 10 ? `${e.date}T23:59:59` : e.date) >= new Date()),
    [events],
  );

  const agentsWithLogin = agents.filter((a) => a.user_id);

  if (loading) {
    return (
      <div className="admin-form-page team">
        <p className="team-note">Loading portals…</p>
      </div>
    );
  }

  return (
    <div className="admin-form-page team">
      <p className="team-note" style={{ marginTop: -4, marginBottom: 18, maxWidth: 680 }}>
        Logins for people outside the building. An artist signs in to pull a guest list against
        their comp limit; an agent signs in to watch sales on the shows they represent. Being on
        this list is not the same as having a login — the rows say which.
      </p>

      {msg && (
        <div className="team-card" style={{ marginBottom: 16, borderColor: msg.tone === "bad" ? "rgba(248,113,113,0.4)" : undefined }}>
          <p className="team-note" style={{ color: msg.tone === "bad" ? "var(--team-bad, #f87171)" : undefined }}>{msg.text}</p>
        </div>
      )}

      {/* ── Artists ─────────────────────────────────────────────────────── */}
      <div className="team-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="team-eyebrow">Artist portals</div>
          <span style={{ flex: 1 }} />
          <span className="team-note">
            {artists.length} artist{artists.length === 1 ? "" : "s"} · {artists.filter(hasLogin).length} with a login
          </span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAdd((v) => !v)} aria-expanded={showAdd}>
            {showAdd ? "Cancel" : "+ Add artist"}
          </button>
        </div>

        {showAdd && (
          <div className="team-add">
            <label>
              <span>Artist name *</span>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Kestrel Bloom" autoComplete="off" />
            </label>
            <div className="team-add-row">
              <label>
                <span>Portal email</span>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="leave blank for no login" autoComplete="off" />
              </label>
              <label>
                <span>Password</span>
                <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="required with an email" autoComplete="off" />
              </label>
            </div>
            <label>
              <span>Website</span>
              <input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} placeholder="https://" autoComplete="off" />
            </label>
            <div className="team-add-row">
              <label>
                <span>Assign to a show</span>
                <select value={form.eventId} onChange={(e) => setForm((f) => ({ ...f, eventId: e.target.value }))}>
                  <option value="">— none for now —</option>
                  {upcoming.map((e) => (
                    <option key={e.id} value={e.id}>{e.title} · {when(e.date)}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Comp limit</span>
                <input type="number" min={0} max={50} value={form.compLimit} onChange={(e) => setForm((f) => ({ ...f, compLimit: Number(e.target.value) || 0 }))} />
              </label>
            </div>
            <p className="team-note">
              An artist with no email is a record, not an account — assignable to a show, unable to
              sign in. Add credentials later from their row.
            </p>
            <button type="button" className="btn btn-primary" disabled={busy || !form.name.trim()} onClick={addArtist}>
              {busy ? "Adding…" : "Add artist"}
            </button>
          </div>
        )}

        {artists.length === 0 && <p className="team-note" style={{ marginTop: 14 }}>No artists yet.</p>}

        <div className="portal-rows">
          {artists.map((a) => (
            <div key={a.id} className="portal-row">
              <div className="portal-row-head">
                <span className="team-avatar">{(nameOf(a)[0] ?? "?").toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="portal-row-name">{nameOf(a)}</div>
                  <div className="team-note">
                    {hasLogin(a) ? a.email : "No login — record only"}
                    {a.assignments.length > 0 ? ` · ${a.assignments.length} show${a.assignments.length === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                <span className={`portal-tag ${hasLogin(a) ? "portal-tag--on" : ""}`}>
                  {hasLogin(a) ? "Portal login" : "No login"}
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { setOpenArtist(openArtist === a.id ? null : a.id); setAssignDraft({ eventId: "", compLimit: 4 }); }}
                >
                  Shows
                </button>
              </div>

              {openArtist === a.id && (
                <div className="portal-row-body">
                  {a.assignments.length === 0 && <p className="team-note">Not assigned to anything yet.</p>}
                  {a.assignments.map((as) => (
                    <div key={as.id} className="portal-assign">
                      <span style={{ flex: 1, minWidth: 0 }}>{as.event_title} · {when(as.event_date)}</span>
                      <span className="team-note">{as.comp_limit} comps</span>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => unassign(as.id)}>Remove</button>
                    </div>
                  ))}
                  <div className="team-add-row" style={{ marginTop: 10 }}>
                    <label>
                      <span>Add a show</span>
                      <select value={assignDraft.eventId} onChange={(e) => setAssignDraft((d) => ({ ...d, eventId: e.target.value }))}>
                        <option value="">— pick a show —</option>
                        {upcoming
                          .filter((e) => !a.assignments.some((as) => as.event_id === e.id))
                          .map((e) => <option key={e.id} value={e.id}>{e.title} · {when(e.date)}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Comp limit</span>
                      <input type="number" min={0} max={50} value={assignDraft.compLimit} onChange={(e) => setAssignDraft((d) => ({ ...d, compLimit: Number(e.target.value) || 0 }))} />
                    </label>
                  </div>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy || !assignDraft.eventId} onClick={() => assign(a.id)}>
                    Assign
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Agents ──────────────────────────────────────────────────────── */}
      <div className="team-card" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="team-eyebrow">Agent portals</div>
          <span style={{ flex: 1 }} />
          <span className="team-note">{agentsWithLogin.length} of {agents.length} with a login</span>
          <a href="/admin/agents" className="btn btn-outline btn-sm">Manage agents</a>
        </div>

        {agents.length === 0 && <p className="team-note" style={{ marginTop: 14 }}>No agents yet.</p>}

        <div className="portal-rows">
          {agents.map((ag) => {
            const name = ag.agent_name || ag.name || ag.agent_email || ag.email || "Unnamed agent";
            const email = ag.agent_email || ag.email || null;
            return (
              <div key={ag.id} className="portal-row">
                <div className="portal-row-head">
                  <span className="team-avatar">{(String(name)[0] ?? "?").toUpperCase()}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="portal-row-name">{name}</div>
                    <div className="team-note">{[ag.agency, email].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <span className={`portal-tag ${ag.user_id ? "portal-tag--on" : ""}`}>
                    {ag.user_id ? "Portal login" : "No login"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <p className="team-note" style={{ marginTop: 12 }}>
          An agent&apos;s login is created with the agent record itself, on the Agents page — it is
          tied to the representation, not granted separately. Shown here so every outside login is
          visible in one place.
        </p>
      </div>
    </div>
  );
}
