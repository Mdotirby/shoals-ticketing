"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";

const TABS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "events", label: "Events" },
  { key: "booking", label: "Booking" },
  { key: "partners", label: "Partners" },
  { key: "reports", label: "Reports" },
  { key: "sales", label: "Sales" },
  { key: "scanner", label: "Scanner" },
  { key: "guest_lists", label: "Guest Lists" },
  { key: "settlements", label: "Settlements" },
  { key: "contracts", label: "Contracts" },
  { key: "venue_management", label: "Venue Management" },
  { key: "onboarding", label: "Onboarding" },
];

const ROLES = [
  "owner",
  "venue_admin",
  "full_admin",
  "box_office",
  "read_only",
  "door_greeter",
  "artist",
] as const;

type Role = (typeof ROLES)[number];

// Default visibility per tab → roles (mirrors sidebarItems in admin/layout.tsx)
const DEFAULTS: Record<string, Role[]> = {
  dashboard: ["owner", "venue_admin", "full_admin", "read_only", "box_office", "door_greeter", "artist"],
  events: ["owner", "venue_admin", "full_admin"],
  booking: ["owner", "venue_admin"],
  partners: ["owner", "venue_admin"],
  reports: ["owner", "venue_admin", "full_admin", "read_only", "box_office"],
  sales: ["owner", "venue_admin", "full_admin", "box_office", "door_greeter", "artist"],
  scanner: ["owner", "venue_admin", "full_admin", "box_office", "door_greeter"],
  guest_lists: ["owner", "venue_admin", "full_admin", "artist"],
  settlements: ["owner", "venue_admin"],
  contracts: ["owner", "venue_admin"],
  venue_management: ["owner", "venue_admin"],
  onboarding: ["owner"],
};

type PermState = Record<string, Record<Role, boolean>>;

function buildDefaults(): PermState {
  const state: PermState = {};
  for (const tab of TABS) {
    state[tab.key] = {} as Record<Role, boolean>;
    for (const role of ROLES) {
      state[tab.key][role] = (DEFAULTS[tab.key] || []).includes(role);
    }
  }
  return state;
}

export default function PermissionsPage() {
  const [perms, setPerms] = useState<PermState>(buildDefaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [selectedRole, setSelectedRole] = useState<Role>("venue_admin");
  const [venueId, setVenueId] = useState<string | null>(getCookie("venue-id"));

  // Resolve venueId for owners/super_admins without a venue-id cookie
  useEffect(() => {
    const role = getCookie("user-role");
    if (!venueId && (role === "owner" || role === "super_admin")) {
      fetch("/api/venues")
        .then((r) => r.json())
        .then((venues) => {
          if (Array.isArray(venues) && venues.length > 0) {
            setVenueId(venues[0].id);
          } else {
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
    }
  }, [venueId]);

  // Load permissions once venueId is resolved — uses API to bypass RLS
  useEffect(() => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    // Load all roles' permissions for this venue
    Promise.all(
      ROLES.map((role) =>
        fetch(`/api/admin/sidebar-permissions?venue_id=${venueId}&role=${role}`)
          .then((r) => r.json())
          .then((data: { tab_key: string; visible: boolean }[]) =>
            Array.isArray(data) ? data.map((d) => ({ ...d, role })) : []
          )
      )
    )
      .then((results) => {
        const allRows = results.flat();
        if (allRows.length > 0) {
          setPerms((prev) => {
            const next = { ...prev };
            for (const row of allRows) {
              if (next[row.tab_key] && ROLES.includes(row.role as Role)) {
                next[row.tab_key] = { ...next[row.tab_key], [row.role]: row.visible };
              }
            }
            return next;
          });
        }
      })
      .finally(() => setLoading(false));
  }, [venueId]);

  const toggle = (tabKey: string) => {
    setPerms((prev) => ({
      ...prev,
      [tabKey]: { ...prev[tabKey], [selectedRole]: !prev[tabKey][selectedRole] },
    }));
  };

  const handleSave = async () => {
    if (!venueId) return;
    setSaving(true);
    setSaveMsg("");

    const rows: { venue_id: string; role: string; tab_key: string; visible: boolean }[] = [];

    // Build all permission rows for the selected role
    for (const tab of TABS) {
      rows.push({
        venue_id: venueId,
        role: selectedRole,
        tab_key: tab.key,
        visible: perms[tab.key][selectedRole],
      });
    }

    try {
      const res = await fetch("/api/admin/sidebar-permissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Save failed");
      }
      setSaveMsg("Permissions saved successfully.");
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Failed to save permissions.");
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(""), 3000);
  };

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Sidebar Permissions</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  if (!venueId) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Sidebar Permissions</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>No venue assigned to your account.</p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Sidebar Permissions</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saveMsg && (
            <span style={{ fontSize: 13, color: saveMsg.includes("Failed") ? "#ff9a9a" : "#7ddb7d" }}>
              {saveMsg}
            </span>
          )}
          <button
            className="admin-form-submit"
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "8px 20px" }}
          >
            {saving ? "Saving…" : "Save Permissions"}
          </button>
        </div>
      </div>

      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 20 }}>
        Select a role, then toggle which sidebar tabs are visible for that role.
      </p>

      {/* Role Selector Dropdown */}
      <div style={{ marginBottom: 24 }}>
        <label className="admin-form-label">
          Role
          <select
            className="admin-form-input"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as Role)}
            style={{ maxWidth: 280 }}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Single Column of Toggles */}
      <div style={{ maxWidth: 400 }}>
        {TABS.map((tab) => (
          <div
            key={tab.key}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 0",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span style={{ color: "#fff", fontWeight: 500, fontSize: 14 }}>{tab.label}</span>
            <button
              type="button"
              className={`toggle-switch ${perms[tab.key][selectedRole] ? "active" : ""}`}
              onClick={() => toggle(tab.key)}
              aria-label={`${tab.label} visible for ${selectedRole}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
