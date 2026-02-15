"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Footer from "@/app/components/Footer";

type UserRole = "owner" | "super_admin" | "venue_admin" | "promoter" | "full_admin" | "box_office";

// Map roles to their dashboard routes
const ROLE_ROUTES: Record<UserRole, string> = {
  owner: "/portal",
  super_admin: "/admin",
  venue_admin: "/admin",
  promoter: "/admin",
  full_admin: "/admin",
  box_office: "/admin/scan",
};

export default function LoginPage() {
  const router = useRouter();
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

      if (!authData.user) {
        throw new Error("Login failed — no user returned");
      }

      // Fetch user role from admin_users table
      const { data: adminRecord, error: adminError } = await supabase
        .from("admin_users")
        .select("role")
        .eq("id", authData.user.id)
        .single();

      if (adminError || !adminRecord) {
        // If no admin record, check user_metadata as fallback
        const role = authData.user.user_metadata?.role as UserRole | undefined;
        if (role && ROLE_ROUTES[role]) {
          router.push(ROLE_ROUTES[role]);
          return;
        }
        throw new Error("Access denied — no admin role assigned");
      }

      const role = adminRecord.role as UserRole;
      const route = ROLE_ROUTES[role];

      if (!route) {
        throw new Error(`Unknown role: ${role}`);
      }

      router.push(route);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">Log In</h1>
        </section>

        <section className="login-section">
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
        </section>
      </main>

      <Footer />
    </>
  );
}
