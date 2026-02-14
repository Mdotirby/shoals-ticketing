"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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
      // TODO: Wire up Supabase Auth signInWithPassword
      // For now, simple placeholder login
      if (email && password) {
        router.push("/admin");
      } else {
        setError("Email and password are required.");
      }
    } catch {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <Image
          src="/beige-brown-logo.png"
          alt="West 72 Logo"
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
              placeholder="admin@west72.com"
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

          <button
            type="submit"
            className="admin-login-btn"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
