"use client";

import { useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type Props = {
  userId: string;
  onComplete: () => void;
};

export default function ForcePasswordModal({ userId, onComplete }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) throw pwError;

      // Clear the must_change_password flag
      await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: userId, must_change_password: false }),
      });

      onComplete();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="force-pw-overlay"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        className="force-pw-modal"
        style={{
          background: "#0b0d1d",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: 12,
          padding: "2rem",
          width: "100%",
          maxWidth: 420,
        }}
      >
        <h2
          style={{ color: "#ffffff", marginBottom: 4, fontSize: "1.25rem", fontWeight: 700 }}
        >
          Set Your Password
        </h2>
        <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 14, marginBottom: "1.5rem" }}>
          You must set a new password before continuing.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div className="admin-form-error">{error}</div>}
          <label className="admin-form-label">
            New Password
            <input
              type="password"
              className="admin-form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              placeholder="Minimum 8 characters"
              required
              autoFocus
            />
          </label>
          <label className="admin-form-label">
            Confirm Password
            <input
              type="password"
              className="admin-form-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="admin-form-submit" disabled={loading}>
            {loading ? "Saving…" : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
