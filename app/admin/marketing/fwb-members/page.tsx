"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

type FWBMember = {
  id: string;
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  current_tier: string;
  current_benefits_balance: number;
  lifetime_benefits_earned: number;
  current_streak_count: number;
  created_at: string;
};

const TIER_LABELS: Record<string, string> = {
  casual_friend: "Casual Friend",
  close_friend: "Close Friend",
  inner_circle: "Inner Circle",
  after_hours: "After Hours",
  ride_or_die: "Ride or Die",
};

const TIER_COLORS: Record<string, string> = {
  casual_friend: "#9ca3af",
  close_friend: "#60a5fa",
  inner_circle: "#a78bfa",
  after_hours: "#fbbf24",
  ride_or_die: "#f87171",
};

// ── Venue ID resolution (same as FWB hub) ────────────────────────────────────

let _resolvedVenueId: string | null = null;

async function resolveVenueId(): Promise<string> {
  const fromCookie = getCookie("venue-id");
  if (fromCookie) return fromCookie;

  if (_resolvedVenueId) return _resolvedVenueId;

  try {
    const supabase = getSupabaseBrowser();
    const { data: authData } = await supabase.auth.getUser();
    if (authData?.user) {
      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("venue_id")
        .eq("id", authData.user.id)
        .single();
      if (adminRecord?.venue_id) {
        _resolvedVenueId = adminRecord.venue_id;
        return _resolvedVenueId!;
      }
    }
  } catch {
    /* fallback below */
  }

  try {
    const res = await fetch("/api/venues");
    if (res.ok) {
      const venues = await res.json();
      if (Array.isArray(venues) && venues.length > 0) {
        _resolvedVenueId = venues[0].id;
        return _resolvedVenueId!;
      }
    }
  } catch {
    /* empty */
  }
  return "";
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowser();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token || "";
  const venueId = await resolveVenueId();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "x-venue-id": venueId,
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FWBMembersPage() {
  const [members, setMembers] = useState<FWBMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const role = getCookie("user-role");

  if (role !== "owner") {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          You do not have permission to view FWB members.
        </p>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    async function loadMembers() {
      setLoading(true);
      setError("");
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/fwb/admin/members", { headers });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to load members");
        }
        const data = await res.json();
        setMembers(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load members");
      } finally {
        setLoading(false);
      }
    }
    loadMembers();
  }, []);

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <div className="admin-form-page">
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Link
          href="/admin/marketing/fwb"
          style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}
        >
          ← FWB Loyalty Hub
        </Link>
      </div>

      <h1 className="admin-page-title">FWB Members</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        All loyalty program members for your venue. Sorted by signup date (newest first).
      </p>

      {error && <div className="admin-form-error">{error}</div>}

      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading members…</p>
      ) : members.length === 0 ? (
        <div
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 10,
            padding: 40,
            textAlign: "center",
          }}
        >
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 15 }}>
            No FWB members found for this venue.
          </p>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginTop: 8 }}>
            Members are created when newsletter subscribers are imported or when customers earn benefits.
          </p>
        </div>
      ) : (
        <>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 12 }}>
            {members.length} member{members.length !== 1 ? "s" : ""} total
          </p>

          <div
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <th style={thStyle}>Name</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Tier</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Balance</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Lifetime</th>
                    <th style={{ ...thStyle, textAlign: "right" }}>Streak</th>
                    <th style={thStyle}>Member Since</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <td style={tdStyle}>
                        {m.first_name || m.last_name
                          ? `${m.first_name || ""} ${m.last_name || ""}`.trim()
                          : "—"}
                      </td>
                      <td style={tdStyle}>{m.email || "—"}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                            color: TIER_COLORS[m.current_tier] || "#9ca3af",
                            background: `${TIER_COLORS[m.current_tier] || "#9ca3af"}22`,
                          }}
                        >
                          {TIER_LABELS[m.current_tier] || m.current_tier}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {m.current_benefits_balance.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {m.lifetime_benefits_earned.toLocaleString()}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {m.current_streak_count}
                      </td>
                      <td style={tdStyle}>{formatDate(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Table styles ─────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  textAlign: "left",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "rgba(255,255,255,0.4)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 14px",
  color: "rgba(255,255,255,0.75)",
  whiteSpace: "nowrap",
};
