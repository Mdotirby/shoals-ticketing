"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Venue = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  address_city: string | null;
  address_state: string | null;
  account_type: "own" | "client" | null;
};

export default function AdminVenuesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
  const [upcomingCounts, setUpcomingCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", account_type: "client" as "own" | "client" });

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/venues").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()).catch(() => []),
      fetch("/api/events?all=1").then((r) => r.json()).catch(() => []),
    ]).then(([venuesData, usersData, eventsData]) => {
      setVenues(Array.isArray(venuesData) ? venuesData : []);

      const staff: Record<string, number> = {};
      if (Array.isArray(usersData)) {
        for (const u of usersData) {
          if (u.venue_id) staff[u.venue_id] = (staff[u.venue_id] || 0) + 1;
        }
      }
      setStaffCounts(staff);

      const today = new Date().toISOString().slice(0, 10);
      const upcoming: Record<string, number> = {};
      if (Array.isArray(eventsData)) {
        for (const ev of eventsData) {
          if (ev.venue_id && ev.date >= today) {
            upcoming[ev.venue_id] = (upcoming[ev.venue_id] || 0) + 1;
          }
        }
      }
      setUpcomingCounts(upcoming);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleAdd = async () => {
    if (!form.name || !form.slug) return;
    setSaving(true);
    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      setShowAdd(false);
      setForm({ name: "", slug: "", account_type: "client" });
      load();
    }
  };

  const yours = venues.filter((v) => (v.account_type || "client") === "own");
  const clients = venues.filter((v) => (v.account_type || "client") === "client");

  const renderRow = (v: Venue) => (
    <div key={v.id} className="list-row">
      <div
        className="list-thumb"
        style={v.logo_url ? { backgroundImage: `url(${v.logo_url})` } : undefined}
      />
      <div className="list-body">
        <div className="list-title">{v.name}</div>
        <div className="list-meta">
          {[v.address_city, v.address_state].filter(Boolean).join(", ") || "—"}
        </div>
      </div>
      <div className="list-right">
        <div className="list-stat">
          <div className="n">{upcomingCounts[v.id] || 0}</div>
          <div className="l">Upcoming</div>
        </div>
        <div className="list-stat">
          <div className="n">{staffCounts[v.id] || 0}</div>
          <div className="l">Staff</div>
        </div>
        <div className="list-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => router.push(`/admin/venues/${v.id}/edit`)}>
            Manage
          </button>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return <div className="admin-form-page"><p style={{ color: "rgba(255,255,255,0.5)" }}>Loading venues…</p></div>;
  }

  return (
    <div className="admin-form-page">
      <div className="topbar">
        <div>
          <h1>Venues</h1>
          <p>Every venue running on this platform — yours, and any client venue you onboard.</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setShowAdd((s) => !s)}>
            + Add Venue
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="card">
          <div className="card-head"><h3>New Venue</h3></div>
          <div className="row-3">
            <div className="field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Slug</label>
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} />
            </div>
            <div className="field">
              <label>Type</label>
              <select value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value as "own" | "client" })}>
                <option value="client">Client venue</option>
                <option value="own">Your venue</option>
              </select>
            </div>
          </div>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={handleAdd}>
            {saving ? "Creating…" : "Create Venue"}
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-head"><h3>Your Venues</h3></div>
        {yours.length === 0 ? (
          <p className="card-sub">No venues marked as yours yet.</p>
        ) : (
          <div className="list-card">{yours.map(renderRow)}</div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>Client Venues</h3></div>
        {clients.length === 0 ? (
          <p className="card-sub">No client venues onboarded yet.</p>
        ) : (
          <div className="list-card">{clients.map(renderRow)}</div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>How This Scales</h3></div>
        <p className="card-sub">
          Onboarding a new venue means adding a row here, not standing up a new instance of the
          platform. Their staff get their own Roles &amp; Permissions setup, their own branded
          public site, and their own Command Center — while you keep one login with visibility
          across every venue you operate or support.
        </p>
      </div>
    </div>
  );
}
