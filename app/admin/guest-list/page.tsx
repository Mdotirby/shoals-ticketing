"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Assignment = {
  event_id: string;
  comp_limit: number;
  events: { id: string; title: string; date: string; venue: string };
};

type GuestEntry = {
  id: string;
  first_name: string;
  last_name: string;
  quantity: number;
};

type NewGuest = { first_name: string; last_name: string; quantity: number };

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ArtistGuestListPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [guests, setGuests] = useState<GuestEntry[]>([]);
  const [newGuest, setNewGuest] = useState<NewGuest>({ first_name: "", last_name: "", quantity: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [artistId, setArtistId] = useState<string | null>(null);

  // Load current user + their event assignments
  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;
      setArtistId(authData.user.id);

      const { data } = await supabase
        .from("artist_event_assignments")
        .select("event_id, comp_limit, events(id, title, date, venue)")
        .eq("artist_id", authData.user.id);

      if (data) {
        setAssignments(data as unknown as Assignment[]);
        if (data.length > 0) setSelectedEventId(data[0].event_id);
      }
    }
    load();
  }, []);

  // Load guests for selected event
  useEffect(() => {
    if (!selectedEventId || !artistId) return;
    const supabase = getSupabaseBrowser();
    supabase
      .from("guest_list")
      .select("id, first_name, last_name, quantity")
      .eq("event_id", selectedEventId)
      .eq("artist_id", artistId)
      .order("created_at")
      .then((result: { data: GuestEntry[] | null }) => setGuests(result.data || []));
  }, [selectedEventId, artistId]);

  const selectedAssignment = assignments.find((a) => a.event_id === selectedEventId);
  const usedComps = guests.reduce((sum, g) => sum + g.quantity, 0);
  const remaining = selectedAssignment ? selectedAssignment.comp_limit - usedComps : 0;

  const addGuest = async () => {
    if (!selectedEventId || !artistId) return;
    if (!newGuest.first_name.trim() || !newGuest.last_name.trim()) {
      setError("First and last name are required.");
      return;
    }
    if (newGuest.quantity > remaining) {
      setError(`Only ${remaining} comp(s) remaining.`);
      return;
    }
    setSaving(true);
    setError("");
    const supabase = getSupabaseBrowser();
    const { data, error: dbError } = await supabase
      .from("guest_list")
      .insert({
        event_id: selectedEventId,
        artist_id: artistId,
        first_name: newGuest.first_name.trim(),
        last_name: newGuest.last_name.trim(),
        quantity: newGuest.quantity,
      })
      .select()
      .single();

    if (dbError) {
      setError(dbError.message);
    } else if (data) {
      setGuests((prev) => [...prev, data as GuestEntry]);
      setNewGuest({ first_name: "", last_name: "", quantity: 1 });
    }
    setSaving(false);
  };

  const removeGuest = async (id: string) => {
    const supabase = getSupabaseBrowser();
    await supabase.from("guest_list").delete().eq("id", id);
    setGuests((prev) => prev.filter((g) => g.id !== id));
  };

  if (assignments.length === 0) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Guest List</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          You have no events assigned. Contact the venue admin to be assigned to an event.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">My Guest List</h1>

      {/* Event selector */}
      {assignments.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <label className="admin-form-label">
            Select Event
            <select
              className="admin-form-input"
              value={selectedEventId ?? ""}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              {assignments.map((a) => (
                <option key={a.event_id} value={a.event_id}>
                  {a.events.title} — {formatDate(a.events.date)}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {selectedAssignment && (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(208,194,144,0.08)", borderRadius: 8, border: "1px solid rgba(208,194,144,0.15)" }}>
          <strong style={{ color: "#d0c290" }}>{selectedAssignment.events.title}</strong>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginLeft: 12 }}>
            {formatDate(selectedAssignment.events.date)} · {selectedAssignment.events.venue}
          </span>
          <div style={{ marginTop: 6, fontSize: 13 }}>
            <span style={{ color: remaining > 0 ? "#d0c290" : "#ff6b6b" }}>
              {remaining} comp{remaining !== 1 ? "s" : ""} remaining
            </span>
            <span style={{ color: "rgba(255,255,255,0.35)", marginLeft: 8 }}>
              ({usedComps} of {selectedAssignment.comp_limit} used)
            </span>
          </div>
        </div>
      )}

      {/* Add guest form */}
      {remaining > 0 && (
        <div className="admin-form" style={{ marginBottom: 24 }}>
          <h2 className="admin-form-section-title">Add Guest</h2>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-grid">
            <label className="admin-form-label">
              First Name
              <input
                type="text"
                className="admin-form-input"
                value={newGuest.first_name}
                onChange={(e) => setNewGuest({ ...newGuest, first_name: e.target.value })}
                placeholder="Jane"
              />
            </label>
            <label className="admin-form-label">
              Last Name
              <input
                type="text"
                className="admin-form-input"
                value={newGuest.last_name}
                onChange={(e) => setNewGuest({ ...newGuest, last_name: e.target.value })}
                placeholder="Smith"
              />
            </label>
            <label className="admin-form-label">
              Quantity
              <input
                type="number"
                className="admin-form-input"
                value={newGuest.quantity}
                min={1}
                max={remaining}
                onChange={(e) => setNewGuest({ ...newGuest, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
              />
            </label>
          </div>
          <button className="admin-form-submit" onClick={addGuest} disabled={saving}>
            {saving ? "Adding…" : "+ Add New Guest"}
          </button>
        </div>
      )}

      {/* Guest list table */}
      {guests.length > 0 && (
        <div>
          <h2 className="admin-form-section-title" style={{ marginBottom: 12 }}>
            Current Guest List ({guests.length} {guests.length === 1 ? "entry" : "entries"})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                <th style={{ textAlign: "left", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Name</th>
                <th style={{ textAlign: "center", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Qty</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => (
                <tr key={g.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "10px 12px", color: "#fff" }}>
                    {g.first_name} {g.last_name}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#d0c290" }}>
                    {g.quantity}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <button
                      onClick={() => removeGuest(g.id)}
                      style={{ background: "none", border: "none", color: "rgba(255,100,100,0.7)", cursor: "pointer", fontSize: 16 }}
                      aria-label="Remove guest"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {guests.length === 0 && remaining <= 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
          No comps remaining for this event.
        </p>
      )}
    </div>
  );
}
