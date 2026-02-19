"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Footer from "@/app/components/Footer";

type UserRole = "owner" | "super_admin" | "venue_admin" | "promoter" | "full_admin" | "box_office" | "read_only" | "door_greeter" | "artist";

// Map roles to their dashboard routes
const ROLE_ROUTES: Record<UserRole, string> = {
  owner: "/admin",
  super_admin: "/admin",
  venue_admin: "/admin",
  promoter: "/admin",
  full_admin: "/admin",
  box_office: "/admin/scan",
  read_only: "/admin",
  door_greeter: "/admin/scan",
  artist: "/admin/guest-lists",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = getSupabaseBrowser();

      // Sign in with Supabase Auth
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password });

      if (authError) {
        throw new Error(authError.message);
      }

      if (!authData.user || !authData.session) {
        throw new Error("Login failed — no user returned");
      }

      const accessToken = authData.session.access_token;

      // Look up admin role via server-side API (bypasses RLS)
      const authRes = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token: accessToken }),
      });
      let role: UserRole | undefined;

      if (authRes.ok) {
        const authBody = await authRes.json();
        role = authBody.role as UserRole;
        // Store role and name for admin pages
        document.cookie = `user-role=${role}; path=/; samesite=lax`;
        if (authBody.first_name) {
          document.cookie = `user-name=${encodeURIComponent(authBody.first_name)}; path=/; samesite=lax`;
        }
        // Owner gets global access (no venue filter); others get venue-scoped
        if (role !== "owner" && authBody.venue_id) {
          document.cookie = `venue-id=${authBody.venue_id}; path=/; samesite=lax`;
        } else {
          document.cookie = "venue-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
      } else {
        // No admin record — try auto-bootstrap (first user becomes owner)
        const bootstrapRes = await fetch("/api/admin/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: accessToken }),
        });

        if (bootstrapRes.ok) {
          const bootstrapData = await bootstrapRes.json();
          role = bootstrapData.role as UserRole;
        } else {
          // Check user_metadata as last resort
          const metaRole = authData.user.user_metadata?.role as UserRole | undefined;
          if (metaRole && ROLE_ROUTES[metaRole]) {
            role = metaRole;
          } else {
            throw new Error(
              "Access denied — your account has no admin role. " +
              "Ask an existing owner to add you, or if this is a fresh install, " +
              "check that your admin_users row exists in Supabase."
            );
          }
        }
      }

      // Use redirect param if present, otherwise fall back to role-based route
      const redirect = searchParams.get("redirect");
      const route = redirect || ROLE_ROUTES[role!];

      if (!route) {
        throw new Error(`Unknown role: ${role}`);
      }

      // Full page navigation so middleware picks up the new cookie session
      window.location.href = route;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      {error && <div className="login-form-error">{error}</div>}

      <label className="login-form-label">
        Email
        <input
          type="email"
          className="login-form-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </label>

      <label className="login-form-label">
        Password
        <input
          type="password"
          className="login-form-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />
      </label>

      <button
        type="submit"
        className="login-form-submit"
        disabled={loading}
      >
        {loading ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">Log In</h1>
        </section>

        <section className="login-section">
          <Suspense fallback={<div className="login-form">Loading...</div>}>
            <LoginForm />
          </Suspense>
        </section>
      </main>

      <Footer />
    </>
  );
}
