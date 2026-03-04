"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";

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

  // Edit modal state
  const [editAgent, setEditAgent] = useState<Agent | null>(null);
  const [editForm, setEditForm] = useState({ agency: "", agent_name: "", agent_phone: "", agent_email: "" });
  const [saving, setSaving] = useState(false);

  // Assignment state
  const [assignAgent, setAssignAgent] = useState<Agent | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignEventId, setAssignEventId] = useState("");
  const [loadingAssignments, setLoadingAssignments] = useState(false);

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

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Agents</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Agents</h1>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginBottom: 20 }}>
        Manage booking agents and their event assignments.
      </p>

      {error && <div className="admin-form-error" style={{ marginBottom: 12 }}>{error}</div>}
      {success && <div className="admin-form-success" style={{ marginBottom: 12 }}>{success}</div>}

      {/* Agents Table */}
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(208,194,144,0.15)" }}>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Agent</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Agency</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Email</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Phone</th>
              <th style={{ padding: "10px 12px", textAlign: "left", color: "rgba(255,255,255,0.5)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: "24px 12px", textAlign: "center", color: "rgba(255,255,255,0.3)" }}>
                  No agents found. Use Onboarding to add agents.
                </td>
              </tr>
            ) : (
              agents.map((agent) => (
                <tr key={agent.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 12px", color: "#d0c290" }}>
                    {agent.first_name && agent.last_name
                      ? `${agent.first_name} ${agent.last_name}`
                      : agent.agent_name}
                  </td>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.7)" }}>{agent.agency}</td>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.6)" }}>{agent.email || agent.agent_email || "—"}</td>
                  <td style={{ padding: "10px 12px", color: "rgba(255,255,255,0.6)" }}>{agent.agent_phone || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className="admin-sponsor-edit-btn"
                        style={{ fontSize: 12, padding: "4px 10px" }}
                        onClick={() => {
                          setEditAgent(agent);
                          setEditForm({
                            agency: agent.agency || "",
                            agent_name: agent.agent_name || "",
                            agent_phone: agent.agent_phone || "",
                            agent_email: agent.agent_email || agent.email || "",
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="admin-sponsor-edit-btn"
                        style={{ fontSize: 12, padding: "4px 10px", background: "rgba(208,194,144,0.1)" }}
                        onClick={() => {
                          setAssignAgent(agent);
                          loadAssignments(agent.id);
                        }}
                      >
                        Events
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editAgent && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setEditAgent(null)}>
          <div style={{
            background: "#131629", borderRadius: 12, padding: 24, maxWidth: 480, width: "100%",
            border: "1px solid rgba(208,194,144,0.15)",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18, color: "#d0c290" }}>Edit Agent</h2>
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
                    onChange={(e) => setEditForm({ ...editForm, agent_phone: e.target.value })} />
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

      {/* Assignments Modal */}
      {assignAgent && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        }} onClick={() => setAssignAgent(null)}>
          <div style={{
            background: "#131629", borderRadius: 12, padding: 24, maxWidth: 560, width: "100%",
            border: "1px solid rgba(208,194,144,0.15)", maxHeight: "80vh", overflowY: "auto",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "#d0c290" }}>
              Event Assignments
            </h2>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
              {assignAgent.agent_name} — {assignAgent.agency}
            </p>

            {/* Add assignment */}
            {(role === "owner" || role === "venue_admin") && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <select
                  className="admin-form-input"
                  value={assignEventId}
                  onChange={(e) => setAssignEventId(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Select event to assign…</option>
                  {events
                    .filter((ev) => !assignments.some((a) => a.event_id === ev.id))
                    .map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} ({ev.date ? new Date(ev.date).toLocaleDateString() : "TBD"})
                      </option>
                    ))}
                </select>
                <button
                  className="admin-form-submit"
                  style={{ padding: "8px 16px", whiteSpace: "nowrap" }}
                  onClick={handleAssign}
                  disabled={!assignEventId}
                >
                  Assign
                </button>
              </div>
            )}

            {/* Current assignments */}
            {loadingAssignments ? (
              <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
            ) : assignments.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 16 }}>
                No events assigned.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 12px", background: "rgba(208,194,144,0.05)", borderRadius: 8,
                    }}
                  >
                    <div>
                      <span style={{ color: "#d0c290", fontSize: 14 }}>{a.event.title}</span>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginLeft: 8 }}>
                        {a.event.date ? new Date(a.event.date).toLocaleDateString() : "TBD"}
                      </span>
                    </div>
                    {(role === "owner" || role === "venue_admin") && (
                      <button
                        className="admin-tier-remove-btn"
                        style={{ fontSize: 11, padding: "2px 8px" }}
                        onClick={() => handleUnassign(a.id)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              className="admin-tier-remove-btn"
              onClick={() => setAssignAgent(null)}
              style={{ marginTop: 16, width: "100%" }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
