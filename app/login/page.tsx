"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Image from "next/image";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { getCookie } from "@/lib/cookies";
import Footer from "@/app/components/Footer";

type UserRole = "owner" | "super_admin" | "venue_admin" | "promoter" | "full_admin" | "box_office" | "read_only" | "door_greeter" | "artist" | "agent";

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
  agent: "/agent",
};

function LoginForm({ onForgot }: { onForgot: () => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Prefill from an onboarding-email deep link (?email=&temp_password=), then
  // immediately scrub both from the URL/history — the temp password is
  // sensitive even though it's meant to be changed on first login, so it
  // shouldn't linger in browser history or get shared if the URL is copied.
  useEffect(() => {
    const emailParam = searchParams.get("email");
    const tempPasswordParam = searchParams.get("temp_password");
    if (!emailParam && !tempPasswordParam) return;

    if (emailParam) setEmail(emailParam);
    if (tempPasswordParam) setPassword(tempPasswordParam);

    const cleaned = new URLSearchParams(searchParams.toString());
    cleaned.delete("email");
    cleaned.delete("temp_password");
    const query = cleaned.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          // Fetch venue name for sidebar display
          try {
            const venuesRes = await fetch("/api/venues");
            if (venuesRes.ok) {
              const venues = await venuesRes.json();
              const v = Array.isArray(venues) ? venues.find((x: Record<string, string>) => x.id === authBody.venue_id) : null;
              if (v?.name) document.cookie = `venue-name=${encodeURIComponent(v.name)}; path=/; samesite=lax`;
            }
          } catch {}
        } else {
          document.cookie = "venue-id=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          if (role === "owner") {
            document.cookie = `venue-name=${encodeURIComponent("All Venues")}; path=/; samesite=lax`;
          }
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
        <div style={{ position: "relative" }}>
          <input
            type={showPassword ? "text" : "password"}
            className="login-form-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            style={{ paddingRight: 44 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)",
              width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)",
            }}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.94 10.94 0 0112 20c-7 0-11-8-11-8a18.5 18.5 0 015.06-5.94M9.9 4.24A10.94 10.94 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </label>

      <button
        type="submit"
        className="login-form-submit"
        disabled={loading}
      >
        {loading ? "Signing in…" : "Sign In"}
      </button>

      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button
          type="button"
          onClick={onForgot}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
        >
          Forgot Password?
        </button>
      </div>
    </form>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [resetEmail, setResetEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setMsg("");
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${typeof window !== "undefined" ? window.location.origin : ""}/login?reset=true`,
      });
      if (error) throw error;
      setMsg("If that email exists, a reset link has been sent. Check your inbox.");
    } catch {
      setMsg("Something went wrong. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="login-form" onSubmit={handleReset}>
      <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, marginBottom: 16 }}>
        Enter your email and we&apos;ll send you a password reset link.
      </p>
      {msg && (
        <div
          className="login-form-error"
          style={msg.includes("sent") ? { background: "rgba(34,197,94,0.15)", color: "#22c55e" } : undefined}
        >
          {msg}
        </div>
      )}
      <label className="login-form-label">
        Email
        <input
          type="email"
          className="login-form-input"
          value={resetEmail}
          onChange={(e) => setResetEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoComplete="email"
        />
      </label>
      <button type="submit" className="login-form-submit" disabled={sending}>
        {sending ? "Sending…" : "Send Reset Link"}
      </button>
      <div style={{ textAlign: "center", marginTop: 12 }}>
        <button
          type="button"
          onClick={onBack}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 13, textDecoration: "underline" }}
        >
          ← Back to Sign In
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  const [showForgot, setShowForgot] = useState(false);
  const isWest72 = getCookie("operatorSlug") === "west72";

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          {isWest72 && (
            <Image
              src="/West72_Logos/W72_tech_icon_white.png"
              alt="West 72 Entertainment"
              width={80}
              height={80}
              style={{ display: "block", margin: "0 auto 24px", objectFit: "contain" }}
              unoptimized
            />
          )}
          <h1 className="staff-login-hero-title">{showForgot ? "Reset Password" : "Log In"}</h1>
        </section>

        <section className="login-section">
          {showForgot ? (
            <ForgotPasswordForm onBack={() => setShowForgot(false)} />
          ) : (
            <Suspense fallback={<div className="login-form">Loading...</div>}>
              <LoginForm onForgot={() => setShowForgot(true)} />
            </Suspense>
          )}
        </section>
      </main>

      <Footer />
    </>
  );
}
