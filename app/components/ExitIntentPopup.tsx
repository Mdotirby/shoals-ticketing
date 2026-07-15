"use client";

import { useState, useEffect, useCallback } from "react";

type Props = {
  enabled?: boolean;
  headline?: string;
  venueSlug?: string;
};

/**
 * Exit-intent popup that triggers when user moves cursor toward browser close (desktop)
 * or scrolls up rapidly (mobile). Shows a FWB signup form.
 */
export default function ExitIntentPopup({ enabled = true, headline = "Get Early Access to Tickets", venueSlug }: Props) {
  const [show, setShow] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const triggerPopup = useCallback(() => {
    // Only show once per session
    if (sessionStorage.getItem("exit-intent-shown")) return;
    sessionStorage.setItem("exit-intent-shown", "1");
    setShow(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Desktop: detect mouse leaving viewport (toward close button)
    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) triggerPopup();
    };

    // Mobile: detect rapid scroll up (user about to leave)
    let lastScrollY = window.scrollY;
    let scrollUpCount = 0;
    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < lastScrollY && currentY < 100) {
        scrollUpCount++;
        if (scrollUpCount > 3) triggerPopup();
      } else {
        scrollUpCount = 0;
      }
      lastScrollY = currentY;
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [enabled, triggerPopup]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          source: "exit_intent",
          venueSlug,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setError(data.error || "Something went wrong");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
      onClick={() => setShow(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#131629", border: "1px solid rgba(208,194,144,0.2)",
          borderRadius: 16, padding: "32px 28px", maxWidth: 420, width: "100%",
          position: "relative",
        }}
      >
        {/* Close button */}
        <button
          onClick={() => setShow(false)}
          style={{
            position: "absolute", top: 12, right: 12,
            background: "none", border: "none", color: "rgba(255,255,255,0.3)",
            fontSize: 20, cursor: "pointer", lineHeight: 1,
          }}
        >
          ×
        </button>

        {submitted ? (
          <div style={{ textAlign: "center" }}>
            <h2 style={{ color: "#d0c290", fontSize: 22, margin: "0 0 8px" }}>You&apos;re In!</h2>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
              Welcome to Friends With Benefits. You&apos;ll get presale access and exclusive offers.
            </p>
          </div>
        ) : (
          <>
            <h2 style={{ color: "#d0c290", fontSize: 22, margin: "0 0 6px", textAlign: "center" }}>{headline}</h2>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, textAlign: "center", margin: "0 0 20px" }}>
              Join <strong>Friends With Benefits</strong> for presale access, exclusive offers, and breaking news.
            </p>

            {error && <div style={{ color: "#ff6b6b", fontSize: 13, marginBottom: 12, textAlign: "center" }}>{error}</div>}

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="First Name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                  style={inputStyle}
                />
              </div>
              <input
                type="email"
                placeholder="Email Address"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                style={{ ...inputStyle, marginBottom: 12, width: "100%", boxSizing: "border-box" }}
              />
              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%", padding: "14px 0",
                  background: "linear-gradient(135deg, #d0c290, #b8a66e)",
                  color: "#0b0d1d", fontWeight: 700, fontSize: 14,
                  border: "none", borderRadius: 8, cursor: "pointer",
                }}
              >
                {loading ? "Joining..." : "Join Friends With Benefits"}
              </button>
            </form>

            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 10, textAlign: "center", marginTop: 12, marginBottom: 0 }}>
              No spam. Unsubscribe anytime.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "12px 14px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 16,
  outline: "none",
};
