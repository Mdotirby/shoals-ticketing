"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { startSessionManager, touchActivity } from "@/lib/sessionManager";
import Footer from "@/app/components/Footer";

type AdminUser = {
  id: string;
  email: string;
  role: string;
  venue_id: string | null;
  created_at: string;
};

type Venue = {
  id: string;
  name: string;
  slug: string;
};

const ROLES = ["owner", "super_admin", "venue_admin", "promoter", "full_admin", "box_office"];

export default function PortalPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  // New admin form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("venue_admin");
  const [newVenueId, setNewVenueId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // New venue form
  const [venueName, setVenueName] = useState("");
  const [venueSlug, setVenueSlug] = useState("");
  const [creatingVenue, setCreatingVenue] = useState(false);
  const [venueError, setVenueError] = useState("");

  // Session manager
  useEffect(() => {
    const cleanup = startSessionManager({
      onExpire: async () => {
        await supabase.auth.signOut();
        router.push("/login");
      },
      refreshSession: async () => {
        await supabase.auth.refreshSession();
      },
    });
    return cleanup;
  }, [supabase, router]);

  // Load data
  useEffect(() => {
    async function loadData() {
      touchActivity();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      setUserEmail(user.email || "");

      // Verify owner/super_admin
      const { data: adminRecord } = (await supabase
        .from("admin_users")
        .select("role")
        .eq("id", user.id)
        .single()) as { data: { role: string } | null; error: unknown };

      if (
        !adminRecord ||
        (adminRecord.role !== "owner" && adminRecord.role !== "super_admin")
      ) {
        router.push("/login");
        return;
      }

      // Fetch admin users + venues in parallel
      const [usersRes, venuesRes] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/venues").then((r) => r.json()),
      ]);

      if (Array.isArray(usersRes)) setAdmins(usersRes);
      if (Array.isArray(venuesRes)) setVenues(venuesRes);
      setLoading(false);
    }

    loadData();
  }, [supabase, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    document.cookie = "venue-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/login");
  };

  // ── Create Admin User ──
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          venue_id: newVenueId || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create user");
      }

      const newUser = await res.json();
      setAdmins((prev) => [newUser, ...prev]);
      setNewEmail("");
      setNewPassword("");
      setNewRole("venue_admin");
      setNewVenueId("");
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  // ── Update Admin User (venue or role) ──
  const handleUpdateUser = async (
    userId: string,
    field: "venue_id" | "role",
    value: string
  ) => {
    const res = await fetch("/api/admin/users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, [field]: value || null }),
    });

    if (res.ok) {
      const updated = await res.json();
      setAdmins((prev) =>
        prev.map((a) => (a.id === userId ? { ...a, ...updated } : a))
      );
    }
  };

  // ── Create Venue ──
  const handleCreateVenue = async (e: React.FormEvent) => {
    e.preventDefault();
    setVenueError("");
    setCreatingVenue(true);

    try {
      const res = await fetch("/api/venues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: venueName, slug: venueSlug }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create venue");
      }

      const newVenue = await res.json();
      setVenues((prev) => [...prev, newVenue]);
      setVenueName("");
      setVenueSlug("");
    } catch (err: unknown) {
      setVenueError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreatingVenue(false);
    }
  };

  const getVenueName = (venueId: string | null) => {
    if (!venueId) return "—";
    return venues.find((v) => v.id === venueId)?.name || "Unknown";
  };

  if (loading) {
    return (
      <main className="ticket-page">
        <div className="ticket-page-loading">Loading portal…</div>
      </main>
    );
  }

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">Owner Portal</h1>
        </section>

        <section className="portal-section">
          <div className="portal-header">
            <p className="portal-welcome">
              Signed in as <strong>{userEmail}</strong>
            </p>
            <button
              type="button"
              className="portal-signout-btn"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </div>

          {/* ── Venues Management ── */}
          <div className="portal-card">
            <h2 className="portal-card-title">Venues</h2>
            <p className="portal-card-desc">
              Each venue gets a subdomain (e.g., renshoals.venuecore.live).
            </p>

            {venues.length > 0 && (
              <div className="portal-table-wrapper">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Subdomain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venues.map((v) => (
                      <tr key={v.id}>
                        <td>{v.name}</td>
                        <td>
                          <code className="portal-slug">{v.slug}.venuecore.live</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form className="portal-inline-form" onSubmit={handleCreateVenue}>
              {venueError && (
                <div className="portal-form-error">{venueError}</div>
              )}
              <input
                type="text"
                className="portal-form-input"
                placeholder="Venue name"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                required
              />
              <input
                type="text"
                className="portal-form-input"
                placeholder="subdomain-slug"
                value={venueSlug}
                onChange={(e) =>
                  setVenueSlug(
                    e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                  )
                }
                required
              />
              <button
                type="submit"
                className="portal-form-submit"
                disabled={creatingVenue}
              >
                {creatingVenue ? "Creating…" : "+ Add Venue"}
              </button>
            </form>
          </div>

          {/* ── Admin Users ── */}
          <div className="portal-card">
            <h2 className="portal-card-title">Admin Users</h2>
            <p className="portal-card-desc">
              Assign roles and venues. Venue admins only see events for their assigned venue.
            </p>

            {admins.length > 0 && (
              <div className="portal-table-wrapper">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Venue</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin.id}>
                        <td>{admin.email}</td>
                        <td>
                          <select
                            className="portal-inline-select"
                            value={admin.role}
                            onChange={(e) =>
                              handleUpdateUser(admin.id, "role", e.target.value)
                            }
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            className="portal-inline-select"
                            value={admin.venue_id || ""}
                            onChange={(e) =>
                              handleUpdateUser(
                                admin.id,
                                "venue_id",
                                e.target.value
                              )
                            }
                          >
                            <option value="">— None (global) —</option>
                            {venues.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {new Date(admin.created_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form className="portal-inline-form" onSubmit={handleCreateUser}>
              <h3 className="portal-form-heading">Add New Admin</h3>
              {createError && (
                <div className="portal-form-error">{createError}</div>
              )}
              <input
                type="email"
                className="portal-form-input"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
              />
              <input
                type="password"
                className="portal-form-input"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
              <select
                className="portal-form-input"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <select
                className="portal-form-input"
                value={newVenueId}
                onChange={(e) => setNewVenueId(e.target.value)}
              >
                <option value="">— No venue (global) —</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="portal-form-submit"
                disabled={creating}
              >
                {creating ? "Creating…" : "+ Create Admin"}
              </button>
            </form>
          </div>

          <div className="portal-card">
            <h2 className="portal-card-title">Quick Links</h2>
            <div className="portal-quick-links">
              <a href="/admin" className="portal-quick-link">
                Admin Dashboard →
              </a>
              <a href="/admin/events" className="portal-quick-link">
                Manage Events →
              </a>
              <a href="/admin/scan" className="portal-quick-link">
                Ticket Scanner →
              </a>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
