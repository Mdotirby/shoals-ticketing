"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import PDFPreviewModal from "@/app/components/admin/PDFPreviewModal";

/* ── Shared types ── */
type EventRow = { id: string; title: string; date: string; venue: string };
type GuestRow = { id: string; first_name: string; last_name: string; quantity: number; artist_id: string };
type PreviewState = { event: EventRow; rows: Array<{ name: string; quantity: number }> };

/* ── Artist-only types ── */
type Assignment = {
  event_id: string;
  comp_limit: number;
  events: { id: string; title: string; date: string; venue: string };
};
type NewGuest = { first_name: string; last_name: string; quantity: number };

/* ── Organizer assignment types ── */
type ArtistUser = { id: string; first_name: string; last_name: string; email: string };
type ArtistAssignment = {
  id: string;
  event_id: string;
  artist_id: string;
  comp_limit: number;
  events: { title: string; date: string } | null;
  admin_users: { first_name: string; last_name: string } | null;
};

function slugDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function safeFilename(s: string) {
  return s.replace(/[^a-z0-9 ._-]/gi, "_").replace(/\s+/g, "_");
}

async function generateGuestListPDF(event: EventRow, rows: Array<{ name: string; quantity: number }>) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const gold: [number, number, number] = [208, 194, 144];
  const dark: [number, number, number] = [11, 13, 29];
  const white: [number, number, number] = [255, 255, 255];

  doc.setFillColor(...dark);
  doc.rect(0, 0, 216, 279, "F");
  doc.setFillColor(...gold);
  doc.rect(0, 0, 216, 22, "F");
  doc.setTextColor(...dark);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(event.title, 14, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${event.venue}  ·  ${slugDate(event.date)}`, 14, 19);

  let y = 34;
  doc.setTextColor(...gold);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("#", 14, y);
  doc.text("Guest Name", 24, y);
  doc.text("Qty", 170, y);
  y += 2;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.3);
  doc.line(14, y, 200, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  rows.forEach((row, i) => {
    if (y > 255) {
      doc.addPage();
      doc.setFillColor(...dark);
      doc.rect(0, 0, 216, 279, "F");
      y = 20;
    }
    if (i % 2 === 0) doc.setTextColor(...white); else doc.setTextColor(210, 210, 210);
    doc.text(String(i + 1), 14, y);
    doc.text(row.name, 24, y);
    doc.setTextColor(...gold);
    doc.text(String(row.quantity), 170, y);
    y += 7;
  });

  y += 2;
  doc.setDrawColor(...gold);
  doc.line(14, y, 200, y);
  y += 6;
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  doc.setTextColor(...gold);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${total}`, 14, y);

  const filename = `${safeFilename(event.title)}-${safeFilename(slugDate(event.date))}-Guest_List.pdf`;
  doc.save(filename);
}

/* ================================================================
   MAIN COMPONENT — role-based rendering
   ================================================================ */

export default function GuestListsPage() {
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) { setLoading(false); return; }
      setUserId(authData.user.id);

      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("role, venue_id")
        .eq("id", authData.user.id)
        .single();

      setUserRole(adminRecord?.role || null);
      setLoading(false);
    }
    init();
  }, []);

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Guest Lists</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (userRole === "artist" && userId) {
    return <ArtistGuestListView artistId={userId} />;
  }

  return <OrganizerGuestListView />;
}

/* ================================================================
   ARTIST VIEW — manage their own guest list
   ================================================================ */

function ArtistGuestListView({ artistId }: { artistId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [guests, setGuests] = useState<{ id: string; first_name: string; last_name: string; quantity: number }[]>([]);
  const [newGuest, setNewGuest] = useState<NewGuest>({ first_name: "", last_name: "", quantity: 1 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data } = await supabase
        .from("artist_event_assignments")
        .select("event_id, comp_limit, events(id, title, date, venue)")
        .eq("artist_id", artistId);

      if (data) {
        setAssignments(data as unknown as Assignment[]);
        if (data.length > 0) setSelectedEventId(data[0].event_id);
      }
    }
    load();
  }, [artistId]);

  useEffect(() => {
    if (!selectedEventId) return;
    const supabase = getSupabaseBrowser();
    supabase
      .from("guest_list")
      .select("id, first_name, last_name, quantity")
      .eq("event_id", selectedEventId)
      .eq("artist_id", artistId)
      .order("created_at")
      .then((result: { data: { id: string; first_name: string; last_name: string; quantity: number }[] | null }) =>
        setGuests(result.data || [])
      );
  }, [selectedEventId, artistId]);

  const selectedAssignment = assignments.find((a) => a.event_id === selectedEventId);
  const usedComps = guests.reduce((sum, g) => sum + g.quantity, 0);
  const remaining = selectedAssignment ? selectedAssignment.comp_limit - usedComps : 0;

  const addGuest = async () => {
    if (!selectedEventId) return;
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
      setGuests((prev) => [...prev, data as { id: string; first_name: string; last_name: string; quantity: number }]);
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
        <h1 className="admin-page-title">Guest Lists</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          You have no events assigned. Contact the venue admin to be assigned to an event.
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">My Guest List</h1>

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
                  {a.events.title} — {slugDate(a.events.date)}
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
            {slugDate(selectedAssignment.events.date)} · {selectedAssignment.events.venue}
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

      {remaining > 0 && (
        <div className="admin-form" style={{ marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>Add Guest</h2>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-form-grid">
            <label className="admin-form-label">
              First Name
              <input type="text" className="admin-form-input" value={newGuest.first_name}
                onChange={(e) => setNewGuest({ ...newGuest, first_name: e.target.value })} placeholder="Jane" />
            </label>
            <label className="admin-form-label">
              Last Name
              <input type="text" className="admin-form-input" value={newGuest.last_name}
                onChange={(e) => setNewGuest({ ...newGuest, last_name: e.target.value })} placeholder="Smith" />
            </label>
            <label className="admin-form-label">
              Quantity
              <input type="number" className="admin-form-input" value={newGuest.quantity} min={1} max={remaining}
                onChange={(e) => setNewGuest({ ...newGuest, quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
            </label>
          </div>
          <button className="admin-form-submit" onClick={addGuest} disabled={saving}>
            {saving ? "Adding…" : "+ Add New Guest"}
          </button>
        </div>
      )}

      {guests.length > 0 && (
        <div>
          <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "#fff" }}>
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
                  <td style={{ padding: "10px 12px", color: "#fff" }}>{g.first_name} {g.last_name}</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#d0c290" }}>{g.quantity}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button onClick={() => removeGuest(g.id)}
                      style={{ background: "none", border: "none", color: "rgba(255,100,100,0.7)", cursor: "pointer", fontSize: 16 }}
                      aria-label="Remove guest">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {guests.length === 0 && remaining <= 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>No comps remaining for this event.</p>
      )}
    </div>
  );
}

/* ================================================================
   ORGANIZER VIEW — view all guest lists + assign artists
   ================================================================ */

function OrganizerGuestListView() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [guestsByEvent, setGuestsByEvent] = useState<Record<string, GuestRow[]>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);

  /* ── Artist assignment state ── */
  const [allArtists, setAllArtists] = useState<ArtistUser[]>([]);
  const [allEvents, setAllEvents] = useState<EventRow[]>([]);
  const [assignments, setAssignments] = useState<ArtistAssignment[]>([]);
  const [assignEventId, setAssignEventId] = useState("");
  const [assignArtistId, setAssignArtistId] = useState("");
  const [assignCompLimit, setAssignCompLimit] = useState(4);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");

  const loadAssignments = useCallback(async () => {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase
      .from("artist_event_assignments")
      .select("id, event_id, artist_id, comp_limit, events(title, date), admin_users!artist_id(first_name, last_name)")
      .order("created_at", { ascending: false });
    if (data) setAssignments(data as unknown as ArtistAssignment[]);
  }, []);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("venue_id, role")
        .eq("id", authData.user.id)
        .single();

      // Load events for guest list display
      let eventsQuery = supabase
        .from("events")
        .select("id, title, date, venue")
        .order("date", { ascending: true });

      if (adminRecord?.role !== "owner" && adminRecord?.venue_id) {
        eventsQuery = eventsQuery.eq("venue_id", adminRecord.venue_id);
      }

      const { data: eventsData } = await eventsQuery;
      if (!eventsData) { setLoading(false); return; }
      setEvents(eventsData as EventRow[]);
      setAllEvents(eventsData as EventRow[]);

      // Fetch guest lists
      const eventIds = eventsData.map((e: EventRow) => e.id);
      if (eventIds.length > 0) {
        const { data: guestsData } = await supabase
          .from("guest_list")
          .select("id, event_id, first_name, last_name, quantity, artist_id")
          .in("event_id", eventIds);

        if (guestsData) {
          const byEvent: Record<string, GuestRow[]> = {};
          (guestsData as Array<GuestRow & { event_id: string }>).forEach((g) => {
            if (!byEvent[g.event_id]) byEvent[g.event_id] = [];
            byEvent[g.event_id].push(g);
          });
          setGuestsByEvent(byEvent);
        }
      }

      // Fetch artists for assignment
      const { data: artistsData } = await supabase
        .from("admin_users")
        .select("id, first_name, last_name, email")
        .eq("role", "artist");
      if (artistsData) setAllArtists(artistsData as ArtistUser[]);

      // Fetch existing assignments
      await loadAssignments();

      setLoading(false);
    }
    load();
  }, [loadAssignments]);

  const openPreview = (event: EventRow) => {
    const guests = guestsByEvent[event.id] || [];
    const rows = guests.map((g) => ({ name: `${g.first_name} ${g.last_name}`, quantity: g.quantity }));
    setPreview({ event, rows });
  };

  const downloadPDF = async () => {
    if (!preview) return;
    await generateGuestListPDF(preview.event, preview.rows);
  };

  const handleAssign = async () => {
    if (!assignEventId || !assignArtistId) {
      setAssignError("Select both an event and an artist.");
      return;
    }
    setAssignSaving(true);
    setAssignError("");
    const supabase = getSupabaseBrowser();
    const { error: dbError } = await supabase
      .from("artist_event_assignments")
      .insert({
        event_id: assignEventId,
        artist_id: assignArtistId,
        comp_limit: assignCompLimit,
      });

    if (dbError) {
      setAssignError(dbError.message);
    } else {
      setAssignEventId("");
      setAssignArtistId("");
      setAssignCompLimit(4);
      await loadAssignments();
    }
    setAssignSaving(false);
  };

  const removeAssignment = async (id: string) => {
    const supabase = getSupabaseBrowser();
    await supabase.from("artist_event_assignments").delete().eq("id", id);
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Guest Lists</h1>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

      {/* ── Event Guest Lists ── */}
      {!loading && events.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>No events found.</p>
      )}

      {!loading && events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40 }}>
          {events.map((event) => {
            const guests = guestsByEvent[event.id] || [];
            const totalGuests = guests.reduce((s, g) => s + g.quantity, 0);
            return (
              <div
                key={event.id}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8,
                  flexWrap: "wrap", gap: 10,
                }}
              >
                <div>
                  <p style={{ color: "#fff", fontWeight: 600, margin: 0 }}>{event.title}</p>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: "2px 0 0" }}>
                    {slugDate(event.date)} · {event.venue}
                  </p>
                  <p style={{ color: "#d0c290", fontSize: 12, margin: "4px 0 0" }}>
                    {totalGuests} guest{totalGuests !== 1 ? "s" : ""} on list
                  </p>
                </div>
                <button
                  className="admin-header-btn"
                  onClick={() => openPreview(event)}
                  disabled={totalGuests === 0}
                  style={{ opacity: totalGuests === 0 ? 0.4 : 1 }}
                >
                  🖨 Print Guest List
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Assign Artist to Event ── */}
      {!loading && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ margin: "0 0 16px", fontFamily: "var(--font-bayon), sans-serif", fontSize: "1.4rem", color: "#d0c290" }}>
            Assign Artist to Event
          </h2>
          {assignError && <div className="admin-form-error" style={{ marginBottom: 12 }}>{assignError}</div>}
          <div className="admin-form-grid" style={{ marginBottom: 12 }}>
            <label className="admin-form-label">
              Event
              <select className="admin-form-input" value={assignEventId} onChange={(e) => setAssignEventId(e.target.value)}>
                <option value="">Select event…</option>
                {allEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>{ev.title} — {slugDate(ev.date)}</option>
                ))}
              </select>
            </label>
            <label className="admin-form-label">
              Artist
              <select className="admin-form-input" value={assignArtistId} onChange={(e) => setAssignArtistId(e.target.value)}>
                <option value="">Select artist…</option>
                {allArtists.map((a) => (
                  <option key={a.id} value={a.id}>{a.first_name} {a.last_name} ({a.email})</option>
                ))}
              </select>
            </label>
            <label className="admin-form-label">
              Comp Limit
              <input type="number" className="admin-form-input" value={assignCompLimit} min={1} max={50}
                onChange={(e) => setAssignCompLimit(Math.max(1, parseInt(e.target.value) || 4))} />
            </label>
          </div>
          <button className="admin-form-submit" onClick={handleAssign} disabled={assignSaving}>
            {assignSaving ? "Assigning…" : "Assign Artist"}
          </button>

          {/* Current assignments */}
          {assignments.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>
                Current Assignments
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {assignments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "10px 14px", background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: "#fff", fontWeight: 500 }}>
                        {a.admin_users?.first_name} {a.admin_users?.last_name}
                      </span>
                      <span style={{ color: "rgba(255,255,255,0.35)", margin: "0 8px" }}>→</span>
                      <span style={{ color: "rgba(255,255,255,0.7)" }}>
                        {a.events?.title}
                      </span>
                      {a.events?.date && (
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginLeft: 6 }}>
                          ({slugDate(a.events.date)})
                        </span>
                      )}
                      <span style={{ color: "#d0c290", fontSize: 12, marginLeft: 12 }}>
                        {a.comp_limit} comps
                      </span>
                    </div>
                    <button
                      onClick={() => removeAssignment(a.id)}
                      style={{
                        background: "rgba(255,100,100,0.08)", border: "1px solid rgba(255,100,100,0.2)",
                        borderRadius: 6, color: "rgba(255,100,100,0.8)", fontSize: 12, fontWeight: 600,
                        padding: "4px 12px", cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {preview && (
        <PDFPreviewModal
          title={`${preview.event.title} — ${slugDate(preview.event.date)}`}
          rows={preview.rows}
          onDownload={downloadPDF}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
