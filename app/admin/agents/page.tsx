"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { fmtUSD } from "@/app/components/admin/ui";

type Agent = {
  id: string;
  agency: string;
  agent_name: string;
  first_name?: string;
  last_name?: string;
  agent_phone?: string;
  agent_email?: string;
  email?: string;
  venue_id?: string;
  user_id?: string;
  created_at: string;
};

type EventOption = {
  id: string;
  title: string;
  date: string;
};

type AgentSummary = {
  roster: string[];
  shows: { event_id: string | null; title: string; date: string; state: string; artist: string | null; gross: number }[];
  offers: { id: string }[];
  stats: { showsBooked: number; grossBooked: number; avgSettleDays: number | null; firstShow: string | null };
  portalAccess: boolean;
};

type Assignment = {
  id: string;
  event_id: string;
  created_at: string;
  event: { id: string; title: string; date: string; venue: string };
};

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Onboard modal state
  const [showOnboard, setShowOnboard] = useState(false);
  const [onboardForm, setOnboardForm] = useState({ first_name: "", last_name: "", email: "", phone: "", agency_name: "" });
  const [onboarding, setOnboarding] = useState(false);

  // Edit modal state
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ agency: "", agent_name: "", agent_phone: "", agent_email: "" });
  const [saving, setSaving] = useState(false);

  // Assignment state
  const [assignAgent, setAssignAgent] = useState<Agent | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignEventId, setAssignEventId] = useState("");
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<AgentSummary | null>(null);

  const role = getCookie("user-role");
  const venueId = getCookie("venue-id");

  useEffect(() => {
    loadAgents();
    loadEvents();
  }, []);

  async function loadAgents() {
    try {
      const url = venueId ? `/api/agents?venue_id=${venueId}` : "/api/agents";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load agents");
      const data = await res.json();
      setAgents(data);
    } catch {
      setError("Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents() {
    try {
      const res = await fetch("/api/events");
      if (!res.ok) return;
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }

  async function loadAssignments(agentId: string) {
    setLoadingAssignments(true);
    try {
      const res = await fetch(`/api/agents/assignments?agent_id=${agentId}`);
      if (!res.ok) throw new Error("Failed to load assignments");
      const data = await res.json();
      setAssignments(data);
    } catch {
      setAssignments([]);
    } finally {
      setLoadingAssignments(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editAgent) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editAgent.id,
          agency: editForm.agency,
          agent_name: editForm.agent_name,
          agent_phone: editForm.agent_phone,
          agent_email: editForm.agent_email,
          venue_id: editAgent.venue_id || venueId || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSuccess("Agent updated");
      setEditAgent(null);
      loadAgents();
    } catch {
      setError("Failed to save agent");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    if (!assignAgent || !assignEventId) return;
    setError("");
    try {
      const res = await fetch("/api/agents/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: assignAgent.id, event_id: assignEventId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Assignment failed");
      }
      setSuccess("Event assigned to agent");
      setAssignEventId("");
      loadAssignments(assignAgent.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to assign");
    }
  }

  async function handleUnassign(assignmentId: string) {
    if (!assignAgent) return;
    try {
      await fetch(`/api/agents/assignments?id=${assignmentId}`, { method: "DELETE" });
      loadAssignments(assignAgent.id);
      setSuccess("Assignment removed");
    } catch {
      setError("Failed to remove assignment");
    }
  }

  async function handleRemoveAgent(agent: Agent) {
    if (!confirm(`Remove ${agent.agent_name} from ${agent.agency}? This will revoke their login access and cannot be undone.`)) return;
    setError("");
    try {
      const res = await fetch(`/api/agents?id=${agent.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove agent");
      }
      setSuccess(`${agent.agent_name} has been removed.`);
      loadAgents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to remove agent");
    }
  }

  async function handleOnboardAgent(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOnboarding(true);
    try {
      // 1. Create admin_users record with role='agent'
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: onboardForm.email,
          password: "TempPass123!",
          first_name: onboardForm.first_name,
          last_name: onboardForm.last_name,
          role: "agent",
        }),
      });
      const userData = await res.json();
      if (!res.ok) {
        throw new Error(userData.error || "Failed to create agent user");
      }

      // 2. Create agents record, linking to the admin_users row
      const agentRes = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency: onboardForm.agency_name,
          agent_name: `${onboardForm.first_name} ${onboardForm.last_name}`.trim(),
          agent_phone: onboardForm.phone || null,
          agent_email: onboardForm.email || null,
          venue_id: venueId || null,
          user_id: userData.id || null,
        }),
      });
      if (!agentRes.ok) throw new Error("Failed to create agent record");

      setSuccess(`${onboardForm.first_name} ${onboardForm.last_name} has been onboarded! They'll receive a welcome email with their login credentials.`);
      setShowOnboard(false);
      setOnboardForm({ first_name: "", last_name: "", email: "", phone: "", agency_name: "" });
      loadAgents();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Onboarding failed");
    } finally {
      setOnboarding(false);
    }
  }

  // ── Master / detail (handoff/screens/agents.dc.html) ──
  // An agent is a person; the agency is an attribute. The list sits beside
  // one agent's detail: contact, relationship, roster, and every show booked
  // through them. No rebates — agents aren't paid one.
  const canManage = role === "owner" || role === "venue_admin";
  const selected = agents.find((a) => a.id === selectedId) ?? agents[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    setAssignAgent(selected);
    loadAssignments(selected.id);
    setSummary(null);
    fetch(`/api/agents/${selected.id}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSummary(d))
      .catch(() => setSummary(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (loading) {
    return (
      <div className="admin-form-page ee-page">
        <p className="ee-state-body">Loading agents…</p>
      </div>
    );
  }

  const displayName = (a: Agent) => (a.first_name && a.last_name ? `${a.first_name} ${a.last_name}` : a.agent_name);
  const openEdit = (a: Agent) => {
    setEditAgent(a);
    setEditForm({
      agency: a.agency || "",
      agent_name: a.agent_name || "",
      agent_phone: a.agent_phone || "",
      agent_email: a.agent_email || a.email || "",
    });
  };
  const dateShort = (d: string) =>
    new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="admin-form-page ee-page">
      <div className="card ee-state">
        <div className="ee-state-text">
          <span className="ee-eyebrow">Representation</span>
          <div className="ee-state-title">
            <h1 className="admin-page-title">Agents</h1>
          </div>
          <p className="ee-state-body">
            An agent is a person, not a company — the agency is an attribute. What matters is the relationship: who they
            represent, the shows they&apos;ve booked with us, and how fast we settle with them.
          </p>
        </div>
        {canManage && (
          <div className="ee-state-action">
            <button className="btn btn-primary ee-btn-lg" onClick={() => setShowOnboard(true)}>
              + Onboard agent
            </button>
          </div>
        )}
      </div>

      {error && <div className="admin-form-error">{error}</div>}
      {success && <div className="admin-form-success">{success}</div>}

      <div className="ag-grid">
        <section className="card ee-card">
          <div className="ee-card-head">
            <span className="ee-eyebrow">All agents</span>
            <span className="ee-card-aside">{agents.length}</span>
          </div>
          {agents.length === 0 ? (
            <p className="ee-field-note">No agents yet. Onboard one to give them portal access.</p>
          ) : (
            <div className="ob-rows">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={`ob-row${selected?.id === a.id ? " is-on" : ""}`}
                  onClick={() => setSelectedId(a.id)}
                >
                  <span className="ob-row-main">
                    <span className="ob-row-who">
                      <strong>{displayName(a)}</strong>
                    </span>
                    <span className="ob-row-show">{a.agency}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <div className="ag-detail">
            <section className="card ee-card">
              <div className="ag-head">
                <div>
                  <h2 className="ag-name">{displayName(selected)}</h2>
                  <p className="ee-state-meta">{selected.agency}</p>
                </div>
                <div className="ag-actions">
                  <button type="button" className="btn" onClick={() => openEdit(selected)}>
                    Edit contact
                  </button>
                  <Link className="btn" href="/admin/offers/new">
                    New offer
                  </Link>
                  {canManage && (
                    <button type="button" className="btn ob-tone-bad" onClick={() => handleRemoveAgent(selected)}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <div className="ag-stats">
                <div>
                  <span className="ee-eyebrow">Shows booked</span>
                  <strong>{summary ? summary.stats.showsBooked : "—"}</strong>
                  <em>{summary?.stats.firstShow ? `since ${dateShort(summary.stats.firstShow)}` : " "}</em>
                </div>
                <div>
                  <span className="ee-eyebrow">Gross booked</span>
                  <strong>{summary ? fmtUSD(summary.stats.grossBooked) : "—"}</strong>
                  <em>ticket sales, all shows</em>
                </div>
                <div>
                  <span className="ee-eyebrow">Avg settle time</span>
                  <strong>{summary?.stats.avgSettleDays != null ? `${summary.stats.avgSettleDays} days` : "—"}</strong>
                  <em>show to finalized settlement</em>
                </div>
              </div>
            </section>

            <div className="ag-pair">
              <section className="card ee-card">
                <span className="ee-eyebrow">Contact</span>
                <dl className="ob-detail">
                  <div><dt>Name</dt><dd>{selected.agent_name}</dd></div>
                  <div><dt>Agency</dt><dd>{selected.agency}</dd></div>
                  <div><dt>Email</dt><dd>{selected.agent_email || selected.email || "—"}</dd></div>
                  <div><dt>Phone</dt><dd>{selected.agent_phone || "—"}</dd></div>
                </dl>
              </section>

              <section className="card ee-card">
                <span className="ee-eyebrow">Relationship with us</span>
                <dl className="ob-detail">
                  <div>
                    <dt>Portal</dt>
                    <dd>{summary?.portalAccess ?? !!selected.user_id ? "Agent login enabled — sees only their own shows" : "No login"}</dd>
                  </div>
                  <div><dt>Offers</dt><dd>{summary ? `${summary.offers.length} on file` : "—"}</dd></div>
                </dl>
                <span className="ee-eyebrow ob-sub">Roster</span>
                <div className="ag-roster">
                  {summary && summary.roster.length === 0 && <span className="ee-field-note">No artists on file yet.</span>}
                  {summary?.roster.map((r) => (
                    <span key={r} className="ag-chip">
                      {r}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            <section className="card ee-card">
              <div className="ee-card-head">
                <span className="ee-eyebrow">Shows booked through this agent</span>
                <span className="ee-card-aside">gross from the ledger</span>
              </div>
              {summary && summary.shows.length === 0 && <p className="ee-field-note">No shows yet.</p>}
              {summary && summary.shows.length > 0 && (
                <div className="ag-table" role="table">
                  <div className="ag-tr ag-th" role="row">
                    <span>Show</span><span>Date</span><span>Status</span><span>Gross</span>
                  </div>
                  {summary.shows.map((s, i) => {
                    const cells = (
                      <>
                        <span className="ag-show">{s.title}</span>
                        <span>{s.date ? dateShort(s.date) : "TBD"}</span>
                        <span className={s.state === "On sale" ? "ob-tone-good" : s.state === "Cancelled" ? "ob-tone-bad" : s.event_id ? "" : "ob-tone-quiet"}>{s.state}</span>
                        <span>{s.gross ? fmtUSD(s.gross) : "—"}</span>
                      </>
                    );
                    // An offer with no event linked has nowhere to go yet.
                    return s.event_id ? (
                      <Link key={s.event_id} className="ag-tr" role="row" href={`/admin/events/${s.event_id}`}>
                        {cells}
                      </Link>
                    ) : (
                      <div key={`offer-${i}`} className="ag-tr" role="row">
                        {cells}
                      </div>
                    );
                  })}
                </div>
              )}

              <span className="ee-eyebrow ob-sub">Assigned events · portal visibility</span>
              <p className="ee-field-note">What this agent can see in their portal.</p>
              {canManage && (
                <div className="ag-assign">
                  <select className="admin-form-input" value={assignEventId} onChange={(e) => setAssignEventId(e.target.value)}>
                    <option value="">Select event to assign…</option>
                    {events
                      .filter((ev) => !assignments.some((a) => a.event_id === ev.id))
                      .map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} ({ev.date ? new Date(ev.date).toLocaleDateString() : "TBD"})
                        </option>
                      ))}
                  </select>
                  <button className="btn" onClick={handleAssign} disabled={!assignEventId}>
                    Assign
                  </button>
                </div>
              )}
              {loadingAssignments ? (
                <p className="ee-field-note">Loading…</p>
              ) : assignments.length === 0 ? (
                <p className="ee-field-note">No events assigned.</p>
              ) : (
                <ul className="ob-tickets">
                  {assignments.map((a) => (
                    <li key={a.id}>
                      <span>
                        {a.event.title} · {a.event.date ? new Date(a.event.date).toLocaleDateString() : "TBD"}
                      </span>
                      {canManage && (
                        <button type="button" className="ag-link" onClick={() => handleUnassign(a.id)}>
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      {/* Onboard Agent Modal */}
      {showOnboard && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setShowOnboard(false)}>
          <div style={{
            background: "rgba(14, 14, 18, 0.96)", borderRadius: 20, backdropFilter: "blur(28px) saturate(160%)", padding: 24, maxWidth: 520, width: "100%",
            border: "1px solid rgba(255, 255, 255, 0.15)",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "#ffffff" }}>Onboard New Agent</h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
              Creates a login account and sends a welcome email with temporary credentials.
            </p>
            <form onSubmit={handleOnboardAgent}>
              <div className="admin-form-grid">
                <label className="admin-form-label">
                  First Name *
                  <input type="text" className="admin-form-input" value={onboardForm.first_name}
                    onChange={(e) => setOnboardForm({ ...onboardForm, first_name: e.target.value })} required />
                </label>
                <label className="admin-form-label">
                  Last Name *
                  <input type="text" className="admin-form-input" value={onboardForm.last_name}
                    onChange={(e) => setOnboardForm({ ...onboardForm, last_name: e.target.value })} required />
                </label>
                <label className="admin-form-label">
                  Email *
                  <input type="email" className="admin-form-input" value={onboardForm.email}
                    onChange={(e) => setOnboardForm({ ...onboardForm, email: e.target.value })} required />
                </label>
                <label className="admin-form-label">
                  Phone
                  <input type="tel" className="admin-form-input" value={onboardForm.phone}
                    onChange={(e) => setOnboardForm({ ...onboardForm, phone: formatPhoneNumber(e.target.value) })} />
                </label>
                <label className="admin-form-label" style={{ gridColumn: "1 / -1" }}>
                  Agency Name *
                  <input type="text" className="admin-form-input" value={onboardForm.agency_name}
                    onChange={(e) => setOnboardForm({ ...onboardForm, agency_name: e.target.value })} required />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="submit" className="admin-form-submit" disabled={onboarding} style={{ flex: 1 }}>
                  {onboarding ? "Onboarding…" : "Onboard Agent"}
                </button>
                <button type="button" className="admin-tier-remove-btn" onClick={() => setShowOnboard(false)} style={{ flex: 0 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editAgent && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setEditAgent(null)}>
          <div style={{
            background: "rgba(14, 14, 18, 0.96)", borderRadius: 20, backdropFilter: "blur(28px) saturate(160%)", padding: 24, maxWidth: 480, width: "100%",
            border: "1px solid rgba(255, 255, 255, 0.15)",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#ffffff" }}>Edit Agent</h2>
            <form onSubmit={handleEdit}>
              <div className="admin-form-grid">
                <label className="admin-form-label">
                  Agent Name
                  <input type="text" className="admin-form-input" value={editForm.agent_name}
                    onChange={(e) => setEditForm({ ...editForm, agent_name: e.target.value })} required />
                </label>
                <label className="admin-form-label">
                  Agency
                  <input type="text" className="admin-form-input" value={editForm.agency}
                    onChange={(e) => setEditForm({ ...editForm, agency: e.target.value })} required />
                </label>
                <label className="admin-form-label">
                  Email
                  <input type="email" className="admin-form-input" value={editForm.agent_email}
                    onChange={(e) => setEditForm({ ...editForm, agent_email: e.target.value })} />
                </label>
                <label className="admin-form-label">
                  Phone
                  <input type="tel" className="admin-form-input" value={editForm.agent_phone}
                    onChange={(e) => setEditForm({ ...editForm, agent_phone: formatPhoneNumber(e.target.value) })} />
                </label>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button type="submit" className="admin-form-submit" disabled={saving} style={{ flex: 1 }}>
                  {saving ? "Saving…" : "Save"}
                </button>
                <button type="button" className="admin-tier-remove-btn" onClick={() => setEditAgent(null)} style={{ flex: 0 }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
