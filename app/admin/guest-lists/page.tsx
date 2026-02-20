"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import PDFPreviewModal from "@/app/components/admin/PDFPreviewModal";

/* ── Types ── */
type EventRow = { id: string; title: string; date: string; venue: string };
type GuestRow = {
  id: string;
  first_name: string;
  last_name: string;
  quantity: number;
  artist_id: string;
};
type ArtistAssignment = {
  id: string;
  artist_id: string;
  comp_limit: number;
  artist_name?: string;
  artist_email?: string;
};
type PreviewState = {
  event: EventRow;
  rows: Array<{ name: string; quantity: number }>;
};

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")); }

function slugDate(d: string) {
  return safeDate(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function safeFilename(s: string) {
  return s.replace(/[^a-z0-9 ._-]/gi, "_").replace(/\s+/g, "_");
}

async function generateGuestListPDF(
  event: EventRow,
  rows: Array<{ name: string; quantity: number }>
) {
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
    if (i % 2 === 0) doc.setTextColor(...white);
    else doc.setTextColor(210, 210, 210);
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
      if (!authData?.user) {
        setLoading(false);
        return;
      }
      setUserId(authData.user.id);

      // Try cookie first for speed, fall back to DB
      const cookieRole = getCookie("user-role");
      if (cookieRole) {
        setUserRole(cookieRole);
        setLoading(false);
        return;
      }

      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("role")
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

  if (userId) {
    return <OrganizerGuestListView userId={userId} />;
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Guest Lists</h1>
      <p style={{ color: "rgba(255,255,255,0.5)" }}>Not authenticated.</p>
    </div>
  );
}

/* ================================================================
   ARTIST VIEW — manage their own guest list
   ================================================================ */

type Assignment = {
  event_id: string;
  comp_limit: number;
  events: { id: string; title: string; date: string; venue: string };
};

type NewGuestRow = { first_name: string; last_name: string; quantity: number };

function ArtistGuestListView({ artistId }: { artistId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [newGuests, setNewGuests] = useState<NewGuestRow[]>([{ first_name: "", last_name: "", quantity: 1 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [tablesExist, setTablesExist] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Use API route (service role) to bypass RLS
        const res = await fetch(`/api/artists/assignments?artist_id=${artistId}`);
        if (!res.ok) {
          const errData = await res.json();
          if (errData.error?.includes("does not exist")) { setTablesExist(false); return; }
          return;
        }
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setAssignments(data as Assignment[]);
          setSelectedEventId(data[0].event_id);
        }
      } catch {
        // ignore
      }
    }
    load();
  }, [artistId]);

  const loadGuests = useCallback(async () => {
    if (!selectedEventId) return;
    try {
      const res = await fetch(`/api/artists/guests?event_id=${selectedEventId}&artist_id=${artistId}`);
      if (res.ok) {
        const data = await res.json();
        setGuests(Array.isArray(data) ? data : []);
      }
    } catch {
      setGuests([]);
    }
  }, [selectedEventId, artistId]);

  useEffect(() => { loadGuests(); }, [loadGuests]);

  const selectedAssignment = assignments.find((a) => a.event_id === selectedEventId);
  const usedComps = guests.reduce((sum, g) => sum + g.quantity, 0);
  const remaining = selectedAssignment ? selectedAssignment.comp_limit - usedComps : 0;

  const addGuests = async () => {
    if (!selectedEventId) return;
    const validRows = newGuests.filter((g) => g.first_name.trim() && g.last_name.trim());
    if (validRows.length === 0) {
      setError("At least one guest with first and last name is required.");
      return;
    }
    const totalNew = validRows.reduce((s, g) => s + g.quantity, 0);
    if (totalNew > remaining) {
      setError(`Only ${remaining} comp(s) remaining. You're trying to add ${totalNew}.`);
      return;
    }
    setSaving(true);
    setError("");

    for (const guest of validRows) {
      const res = await fetch("/api/artists/guests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selectedEventId,
          artist_id: artistId,
          first_name: guest.first_name,
          last_name: guest.last_name,
          quantity: guest.quantity,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        setError(errData.error || "Failed to add guest");
        break;
      } else {
        const data = await res.json();
        setGuests((prev) => [...prev, data as GuestRow]);
      }
    }
    setNewGuests([{ first_name: "", last_name: "", quantity: 1 }]);
    setSaving(false);
  };

  const updateNewGuest = (index: number, field: keyof NewGuestRow, value: string | number) => {
    setNewGuests((prev) => prev.map((g, i) => i === index ? { ...g, [field]: value } : g));
  };

  const addGuestRow = () => {
    setNewGuests((prev) => [...prev, { first_name: "", last_name: "", quantity: 1 }]);
  };

  const removeGuestRow = (index: number) => {
    setNewGuests((prev) => prev.filter((_, i) => i !== index));
  };

  const removeGuest = async (id: string) => {
    await fetch(`/api/artists/guests?id=${id}`, { method: "DELETE" });
    setGuests((prev) => prev.filter((g) => g.id !== id));
  };

  if (!tablesExist) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Guest Lists</h1>
        <div style={{ padding: "20px", background: "rgba(255,200,50,0.08)", border: "1px solid rgba(255,200,50,0.2)", borderRadius: 8 }}>
          <p style={{ color: "#ffc832", margin: 0, fontWeight: 600 }}>⚠ Guest list tables not found.</p>
          <p style={{ color: "rgba(255,255,255,0.6)", margin: "8px 0 0", fontSize: 13 }}>
            Please run the <code>artist-role-guest-list-migration.sql</code> migration in Supabase.
          </p>
        </div>
      </div>
    );
  }

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
        <div
          style={{
            marginBottom: 20,
            padding: "12px 16px",
            background: "rgba(208,194,144,0.08)",
            borderRadius: 8,
            border: "1px solid rgba(208,194,144,0.15)",
          }}
        >
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
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>Add Guests</h2>
          {error && <div className="admin-form-error">{error}</div>}
          <div className="admin-tiers-list" style={{ marginTop: 8 }}>
            {newGuests.map((g, i) => (
              <div key={i} className="admin-tier-row" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                <input
                  type="text"
                  className="admin-form-input"
                  value={g.first_name}
                  onChange={(e) => updateNewGuest(i, "first_name", e.target.value)}
                  placeholder="First Name"
                  style={{ flex: 2 }}
                />
                <input
                  type="text"
                  className="admin-form-input"
                  value={g.last_name}
                  onChange={(e) => updateNewGuest(i, "last_name", e.target.value)}
                  placeholder="Last Name"
                  style={{ flex: 2 }}
                />
                <input
                  type="number"
                  className="admin-form-input"
                  value={g.quantity}
                  min={1}
                  max={remaining}
                  onChange={(e) => updateNewGuest(i, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: 60, flex: "none" }}
                  placeholder="Qty"
                />
                {newGuests.length > 1 && (
                  <button type="button" className="admin-tier-remove-btn" onClick={() => removeGuestRow(i)}>✕</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button type="button" className="admin-tier-add-btn" onClick={addGuestRow} style={{ fontSize: 12 }}>
              + add guest
            </button>
            <button className="admin-form-submit" onClick={addGuests} disabled={saving} style={{ padding: "8px 20px" }}>
              {saving ? "Saving…" : "Save All"}
            </button>
          </div>
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
                  <td style={{ padding: "10px 12px", color: "#fff" }}>
                    {g.first_name} {g.last_name}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#d0c290" }}>
                    {g.quantity}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <button
                      onClick={() => removeGuest(g.id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "rgba(255,100,100,0.7)",
                        cursor: "pointer",
                        fontSize: 16,
                      }}
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

/* ================================================================
   ORGANIZER VIEW — event selector, guest CRUD, PDF, assignments
   ================================================================ */

function OrganizerGuestListView({ userId }: { userId: string }) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [artistAssignments, setArtistAssignments] = useState<ArtistAssignment[]>([]);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [tablesExist, setTablesExist] = useState(true);
  const [guestError, setGuestError] = useState("");

  // Add guest form
  const [newGuest, setNewGuest] = useState({ first_name: "", last_name: "", quantity: 1 });
  const [saving, setSaving] = useState(false);

  // Assign artist form
  const [allArtists, setAllArtists] = useState<{ id: string; first_name: string; last_name: string; email: string }[]>([]);
  const [assignArtistId, setAssignArtistId] = useState("");
  const [assignCompLimit, setAssignCompLimit] = useState(4);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Fetch events via API (bypasses RLS)
  useEffect(() => {
    async function loadEvents() {
      try {
        const venueId = getCookie("venue-id") || "";
        const params = new URLSearchParams({ all: "1" });
        if (venueId) params.set("venue_id", venueId);

        const res = await fetch(`/api/events?${params.toString()}`);
        const data = await res.json();

        if (Array.isArray(data)) {
          setEvents(data as EventRow[]);
          if (data.length > 0) setSelectedEventId(data[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch events:", err);
      }
      setLoading(false);
    }
    loadEvents();
  }, []);

  // Fetch artists list via API
  useEffect(() => {
    async function loadArtists() {
      try {
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        if (Array.isArray(data)) {
          setAllArtists(
            data.filter((u: { role: string }) => u.role === "artist")
          );
        }
      } catch (err) {
        console.error("Failed to fetch artists:", err);
      }
    }
    loadArtists();
  }, []);

  // Fetch guests + artist assignments when event changes
  const loadEventData = useCallback(
    async (eventId: string) => {
      if (!eventId) return;

      // Fetch guest list via API (bypasses RLS)
      try {
        const guestRes = await fetch(`/api/artists/guests?event_id=${eventId}`);
        if (guestRes.ok) {
          const guestData = await guestRes.json();
          setGuests(Array.isArray(guestData) ? guestData : []);
        }
      } catch (err) {
        console.error("Guest list fetch error:", err);
      }

      // Fetch artist assignments for this event via Supabase (owner has RLS access)
      const supabase = getSupabaseBrowser();
      const { data: assignData, error: assignErr } = await supabase
        .from("artist_event_assignments")
        .select("id, artist_id, comp_limit")
        .eq("event_id", eventId);

      if (assignErr) {
        if (assignErr.message.includes("does not exist") || assignErr.code === "42P01") {
          setTablesExist(false);
          return;
        }
      }

      if (assignData && assignData.length > 0) {
        // Enrich with artist names from the allArtists list or fetch them
        const enriched: ArtistAssignment[] = assignData.map((a: { id: string; artist_id: string; comp_limit: number }) => {
          const found = allArtists.find((ar) => ar.id === a.artist_id);
          return {
            ...a,
            artist_name: found ? `${found.first_name} ${found.last_name}` : "Unknown",
            artist_email: found?.email || "",
          };
        });
        setArtistAssignments(enriched);
      } else {
        setArtistAssignments([]);
      }
    },
    [allArtists]
  );

  useEffect(() => {
    if (selectedEventId) loadEventData(selectedEventId);
  }, [selectedEventId, loadEventData]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const totalGuests = guests.reduce((s, g) => s + g.quantity, 0);

  // Add guest (organizer adds directly, using their own userId as artist_id)
  const addGuest = async () => {
    if (!selectedEventId) return;
    if (!newGuest.first_name.trim() || !newGuest.last_name.trim()) {
      setGuestError("First and last name are required.");
      return;
    }
    setSaving(true);
    setGuestError("");

    const res = await fetch("/api/artists/guests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: selectedEventId,
        artist_id: userId,
        first_name: newGuest.first_name.trim(),
        last_name: newGuest.last_name.trim(),
        quantity: newGuest.quantity,
      }),
    });

    if (!res.ok) {
      const errData = await res.json();
      setGuestError(errData.error || "Failed to add guest");
    } else {
      const data = await res.json();
      setGuests((prev) => [...prev, data as GuestRow]);
      setNewGuest({ first_name: "", last_name: "", quantity: 1 });
    }
    setSaving(false);
  };

  const removeGuest = async (id: string) => {
    await fetch(`/api/artists/guests?id=${id}`, { method: "DELETE" });
    setGuests((prev) => prev.filter((g) => g.id !== id));
  };

  // Print
  const openPreview = () => {
    if (!selectedEvent || guests.length === 0) return;
    const rows = guests.map((g) => ({
      name: `${g.first_name} ${g.last_name}`,
      quantity: g.quantity,
    }));
    setPreview({ event: selectedEvent, rows });
  };

  const downloadPDF = async () => {
    if (!preview) return;
    await generateGuestListPDF(preview.event, preview.rows);
  };

  // Assign artist
  const handleAssign = async () => {
    if (!assignArtistId || !selectedEventId) {
      setAssignError("Select an artist.");
      return;
    }
    setAssignSaving(true);
    setAssignError("");
    const supabase = getSupabaseBrowser();
    const { error: dbError } = await supabase
      .from("artist_event_assignments")
      .insert({
        event_id: selectedEventId,
        artist_id: assignArtistId,
        comp_limit: assignCompLimit,
      });

    if (dbError) {
      setAssignError(dbError.message);
    } else {
      setAssignArtistId("");
      setAssignCompLimit(4);
      await loadEventData(selectedEventId);
    }
    setAssignSaving(false);
  };

  const removeAssignment = async (id: string) => {
    const supabase = getSupabaseBrowser();
    await supabase.from("artist_event_assignments").delete().eq("id", id);
    setArtistAssignments((prev) => prev.filter((a) => a.id !== id));
  };

  if (!tablesExist) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Guest Lists</h1>
        <div
          style={{
            padding: "20px",
            background: "rgba(255,200,50,0.08)",
            border: "1px solid rgba(255,200,50,0.2)",
            borderRadius: 8,
          }}
        >
          <p style={{ color: "#ffc832", margin: 0, fontWeight: 600 }}>
            ⚠ Guest list tables not found.
          </p>
          <p style={{ color: "rgba(255,255,255,0.6)", margin: "8px 0 0", fontSize: 13 }}>
            Please run the <code>artist-role-guest-list-migration.sql</code> migration in Supabase.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Guest Lists</h1>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

      {!loading && events.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>No events found.</p>
      )}

      {!loading && events.length > 0 && (
        <>
          {/* ── Event Selector ── */}
          <div style={{ marginBottom: 24 }}>
            <label className="admin-form-label">
              Select Event
              <select
                className="admin-form-input"
                value={selectedEventId}
                onChange={(e) => setSelectedEventId(e.target.value)}
              >
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {slugDate(ev.date)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* ── Event Info Bar ── */}
          {selectedEvent && (
            <div
              style={{
                marginBottom: 20,
                padding: "12px 16px",
                background: "rgba(208,194,144,0.08)",
                borderRadius: 8,
                border: "1px solid rgba(208,194,144,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <div>
                <strong style={{ color: "#d0c290" }}>{selectedEvent.title}</strong>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginLeft: 12 }}>
                  {slugDate(selectedEvent.date)} · {selectedEvent.venue}
                </span>
                <div style={{ marginTop: 4, fontSize: 13, color: "#d0c290" }}>
                  {totalGuests} guest{totalGuests !== 1 ? "s" : ""} on list
                </div>
              </div>
              <button
                className="admin-header-btn"
                onClick={openPreview}
                disabled={totalGuests === 0}
                style={{ opacity: totalGuests === 0 ? 0.4 : 1 }}
              >
                🖨 Print Guest List
              </button>
            </div>
          )}

          {/* ── Add Guest Form ── */}
          <div className="admin-form" style={{ marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#fff" }}>Add Guest</h2>
            {guestError && <div className="admin-form-error">{guestError}</div>}
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
                  max={50}
                  onChange={(e) =>
                    setNewGuest({ ...newGuest, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                  }
                />
              </label>
            </div>
            <button className="admin-form-submit" onClick={addGuest} disabled={saving}>
              {saving ? "Adding…" : "+ Add Guest"}
            </button>
          </div>

          {/* ── Guest List Table ── */}
          {guests.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "#fff" }}>
                Guest List ({guests.length} {guests.length === 1 ? "entry" : "entries"})
              </h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ textAlign: "left", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                      Name
                    </th>
                    <th style={{ textAlign: "center", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
                      Qty
                    </th>
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
                          style={{
                            background: "none",
                            border: "none",
                            color: "rgba(255,100,100,0.7)",
                            cursor: "pointer",
                            fontSize: 16,
                          }}
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

          {/* ── Artist Assignments for this Event ── */}
          <div style={{ marginBottom: 40 }}>
            <h2
              style={{
                margin: "0 0 16px",
                fontFamily: "var(--font-bayon), sans-serif",
                fontSize: "1.4rem",
                color: "#d0c290",
              }}
            >
              Artist Assignments
            </h2>

            {/* Current assignments */}
            {artistAssignments.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {artistAssignments.map((a) => (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      borderRadius: 8,
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: "#fff", fontWeight: 500 }}>{a.artist_name}</span>
                      {a.artist_email && (
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginLeft: 8 }}>
                          ({a.artist_email})
                        </span>
                      )}
                      <span style={{ color: "#d0c290", fontSize: 12, marginLeft: 12 }}>
                        {a.comp_limit} comps
                      </span>
                    </div>
                    <button
                      onClick={() => removeAssignment(a.id)}
                      style={{
                        background: "rgba(255,100,100,0.08)",
                        border: "1px solid rgba(255,100,100,0.2)",
                        borderRadius: 6,
                        color: "rgba(255,100,100,0.8)",
                        fontSize: 12,
                        fontWeight: 600,
                        padding: "4px 12px",
                        cursor: "pointer",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            {artistAssignments.length === 0 && (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 16 }}>
                No artists assigned to this event yet.
              </p>
            )}

            {/* Assign artist form */}
            {allArtists.length > 0 ? (
              <>
                {assignError && <div className="admin-form-error" style={{ marginBottom: 12 }}>{assignError}</div>}
                <div className="admin-form-grid" style={{ marginBottom: 12 }}>
                  <label className="admin-form-label">
                    Artist
                    <select
                      className="admin-form-input"
                      value={assignArtistId}
                      onChange={(e) => setAssignArtistId(e.target.value)}
                    >
                      <option value="">Select artist…</option>
                      {allArtists.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.first_name} {a.last_name} ({a.email})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="admin-form-label">
                    Comp Limit
                    <input
                      type="number"
                      className="admin-form-input"
                      value={assignCompLimit}
                      min={1}
                      max={50}
                      onChange={(e) =>
                        setAssignCompLimit(Math.max(1, parseInt(e.target.value) || 4))
                      }
                    />
                  </label>
                </div>
                <button className="admin-form-submit" onClick={handleAssign} disabled={assignSaving}>
                  {assignSaving ? "Assigning…" : "Assign Artist"}
                </button>
              </>
            ) : (
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                No artist users found. Create artists from the{" "}
                <a href="/portal" style={{ color: "#d0c290" }}>
                  Portal
                </a>{" "}
                page first.
              </p>
            )}
          </div>
        </>
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
