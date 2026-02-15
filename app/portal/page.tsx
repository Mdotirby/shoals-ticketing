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

export default function PortalPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");

  // Session manager — 90 min inactivity timeout
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

  // Fetch current user + admin list
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

      // Verify user is owner or super_admin
      const { data: adminRecord } = await supabase
        .from("admin_users")
        .select("role")
        .eq("id", user.id)
        .single() as { data: { role: string } | null; error: unknown };

      if (!adminRecord || (adminRecord.role !== "owner" && adminRecord.role !== "super_admin")) {
        router.push("/login");
        return;
      }

      // Fetch all admin users
      const { data: adminList } = await supabase
        .from("admin_users")
        .select("*")
        .order("created_at", { ascending: false });

      setAdmins(adminList || []);
      setLoading(false);
    }

    loadData();
  }, [supabase, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
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

          <div className="portal-card">
            <h2 className="portal-card-title">Admin Users</h2>
            <p className="portal-card-desc">
              Manage team members and their access roles.
            </p>

            {admins.length === 0 ? (
              <p className="portal-empty">No admin users found.</p>
            ) : (
              <div className="portal-table-wrapper">
                <table className="portal-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((admin) => (
                      <tr key={admin.id}>
                        <td>{admin.email}</td>
                        <td>
                          <span className={`portal-role-badge role-${admin.role}`}>
                            {admin.role}
                          </span>
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
          </div>

          <div className="portal-card">
            <h2 className="portal-card-title">Quick Links</h2>
            <div className="portal-quick-links">
              <a href="/admin" className="portal-quick-link">
                Admin Dashboard →
              </a>
              <a href="/admin/events/new" className="portal-quick-link">
                Create Event →
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
