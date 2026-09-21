"use client";

/**
 * Guest Lists — rebuilt on the shared primitives (app/components/admin/ui.tsx)
 * against design/liquid-glass/admin_guestlists.png and its mobile variant.
 *
 * Restyle only, both views intact: the artist view (own allocation, remaining-
 * comp guard, multi-row add) and the organizer view (event picker, guest CRUD,
 * artist assignments, PDF preview). Every Supabase call, the comp-limit checks
 * and the print flow are unchanged.
 */

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import PDFPreviewModal from "@/app/components/admin/PDFPreviewModal";
import {
  Button,
  Card,
  DataTable,
  EmptyState,
  Field,
  PageHeader,
  Pill,
} from "@/app/components/admin/ui";

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

import { formatEventDateShort } from "@/lib/dates";

function slugDate(d: string) {
  return formatEventDateShort(d);
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

  const gold: [number, number, number] = [255, 255, 255];
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
      <>
        <PageHeader title="Guest Lists" />
        <p className="ui-intro">Loading…</p>
      </>
    );
  }

  if (userRole === "artist" && userId) {
    return <ArtistGuestListView artistId={userId} />;
  }

  if (userId) {
    return <OrganizerGuestListView userId={userId} />;
  }

  return (
    <>
      <PageHeader title="Guest Lists" />
      <p className="ui-intro">Not authenticated.</p>
    </>
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
      <>
        <PageHeader title="Guest Lists" />
        <Card>
          <p style={{ color: "#ffc832", margin: 0, fontWeight: 700 }}>Guest list tables not found.</p>
          <p style={{ color: "rgba(255,255,255,0.5)", margin: "8px 0 0", fontSize: 12.5 }}>
            Please run the <code>artist-role-guest-list-migration.sql</code> migration in Supabase.
          </p>
        </Card>
      </>
    );
  }

  if (assignments.length === 0) {
    return (
      <>
        <PageHeader title="Guest Lists" />
        <Card>
          <EmptyState
            title="No events assigned"
            description="Contact the venue admin to be assigned to an event."
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My Guest List" />

      {assignments.length > 1 && (
        <div style={{ maxWidth: 420, marginBottom: 16 }}>
          <Field label="Select event">
            <select value={selectedEventId ?? ""} onChange={(e) => setSelectedEventId(e.target.value)}>
              {assignments.map((a) => (
                <option key={a.event_id} value={a.event_id}>
                  {a.events.title} — {slugDate(a.events.date)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {selectedAssignment && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
            {selectedAssignment.events.title}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.44)", marginTop: 4 }}>
            {slugDate(selectedAssignment.events.date)} · {selectedAssignment.events.venue}
          </div>
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <Pill tone={remaining > 0 ? "good" : "bad"}>
              {remaining} comp{remaining !== 1 ? "s" : ""} remaining
            </Pill>
            <span className="ui-rowstat">
              ({usedComps} of {selectedAssignment.comp_limit} used)
            </span>
          </div>
        </Card>
      )}

      {remaining > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title="Add guests">
            {error && <p style={{ color: "var(--lg-bad)", fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
            {newGuests.map((g, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={g.first_name}
                  onChange={(e) => updateNewGuest(i, "first_name", e.target.value)}
                  placeholder="First name"
                  style={{ flex: 2, minWidth: 130 }}
                />
                <input
                  type="text"
                  value={g.last_name}
                  onChange={(e) => updateNewGuest(i, "last_name", e.target.value)}
                  placeholder="Last name"
                  style={{ flex: 2, minWidth: 130 }}
                />
                <input
                  type="number"
                  value={g.quantity}
                  min={1}
                  max={remaining}
                  onChange={(e) => updateNewGuest(i, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                  placeholder="Qty"
                  style={{ width: 72, flex: "none" }}
                />
                {newGuests.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeGuestRow(i)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <Button variant="outline" size="sm" onClick={addGuestRow}>
                + Add row
              </Button>
              <Button variant="primary" size="sm" onClick={addGuests} disabled={saving}>
                {saving ? "Saving…" : "Save All"}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {guests.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card
            title="Current guest list"
            count={`${guests.length} ${guests.length === 1 ? "entry" : "entries"}`}
            flush
          >
            <DataTable columns={["Name", "Qty", ""]}>
              {guests.map((g) => (
                <tr key={g.id}>
                  <td>
                    {g.first_name} {g.last_name}
                  </td>
                  <td>{g.quantity}</td>
                  <td style={{ textAlign: "right" }}>
                    <Button variant="danger" size="sm" onClick={() => removeGuest(g.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </DataTable>
          </Card>
        </div>
      )}

      {guests.length === 0 && remaining <= 0 && (
        <Card>
          <EmptyState title="No comps remaining" description="This event's allocation is used up." />
        </Card>
      )}
    </>
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
      <>
        <PageHeader title="Guest Lists" />
        <Card>
          <p style={{ color: "#ffc832", margin: 0, fontWeight: 700 }}>Guest list tables not found.</p>
          <p style={{ color: "rgba(255,255,255,0.5)", margin: "8px 0 0", fontSize: 12.5 }}>
            Please run the <code>artist-role-guest-list-migration.sql</code> migration in Supabase.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Guest Lists" />

      {loading && <p className="ui-intro">Loading…</p>}

      {!loading && events.length === 0 && (
        <Card>
          <EmptyState title="No events found" />
        </Card>
      )}

      {!loading && events.length > 0 && (
        <>
          <div style={{ maxWidth: 420, marginBottom: 16 }}>
            <Field label="Select event">
              <select value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.title} — {slugDate(ev.date)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {selectedEvent && (
            <Card>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{selectedEvent.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.44)", marginTop: 4 }}>
                    {slugDate(selectedEvent.date)} · {selectedEvent.venue} · {totalGuests} guest
                    {totalGuests !== 1 ? "s" : ""} on list
                  </div>
                </div>
                <Button variant="primary" onClick={openPreview} disabled={totalGuests === 0}>
                  Print Guest List
                </Button>
              </div>
            </Card>
          )}

          <div className="ui-grid ui-grid-2" style={{ marginTop: 16, alignItems: "start" }}>
            <Card title="Add guest">
              {guestError && (
                <p style={{ color: "var(--lg-bad)", fontSize: 12.5, marginBottom: 10 }}>{guestError}</p>
              )}
              <div className="ui-grid ui-grid-2">
                <Field label="First name">
                  <input
                    type="text"
                    value={newGuest.first_name}
                    onChange={(e) => setNewGuest({ ...newGuest, first_name: e.target.value })}
                    placeholder="Jane"
                  />
                </Field>
                <Field label="Last name">
                  <input
                    type="text"
                    value={newGuest.last_name}
                    onChange={(e) => setNewGuest({ ...newGuest, last_name: e.target.value })}
                    placeholder="Smith"
                  />
                </Field>
              </div>
              <div style={{ maxWidth: 160 }}>
                <Field label="Quantity">
                  <input
                    type="number"
                    value={newGuest.quantity}
                    min={1}
                    max={50}
                    onChange={(e) =>
                      setNewGuest({ ...newGuest, quantity: Math.max(1, parseInt(e.target.value) || 1) })
                    }
                  />
                </Field>
              </div>
              <Button variant="primary" onClick={addGuest} disabled={saving}>
                {saving ? "Adding…" : "+ Add Guest"}
              </Button>
            </Card>

            <Card title="Artist assignments">
              {artistAssignments.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {artistAssignments.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        flexWrap: "wrap",
                        padding: "10px 12px",
                        borderRadius: "var(--lg-radius-sm)",
                        background: "rgba(255,255,255,0.045)",
                        border: "1px solid rgba(255,255,255,0.14)",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ color: "#fff", fontWeight: 650, fontSize: 13 }}>{a.artist_name}</span>
                        {a.artist_email && (
                          <span style={{ color: "rgba(255,255,255,0.34)", fontSize: 11, marginLeft: 8 }}>
                            ({a.artist_email})
                          </span>
                        )}
                        <span className="ui-rowstat" style={{ marginLeft: 10 }}>{a.comp_limit} comps</span>
                      </div>
                      <Button variant="danger" size="sm" onClick={() => removeAssignment(a.id)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {artistAssignments.length === 0 && (
                <p className="ui-intro" style={{ marginTop: 0 }}>No artists assigned to this event yet.</p>
              )}

              {allArtists.length > 0 ? (
                <>
                  {assignError && (
                    <p style={{ color: "var(--lg-bad)", fontSize: 12.5, marginBottom: 10 }}>{assignError}</p>
                  )}
                  <Field label="Artist">
                    <select value={assignArtistId} onChange={(e) => setAssignArtistId(e.target.value)}>
                      <option value="">Select artist…</option>
                      {allArtists.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.first_name} {a.last_name} ({a.email})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div style={{ maxWidth: 160 }}>
                    <Field label="Comp limit">
                      <input
                        type="number"
                        value={assignCompLimit}
                        min={1}
                        max={50}
                        onChange={(e) => setAssignCompLimit(Math.max(1, parseInt(e.target.value) || 4))}
                      />
                    </Field>
                  </div>
                  <Button variant="primary" onClick={handleAssign} disabled={assignSaving}>
                    {assignSaving ? "Assigning…" : "Assign Artist"}
                  </Button>
                </>
              ) : (
                <p className="ui-intro" style={{ marginTop: 0 }}>
                  No artist users found. Create artists from the <a href="/portal">Portal</a> page first.
                </p>
              )}
            </Card>
          </div>

          {guests.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Card title="Guest list" count={`${guests.length} ${guests.length === 1 ? "entry" : "entries"}`} flush>
                <DataTable columns={["Name", "Qty", ""]}>
                  {guests.map((g) => (
                    <tr key={g.id}>
                      <td>
                        {g.first_name} {g.last_name}
                      </td>
                      <td>{g.quantity}</td>
                      <td style={{ textAlign: "right" }}>
                        <Button variant="danger" size="sm" onClick={() => removeGuest(g.id)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Card>
            </div>
          )}
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
    </>
  );
}
