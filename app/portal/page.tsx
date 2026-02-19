"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { startSessionManager, touchActivity } from "@/lib/sessionManager";
import { getCookie } from "@/lib/cookies";
import Footer from "@/app/components/Footer";

type AdminUser = { id: string; email: string; role: string; venue_id: string | null; first_name: string | null; last_name: string | null; created_at: string };
type Venue = { id: string; name: string; slug: string; nickname?: string; capacity?: number; address_street?: string; address_city?: string; address_state?: string; address_zip?: string; buyer_name?: string; contract_signatory?: string; buyer_phone?: string; buyer_email?: string; promoter_address?: string; primary_color?: string; secondary_color?: string; accent_color?: string };

const VENUE_ADMIN_ROLES = [
  { value: "venue_admin", label: "Venue Admin" },
  { value: "read_only", label: "Read Only" },
  { value: "box_office", label: "Box Office" },
  { value: "door_greeter", label: "Door Greeter" },
];
const OWNER_ROLES = ["owner", "super_admin", "venue_admin", "read_only", "box_office", "door_greeter"];

export default function PortalPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowser();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  const [userVenueId, setUserVenueId] = useState("");
  const [myVenue, setMyVenue] = useState<Venue | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");

  // Venue settings form (venue_admin)
  const [venueForm, setVenueForm] = useState({ name: "", nickname: "", capacity: "", address_street: "", address_city: "", address_state: "", address_zip: "", buyer_name: "", contract_signatory: "", buyer_phone: "", buyer_email: "", promoter_address: "", default_radius_distance: "", default_radius_days_prior: "", default_radius_days_after: "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // Owner buyer info (stored on admin_users)
  const [ownerBuyer, setOwnerBuyer] = useState({ buyer_name: "", contract_signatory: "", buyer_phone: "", buyer_email: "", promoter_address: "" });

  // Owner global offer defaults
  const [ownerDefaults, setOwnerDefaults] = useState({ default_radius_distance: "", default_radius_days_prior: "", default_radius_days_after: "", default_ticketing_fee: "3.00" });

  // New admin form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("read_only");
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newVenueId, setNewVenueId] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    const cleanup = startSessionManager({
      onExpire: async () => { await supabase.auth.signOut(); router.push("/login"); },
      refreshSession: async () => { await supabase.auth.refreshSession(); },
    });
    return cleanup;
  }, [supabase, router]);

  useEffect(() => {
    async function loadData() {
      touchActivity();
      const { data } = await supabase.auth.getUser();
      if (!data?.user) { router.push("/login"); return; }
      setUserEmail(data.user.email || "");
      const role = getCookie("user-role") || "";
      const venueId = getCookie("venue-id") || "";
      setUserRole(role);
      setUserVenueId(venueId);
      if (!["owner", "super_admin", "venue_admin"].includes(role)) { router.push("/admin"); return; }

      const [usersRes, venuesRes] = await Promise.all([
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/venues").then((r) => r.json()),
      ]);

      if (Array.isArray(venuesRes)) {
        setVenues(venuesRes);
        if (role === "venue_admin" && venueId) {
          const v = venuesRes.find((x: Venue) => x.id === venueId);
          if (v) {
            setMyVenue(v);
            setVenueForm({
              name: v.name || "", nickname: v.nickname || "", capacity: v.capacity ? String(v.capacity) : "",
              address_street: v.address_street || "", address_city: v.address_city || "",
              address_state: v.address_state || "", address_zip: v.address_zip || "",
              buyer_name: v.buyer_name || "", contract_signatory: v.contract_signatory || "",
              buyer_phone: v.buyer_phone || "", buyer_email: v.buyer_email || "",
              promoter_address: v.promoter_address || "",
              default_radius_distance: v.default_radius_distance || "", default_radius_days_prior: v.default_radius_days_prior ? String(v.default_radius_days_prior) : "", default_radius_days_after: v.default_radius_days_after ? String(v.default_radius_days_after) : "",
            });
          }
        }
      }
      if (Array.isArray(usersRes)) {
        setAdmins(role === "venue_admin" && venueId ? usersRes.filter((u: AdminUser) => u.venue_id === venueId) : usersRes);
        // Load owner's buyer info + global defaults from admin_users record
        if (role === "owner" || role === "super_admin") {
          const me = usersRes.find((u: AdminUser) => u.email === data.user!.email);
          if (me) {
            const r = me as Record<string, string>;
            setCurrentUserId(me.id);
            setOwnerBuyer({
              buyer_name: r.buyer_name || "",
              contract_signatory: r.contract_signatory || "",
              buyer_phone: r.buyer_phone || "",
              buyer_email: r.buyer_email || "",
              promoter_address: r.promoter_address || "",
            });
            setOwnerDefaults({
              default_radius_distance: r.default_radius_distance || "",
              default_radius_days_prior: r.default_radius_days_prior || "",
              default_radius_days_after: r.default_radius_days_after || "",
              default_ticketing_fee: r.default_ticketing_fee || "3.00",
            });
          }
        }
      }
      setLoading(false);
    }
    loadData();
  }, [supabase, router]);

  const isOwner = userRole === "owner" || userRole === "super_admin";

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    document.cookie = "venue-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "user-role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    document.cookie = "user-name=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/login");
  };

  const handleSaveVenue = async () => {
    if (!myVenue) return;
    setSaving(true); setSaveMsg("");
    try {
      const res = await fetch("/api/venues", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: myVenue.id, name: venueForm.name, nickname: venueForm.nickname || null,
          capacity: venueForm.capacity ? parseInt(venueForm.capacity) : null,
          address_street: venueForm.address_street || null, address_city: venueForm.address_city || null,
          address_state: venueForm.address_state || null, address_zip: venueForm.address_zip || null,
          buyer_name: venueForm.buyer_name || null, contract_signatory: venueForm.contract_signatory || null,
          buyer_phone: venueForm.buyer_phone || null, buyer_email: venueForm.buyer_email || null,
          promoter_address: venueForm.promoter_address || null,
         default_radius_distance: venueForm.default_radius_distance || null,
          default_radius_days_prior: venueForm.default_radius_days_prior ? parseInt(venueForm.default_radius_days_prior) : null,
          default_radius_days_after: venueForm.default_radius_days_after ? parseInt(venueForm.default_radius_days_after) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaveMsg("Settings saved.");
    } catch { setSaveMsg("Save failed."); }
    finally { setSaving(false); }
  };

  const handleSaveOwnerBuyer = async () => {
    if (!currentUserId) return;
    setSaving(true); setSaveMsg("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentUserId, ...ownerBuyer }),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveMsg("Buyer info saved.");
    } catch { setSaveMsg("Save failed."); }
    finally { setSaving(false); }
  };

  const handleSaveDefaults = async () => {
    if (!currentUserId) return;
    setSaving(true); setSaveMsg("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentUserId,
          default_radius_distance: ownerDefaults.default_radius_distance || null,
          default_radius_days_prior: ownerDefaults.default_radius_days_prior ? parseInt(ownerDefaults.default_radius_days_prior) : null,
          default_radius_days_after: ownerDefaults.default_radius_days_after ? parseInt(ownerDefaults.default_radius_days_after) : null,
          default_ticketing_fee: ownerDefaults.default_ticketing_fee ? parseFloat(ownerDefaults.default_ticketing_fee) : 3.00,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setSaveMsg("Defaults saved.");
    } catch { setSaveMsg("Save failed."); }
    finally { setSaving(false); }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault(); setCreateError(""); setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail, password: newPassword, role: newRole,
          venue_id: isOwner ? (newVenueId || null) : userVenueId,
          first_name: newFirstName || null, last_name: newLastName || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      const newUser = await res.json();
      setAdmins((p) => [newUser, ...p]);
      setNewEmail(""); setNewPassword(""); setNewRole("read_only"); setNewFirstName(""); setNewLastName(""); setNewVenueId("");
    } catch (err: unknown) { setCreateError(err instanceof Error ? err.message : "Failed"); }
    finally { setCreating(false); }
  };

  const handleUpdateUser = async (userId: string, field: string, value: string) => {
    const res = await fetch("/api/admin/users", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: userId, [field]: value || null }),
    });
    if (res.ok) { const u = await res.json(); setAdmins((p) => p.map((a) => a.id === userId ? { ...a, ...u } : a)); }
  };

  if (loading) return <main className="ticket-page"><div className="ticket-page-loading">Loading…</div></main>;

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">
            {isOwner ? "Venue Management" : "Manage My Venue"}
          </h1>
        </section>

        <section className="portal-section">
          <div className="portal-header">
            <p className="portal-welcome">Signed in as <strong>{userEmail}</strong></p>
            <div style={{ display: "flex", gap: 10 }}>
              <a href="/admin" className="admin-header-btn">← Dashboard</a>
              <button type="button" className="portal-signout-btn" onClick={handleSignOut}>Sign Out</button>
            </div>
          </div>

          {/* ── Venue Settings (venue_admin only) ── */}
          {!isOwner && myVenue && (
            <div className="portal-card">
              <h2 className="portal-card-title">Venue Information</h2>
              <div className="admin-form-grid" style={{ marginTop: 12 }}>
                <label className="admin-form-label">Name<input type="text" className="admin-form-input" value={venueForm.name} onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })} /></label>
                <label className="admin-form-label">Nickname<input type="text" className="admin-form-input" value={venueForm.nickname} onChange={(e) => setVenueForm({ ...venueForm, nickname: e.target.value })} /></label>
                <label className="admin-form-label">Capacity<input type="number" className="admin-form-input" value={venueForm.capacity} onChange={(e) => setVenueForm({ ...venueForm, capacity: e.target.value })} /></label>
                <label className="admin-form-label">Street<input type="text" className="admin-form-input" value={venueForm.address_street} onChange={(e) => setVenueForm({ ...venueForm, address_street: e.target.value })} /></label>
                <label className="admin-form-label">City<input type="text" className="admin-form-input" value={venueForm.address_city} onChange={(e) => setVenueForm({ ...venueForm, address_city: e.target.value })} /></label>
                <label className="admin-form-label">State<input type="text" className="admin-form-input" value={venueForm.address_state} onChange={(e) => setVenueForm({ ...venueForm, address_state: e.target.value })} maxLength={2} /></label>
                <label className="admin-form-label">ZIP<input type="text" className="admin-form-input" value={venueForm.address_zip} onChange={(e) => setVenueForm({ ...venueForm, address_zip: e.target.value })} /></label>
              </div>

              <h3 className="portal-form-heading" style={{ marginTop: 16 }}>Buyer / Promoter Info</h3>
              <div className="admin-form-grid" style={{ marginTop: 8 }}>
                <label className="admin-form-label">Buyer Name<input type="text" className="admin-form-input" placeholder="e.g. Acme Entertainment LLC" value={venueForm.buyer_name} onChange={(e) => setVenueForm({ ...venueForm, buyer_name: e.target.value })} /></label>
                <label className="admin-form-label">Signatory<input type="text" className="admin-form-input" placeholder="e.g. Jane Smith" value={venueForm.contract_signatory} onChange={(e) => setVenueForm({ ...venueForm, contract_signatory: e.target.value })} /></label>
                <label className="admin-form-label">Phone<input type="tel" className="admin-form-input" placeholder="e.g. 555-123-4567" value={venueForm.buyer_phone} onChange={(e) => setVenueForm({ ...venueForm, buyer_phone: e.target.value })} /></label>
                <label className="admin-form-label">Email<input type="email" className="admin-form-input" placeholder="e.g. booking@company.com" value={venueForm.buyer_email} onChange={(e) => setVenueForm({ ...venueForm, buyer_email: e.target.value })} /></label>
                <label className="admin-form-label admin-form-full">Promoter Address<input type="text" className="admin-form-input" placeholder="e.g. 123 Main St, Nashville, TN 37201" value={venueForm.promoter_address} onChange={(e) => setVenueForm({ ...venueForm, promoter_address: e.target.value })} /></label>
              </div>

              <h3 className="portal-form-heading" style={{ marginTop: 16 }}>Offer Defaults</h3>
              <p className="portal-card-desc" style={{ margin: "4px 0 8px", fontSize: 12 }}>Override global radius defaults for your venue. Leave blank to use platform defaults.</p>
              <div className="admin-form-grid" style={{ marginTop: 4 }}>
                <label className="admin-form-label">Radius (mi)<input type="text" className="admin-form-input" placeholder="e.g. 150" value={venueForm.default_radius_distance} onChange={(e) => setVenueForm({ ...venueForm, default_radius_distance: e.target.value })} /></label>
                <label className="admin-form-label">Days Prior<input type="number" className="admin-form-input" placeholder="e.g. 60" value={venueForm.default_radius_days_prior} onChange={(e) => setVenueForm({ ...venueForm, default_radius_days_prior: e.target.value })} /></label>
                <label className="admin-form-label">Days After<input type="number" className="admin-form-input" placeholder="e.g. 60" value={venueForm.default_radius_days_after} onChange={(e) => setVenueForm({ ...venueForm, default_radius_days_after: e.target.value })} /></label>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
                <button className="portal-form-submit" onClick={handleSaveVenue} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</button>
                {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes("fail") ? "#ff9a9a" : "#7ddb7d" }}>{saveMsg}</span>}
              </div>
            </div>
          )}

          {/* ── Venues Table (owner only) ── */}
          {isOwner && venues.length > 0 && (
            <div className="portal-card">
              <h2 className="portal-card-title">All Venues</h2>
              <div className="portal-table-wrapper">
                <table className="portal-table">
                  <thead><tr><th>Name</th><th>Subdomain</th><th>Capacity</th><th></th></tr></thead>
                  <tbody>
                    {venues.map((v) => (
                      <tr key={v.id}>
                        <td>{v.name}</td>
                        <td><code className="portal-slug">{v.slug}.venuecore.live</code></td>
                        <td>{v.capacity || "—"}</td>
                        <td><a href={`/admin/venues/${v.id}/edit`} className="admin-sponsor-edit-btn">Edit</a></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Owner Buyer/Promoter Info ── */}
          {isOwner && (
            <div className="portal-card">
              <h2 className="portal-card-title">My Buyer / Promoter Info</h2>
              <p className="portal-card-desc">Your buyer info used on offer sheets when no venue is assigned.</p>
              <div className="admin-form-grid" style={{ marginTop: 8 }}>
                <label className="admin-form-label">Buyer Name<input type="text" className="admin-form-input" placeholder="e.g. Acme Entertainment LLC" value={ownerBuyer.buyer_name} onChange={(e) => setOwnerBuyer({ ...ownerBuyer, buyer_name: e.target.value })} /></label>
                <label className="admin-form-label">Contract Signatory<input type="text" className="admin-form-input" placeholder="e.g. Jane Smith" value={ownerBuyer.contract_signatory} onChange={(e) => setOwnerBuyer({ ...ownerBuyer, contract_signatory: e.target.value })} /></label>
                <label className="admin-form-label">Phone<input type="tel" className="admin-form-input" placeholder="e.g. 555-123-4567" value={ownerBuyer.buyer_phone} onChange={(e) => setOwnerBuyer({ ...ownerBuyer, buyer_phone: e.target.value })} /></label>
                <label className="admin-form-label">Email<input type="email" className="admin-form-input" placeholder="e.g. booking@company.com" value={ownerBuyer.buyer_email} onChange={(e) => setOwnerBuyer({ ...ownerBuyer, buyer_email: e.target.value })} /></label>
                <label className="admin-form-label admin-form-full">Promoter Address<input type="text" className="admin-form-input" placeholder="e.g. 123 Main St, Nashville, TN 37201" value={ownerBuyer.promoter_address} onChange={(e) => setOwnerBuyer({ ...ownerBuyer, promoter_address: e.target.value })} /></label>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
                <button className="portal-form-submit" onClick={handleSaveOwnerBuyer} disabled={saving}>{saving ? "Saving…" : "Save Buyer Info"}</button>
                {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes("fail") ? "#ff9a9a" : "#7ddb7d" }}>{saveMsg}</span>}
              </div>
            </div>
          )}

          {/* ── Global Offer Defaults (owner only) ── */}
          {isOwner && (
            <div className="portal-card">
              <h2 className="portal-card-title">Global Offer Defaults</h2>
              <p className="portal-card-desc">These defaults auto-fill on every new offer for all venues.</p>
              <div className="admin-form-grid" style={{ marginTop: 8 }}>
                <label className="admin-form-label">Default Radius (mi)<input type="text" className="admin-form-input" placeholder="e.g. 150" value={ownerDefaults.default_radius_distance} onChange={(e) => setOwnerDefaults({ ...ownerDefaults, default_radius_distance: e.target.value })} /></label>
                <label className="admin-form-label">Days Prior<input type="number" className="admin-form-input" placeholder="e.g. 60" value={ownerDefaults.default_radius_days_prior} onChange={(e) => setOwnerDefaults({ ...ownerDefaults, default_radius_days_prior: e.target.value })} /></label>
                <label className="admin-form-label">Days After<input type="number" className="admin-form-input" placeholder="e.g. 60" value={ownerDefaults.default_radius_days_after} onChange={(e) => setOwnerDefaults({ ...ownerDefaults, default_radius_days_after: e.target.value })} /></label>
                <label className="admin-form-label">Default Ticketing Fee ($)<input type="number" className="admin-form-input" placeholder="3.00" value={ownerDefaults.default_ticketing_fee} onChange={(e) => setOwnerDefaults({ ...ownerDefaults, default_ticketing_fee: e.target.value })} step="0.01" /></label>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
                <button className="portal-form-submit" onClick={handleSaveDefaults} disabled={saving}>{saving ? "Saving…" : "Save Defaults"}</button>
                {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes("fail") ? "#ff9a9a" : "#7ddb7d" }}>{saveMsg}</span>}
              </div>
            </div>
          )}

          {/* ── Team Members ── */}
          <div className="portal-card">
            <h2 className="portal-card-title">Team Members</h2>
            {admins.length > 0 && (
              <div className="portal-table-wrapper">
                <table className="portal-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th>{isOwner && <th>Venue</th>}<th>Created</th></tr></thead>
                  <tbody>
                    {admins.map((a) => (
                      <tr key={a.id}>
                        <td>{[a.first_name, a.last_name].filter(Boolean).join(" ") || "—"}</td>
                        <td>{a.email}</td>
                        <td>
                          {isOwner ? (
                            <select className="portal-inline-select" value={a.role} onChange={(e) => handleUpdateUser(a.id, "role", e.target.value)}>
                              {OWNER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                            </select>
                          ) : (
                            <select className="portal-inline-select" value={a.role} onChange={(e) => handleUpdateUser(a.id, "role", e.target.value)} disabled={a.role === "owner"}>
                              {VENUE_ADMIN_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                          )}
                        </td>
                        {isOwner && (
                          <td>
                            <select className="portal-inline-select" value={a.venue_id || ""} onChange={(e) => handleUpdateUser(a.id, "venue_id", e.target.value)}>
                              <option value="">— None —</option>
                              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                          </td>
                        )}
                        <td>{new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <form className="portal-inline-form" onSubmit={handleCreateUser}>
              <h3 className="portal-form-heading">Add Team Member</h3>
              {createError && <div className="portal-form-error">{createError}</div>}
              <input type="text" className="portal-form-input" placeholder="First Name" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
              <input type="text" className="portal-form-input" placeholder="Last Name" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
              <input type="email" className="portal-form-input" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required />
              <input type="password" className="portal-form-input" placeholder="Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
              <select className="portal-form-input" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                {(isOwner ? OWNER_ROLES : VENUE_ADMIN_ROLES.map((r) => r.value)).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {isOwner && (
                <select className="portal-form-input" value={newVenueId} onChange={(e) => setNewVenueId(e.target.value)}>
                  <option value="">— No venue —</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              <button type="submit" className="portal-form-submit" disabled={creating}>{creating ? "Creating…" : "+ Add Member"}</button>
            </form>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
