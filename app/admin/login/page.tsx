"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type UserRole = "owner" | "super_admin" | "venue_admin" | "promoter" | "full_admin" | "box_office" | "read_only" | "door_greeter" | "artist";

const ROLE_ROUTES: Record<UserRole, string> = {
  owner: "/admin",
  super_admin: "/admin",
  venue_admin: "/admin",
  promoter: "/admin",
  full_admin: "/admin",
  box_office: "/admin/scan",
  read_only: "/admin",
  door_greeter: "/admin/scan",
  artist: "/admin/guest-list",
};

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError) throw new Error(authError.message);
      if (!authData.user || !authData.session) throw new Error("Login failed.");

      // Look up admin role
      const authRes = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: authData.session.access_token }),
      });

      if (!authRes.ok) {
        throw new Error("No admin role assigned. Contact your venue administrator.");
      }

      const authBody = await authRes.json();
      const role = authBody.role as UserRole;

      // Set cookies for admin layout
      document.cookie = `user-role=${role}; path=/; samesite=lax`;
      if (authBody.first_name) {
        document.cookie = `user-name=${encodeURIComponent(authBody.first_name)}; path=/; samesite=lax`;
      }
      if (role !== "owner" && authBody.venue_id) {
        document.cookie = `venue-id=${authBody.venue_id}; path=/; samesite=lax`;
      } else {
        document.cookie = "venue-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      }

      // Redirect to role-appropriate page
      router.push(ROLE_ROUTES[role] || "/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <Image
          src="/beige-brown-logo.png"
          alt="VenueCore Logo"
          width={127}
          height={127}
          className="admin-login-logo"
        />
        <h1 className="admin-login-title">Admin Login</h1>
        <p className="admin-login-subtitle">
          Sign in to manage your events and sales
        </p>

        <form className="admin-login-form" onSubmit={handleLogin}>
          {error && <div className="admin-login-error">{error}</div>}

          <label className="admin-form-label">
            Email
            <input
              type="email"
              className="admin-form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@venuecore.live"
              required
            />
          </label>

          <label className="admin-form-label">
            Password
            <input
              type="password"
              className="admin-form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          <button type="submit" className="admin-login-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
