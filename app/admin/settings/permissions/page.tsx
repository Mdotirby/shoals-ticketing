"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
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
  reports: ["owner", "venue_admin", "full_admin", "read_only", "box_office", "artist"],
  sales: ["owner", "venue_admin", "full_admin", "box_office", "door_greeter"],
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
  const [saving, setSaving] = useState<string | null>(null);
  const venueId = getCookie("venue-id");

  useEffect(() => {
    if (!venueId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowser();
    supabase
      .from("sidebar_permissions")
      .select("role, tab_key, visible")
      .eq("venue_id", venueId)
      .then(({ data }: { data: { role: string; tab_key: string; visible: boolean }[] | null }) => {
        if (data && data.length > 0) {
          setPerms((prev) => {
            const next = { ...prev };
            for (const row of data) {
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

  const toggle = async (tabKey: string, role: Role) => {
    if (!venueId) return;
    const newVal = !perms[tabKey][role];
    setPerms((prev) => ({
      ...prev,
      [tabKey]: { ...prev[tabKey], [role]: newVal },
    }));

    const cellKey = `${tabKey}-${role}`;
    setSaving(cellKey);

    const supabase = getSupabaseBrowser();
    await supabase.from("sidebar_permissions").upsert(
      {
        venue_id: venueId,
        role,
        tab_key: tabKey,
        visible: newVal,
      },
      { onConflict: "venue_id,role,tab_key" }
    );

    setSaving(null);
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
        <p style={{ color: "rgba(255,255,255,0.5)" }}>No venue assigned.</p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Sidebar Permissions</h1>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginBottom: 20 }}>
        Control which sidebar tabs are visible for each role.
      </p>

      <div className="report-table-wrapper">
        <table className="dash-table report-table" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", minWidth: 140 }}>Tab</th>
              {ROLES.map((r) => (
                <th key={r} style={{ textAlign: "center", minWidth: 90, textTransform: "capitalize" }}>
                  {r.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TABS.map((tab) => (
              <tr key={tab.key}>
                <td style={{ fontWeight: 600 }}>{tab.label}</td>
                {ROLES.map((role) => (
                  <td key={role} style={{ textAlign: "center" }}>
                    <button
                      type="button"
                      className={`toggle-switch ${perms[tab.key][role] ? "active" : ""}`}
                      onClick={() => toggle(tab.key, role)}
                      aria-label={`${tab.label} visible for ${role}`}
                      disabled={saving === `${tab.key}-${role}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
