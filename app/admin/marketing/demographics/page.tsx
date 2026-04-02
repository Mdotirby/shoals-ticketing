"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { getCookie } from "@/lib/cookies";
import Link from "next/link";
import Script from "next/script";

type EventOption = { id: string; title: string; date: string; venue_id: string | null };

type ZipData = { zip: string; count: number };
type HeatmapPoint = { lat: number; lng: number; weight: number; zip: string };

type DemoData = {
  zips: ZipData[];
  heatmapPoints: HeatmapPoint[];
  totalOrders: number;
  surveys: { age_range: Record<string, number>; gender: Record<string, number>; avg_rating: number; total: number };
};

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function DemographicsPage() {
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState("");
  const [data, setData] = useState<DemoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const heatmapLayerRef = useRef<any>(null);

  const role = getCookie("user-role");
  if (role !== "owner") {
    return <div className="admin-form-page"><h1 className="admin-page-title">Access Denied</h1></div>;
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "";

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

  // Initialize or update heatmap when data or maps SDK loads
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const renderHeatmap = useCallback(() => {
    const win = window as any;
    if (!mapsLoaded || !data?.heatmapPoints?.length || !mapRef.current || !win.google) return;

    // Dark mode map styles (matches VenueCore admin theme)
    const darkStyles: any[] = [
      { elementType: "geometry", stylers: [{ color: "#0b0d1d" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#0b0d1d" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#4a5568" }] },
      { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1a1f3a" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#131629" }] },
      { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1f3a" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#0e1225" }] },
      { featureType: "poi", stylers: [{ visibility: "off" }] },
      { featureType: "transit", stylers: [{ visibility: "off" }] },
    ];

    // Compute center from data points
    const avgLat = data.heatmapPoints.reduce((s, p) => s + p.lat, 0) / data.heatmapPoints.length;
    const avgLng = data.heatmapPoints.reduce((s, p) => s + p.lng, 0) / data.heatmapPoints.length;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new win.google.maps.Map(mapRef.current, {
        center: { lat: avgLat, lng: avgLng },
        zoom: 7,
        styles: darkStyles,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        backgroundColor: "#0b0d1d",
      });
    } else {
      mapInstanceRef.current.setCenter({ lat: avgLat, lng: avgLng });
    }

    // Build weighted heatmap data
    const heatmapData = data.heatmapPoints.map((p) =>
      ({ location: new win.google.maps.LatLng(p.lat, p.lng), weight: p.weight })
    );

    // Remove old layer
    if (heatmapLayerRef.current) {
      heatmapLayerRef.current.setMap(null);
    }

    // Create heatmap with Snapchat-style gradient (red/orange glow)
    heatmapLayerRef.current = new win.google.maps.visualization.HeatmapLayer({
      data: heatmapData,
      map: mapInstanceRef.current,
      radius: 40,
      opacity: 0.8,
      gradient: [
        "rgba(0, 0, 0, 0)",
        "rgba(30, 60, 180, 0.4)",
        "rgba(50, 100, 220, 0.5)",
        "rgba(80, 160, 250, 0.6)",
        "rgba(100, 200, 255, 0.7)",
        "rgba(180, 220, 100, 0.7)",
        "rgba(255, 220, 50, 0.8)",
        "rgba(255, 160, 30, 0.85)",
        "rgba(255, 80, 20, 0.9)",
        "rgba(255, 30, 10, 0.95)",
        "rgba(220, 0, 0, 1)",
      ],
    });
  }, [mapsLoaded, data]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => { renderHeatmap(); }, [renderHeatmap]);

  // Google Maps callback
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    (window as any).initDemoMap = () => setMapsLoaded(true);
    // If already loaded from a previous page visit
    if ((window as any).google?.maps?.visualization) setMapsLoaded(true);
  }, []);

  const maxZipCount = data?.zips?.length ? Math.max(...data.zips.map((z) => z.count)) : 0;

  return (
    <div className="admin-form-page">
      {/* Load Google Maps JS API with Visualization library */}
      {apiKey && !mapsLoaded && (
        <Script
          src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=visualization&callback=initDemoMap`}
          strategy="lazyOnload"
        />
      )}

      <Link href="/admin/marketing" style={{ color: "rgba(96,165,250,0.7)", textDecoration: "none", fontSize: 13 }}>← Marketing Hub</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Demographics & Heatmaps</h1>

      {!apiKey && (
        <div style={{ background: "rgba(255,180,50,0.08)", border: "1px solid rgba(255,180,50,0.2)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <p style={{ color: "#ffb432", fontSize: 13, margin: 0 }}>
            Set <code style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4 }}>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in Vercel env vars to enable the interactive heatmap.
            The bar chart view still works without it.
          </p>
        </div>
      )}

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

          {/* Google Maps Heatmap */}
          {data.heatmapPoints.length > 0 && apiKey && (
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              overflow: "hidden",
              marginBottom: 24,
            }}>
              <div style={{ padding: "16px 20px 8px" }}>
                <h3 style={{ color: "#60a5fa", fontSize: 14, margin: 0, fontWeight: 600 }}>
                  Buyer Location Heatmap
                </h3>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "4px 0 0" }}>
                  {data.heatmapPoints.length} zip code{data.heatmapPoints.length !== 1 ? "s" : ""} · {data.totalOrders} orders · Hotter = more buyers
                </p>
              </div>
              <div
                ref={mapRef}
                style={{
                  width: "100%",
                  height: 480,
                  background: "#0b0d1d",
                }}
              />
            </div>
          )}

          {/* Zip Code Bar Chart (always shown as reference / fallback) */}
          {data.zips.length > 0 && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <h3 style={{ color: "#60a5fa", fontSize: 14, margin: "0 0 4px", fontWeight: 600 }}>Ticket Buyers by Zip Code</h3>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "0 0 16px" }}>
                Top {Math.min(data.zips.length, 20)} zip codes
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
                        background: `linear-gradient(90deg, rgba(255,80,20,0.3), rgba(255,80,20,${0.3 + (pct / 100) * 0.6}))`,
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
