"use client";

import { useState, useEffect } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import PDFPreviewModal from "@/app/components/admin/PDFPreviewModal";

type EventRow = {
  id: string;
  title: string;
  date: string;
  venue: string;
};

type GuestRow = {
  id: string;
  first_name: string;
  last_name: string;
  quantity: number;
  artist_id: string;
};

type PreviewState = {
  event: EventRow;
  rows: Array<{ name: string; quantity: number }>;
};

function slugDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function safeFilename(s: string) {
  return s.replace(/[^a-z0-9 ._-]/gi, "_").replace(/\s+/g, "_");
}

async function generateGuestListPDF(event: EventRow, rows: Array<{ name: string; quantity: number }>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const gold: [number, number, number] = [208, 194, 144];
  const dark: [number, number, number] = [11, 13, 29];
  const white: [number, number, number] = [255, 255, 255];

  // Background
  doc.setFillColor(...dark);
  doc.rect(0, 0, 216, 279, "F");

  // Header bar
  doc.setFillColor(...gold);
  doc.rect(0, 0, 216, 22, "F");

  doc.setTextColor(...dark);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(event.title, 14, 14);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`${event.venue}  ·  ${slugDate(event.date)}`, 14, 19);

  // Table header
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

  // Total
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

export default function GuestListsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [guestsByEvent, setGuestsByEvent] = useState<Record<string, GuestRow[]>>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) return;

      // Get venue_id for this organizer
      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("venue_id, role")
        .eq("id", authData.user.id)
        .single();

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

      // Fetch guest lists for all events
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
      setLoading(false);
    }
    load();
  }, []);

  const openPreview = (event: EventRow) => {
    const guests = guestsByEvent[event.id] || [];
    const rows = guests.map((g) => ({
      name: `${g.first_name} ${g.last_name}`,
      quantity: g.quantity,
    }));
    setPreview({ event, rows });
  };

  const downloadPDF = async () => {
    if (!preview) return;
    await generateGuestListPDF(preview.event, preview.rows);
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Guest Lists</h1>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}

      {!loading && events.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>No events found.</p>
      )}

      {!loading && events.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {events.map((event) => {
            const guests = guestsByEvent[event.id] || [];
            const totalGuests = guests.reduce((s, g) => s + g.quantity, 0);
            return (
              <div
                key={event.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 18px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 8,
                  flexWrap: "wrap",
                  gap: 10,
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
