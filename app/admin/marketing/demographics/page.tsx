"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";

type EventOption = { id: string; title: string; date: string; venue_id: string | null };

type ZipData = { zip: string; count: number };

type DemoData = {
  zips: ZipData[];
  totalOrders: number;
  surveys: { age_range: Record<string, number>; gender: Record<string, number>; avg_rating: number; total: number };
};

export default function DemographicsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [data, setData] = useState<DemoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    fetch("/api/events?all=1")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d)) setEvents(d); })
      .finally(() => setEventsLoading(false));
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!selectedEvent) { setData(null); return; }
    setLoading(true);
    fetch(`/api/marketing/demographics?event_id=${selectedEvent}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedEvent]);

  const maxZipCount = data?.zips?.length ? Math.max(...data.zips.map((z) => z.count)) : 0;

  return (
    <div className="admin-form-page">
      <Link href="/admin/marketing" style={{ color: "rgba(96,165,250,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Demographics & Heatmaps</h1>

      {/* Event selector */}
      <label className="admin-form-label" style={{ maxWidth: 400, marginBottom: 24 }}>
        Select an Event
        <select className="admin-form-input" value={selectedEvent} onChange={(e) => setSelectedEvent(e.target.value)}>
          <option value="">— Choose an event —</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.date).toLocaleDateString()})</option>
          ))}
        </select>
      </label>

      {eventsLoading && <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading events...</p>}

      {!selectedEvent && !eventsLoading && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>Select an event to view demographic and location data.</p>
      )}

      {loading && <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading demographics...</p>}

      {data && !loading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <StatCard label="Total Orders" value={data.totalOrders.toString()} />
            <StatCard label="Unique Zip Codes" value={data.zips.length.toString()} />
            <StatCard label="Survey Responses" value={data.surveys.total.toString()} />
            {data.surveys.avg_rating > 0 && <StatCard label="Avg Rating" value={`${data.surveys.avg_rating.toFixed(1)} / 5`} />}
          </div>

          {/* Zip Code Heatmap (bar representation — replace with Mapbox when key is configured) */}
          {data.zips.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h3 style={{ color: "#60a5fa", fontSize: 14, margin: "0 0 4px", fontWeight: 600 }}>Ticket Buyer Locations (by Zip Code)</h3>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "0 0 16px" }}>
                Top {Math.min(data.zips.length, 20)} zip codes · Full heatmap available with Mapbox integration
              </p>
              {data.zips.slice(0, 20).map((z) => {
                const pct = maxZipCount > 0 ? (z.count / maxZipCount) * 100 : 0;
                return (
                  <div key={z.zip} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 70, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", fontFamily: "monospace" }}>{z.zip}</span>
                    <div style={{ flex: 1, height: 20, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{
                        width: `${Math.max(pct, 2)}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, rgba(96,165,250,0.3), rgba(96,165,250,${0.3 + (pct / 100) * 0.6}))`,
                        borderRadius: 4,
                      }} />
                    </div>
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", minWidth: 30, textAlign: "right" }}>{z.count}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Survey Demographics */}
          {data.surveys.total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
              {/* Age Range */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: "#60a5fa", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Age Range</h3>
                {Object.entries(data.surveys.age_range).map(([range, count]) => {
                  const pct = data.surveys.total > 0 ? (count / data.surveys.total) * 100 : 0;
                  return (
                    <div key={range} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 50, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{range}</span>
                      <div style={{ flex: 1, height: 16, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "rgba(100,149,237,0.4)", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", minWidth: 40, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>

              {/* Gender */}
              <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20 }}>
                <h3 style={{ color: "#60a5fa", fontSize: 14, margin: "0 0 12px", fontWeight: 600 }}>Gender</h3>
                {Object.entries(data.surveys.gender).map(([g, count]) => {
                  const pct = data.surveys.total > 0 ? (count / data.surveys.total) * 100 : 0;
                  const label = g === "non_binary" ? "Non-binary" : g === "prefer_not_to_say" ? "Prefer not to say" : g.charAt(0).toUpperCase() + g.slice(1);
                  return (
                    <div key={g} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 120, fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{label}</span>
                      <div style={{ flex: 1, height: 16, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "rgba(96,165,250,0.4)", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", minWidth: 40, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {data.zips.length === 0 && data.surveys.total === 0 && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 24, textAlign: "center" }}>
              <p style={{ color: "rgba(255,255,255,0.4)", margin: 0 }}>
                No demographic data for this event yet. Zip codes populate from orders, and demographics from post-show surveys.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#60a5fa" }}>{value}</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{label}</div>
    </div>
  );
}
