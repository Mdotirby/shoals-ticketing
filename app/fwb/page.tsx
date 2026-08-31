"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { formatPhoneNumber } from "@/lib/formatPhone";
import Link from "next/link";

// ── Tier data ─────────────────────────────────────────────────────────────────

const TIERS = [
  {
    name: "Casual Friend",
    range: "0 – 999 pts",
    color: "#9ca3af",
    perks: ["Base earn rate on every purchase", "Access to the Benefits Vault"],
  },
  {
    name: "Close Friend",
    range: "1,000 – 4,999 pts",
    color: "#60a5fa",
    perks: ["Early reward access", "Everything in Casual Friend"],
  },
  {
    name: "Inner Circle",
    range: "5,000 – 9,999 pts",
    color: "#a78bfa",
    perks: ["Priority seating", "Exclusive reward drops", "Everything below"],
  },
  {
    name: "After Hours",
    range: "10,000 – 19,999 pts",
    color: "#f59e0b",
    perks: ["VIP perks", "Meet & greet access", "Everything below"],
  },
  {
    name: "Ride or Die",
    range: "20,000+ pts",
    color: "rgb(var(--vc-gold-rgb))",
    perks: ["All perks unlocked", "Surprise rewards", "The ultimate insider"],
  },
];

const PERKS = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
      </svg>
    ),
    title: "Earn Points on Every Purchase",
    desc: "Every dollar you spend earns you Benefits points. The more you go, the more you earn.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    title: "Unlock Exclusive Rewards",
    desc: "Redeem points for free tickets, bar tabs, merch, hotel stays, and VIP experiences.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    title: "Streak Multipliers",
    desc: "Attend back-to-back events to unlock 1.5x and 2x earn multipliers on your points.",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    ),
    title: "Presale Access & Early Announcements",
    desc: "Be the first to know about new shows and get tickets before they go on sale to the public.",
  },
];

// ── FWB Content (inside Suspense) ─────────────────────────────────────────────

function FWBContent() {
  const searchParams = useSearchParams();

  // Parse pre-fill data from query params (from checkout success page)
  const prefillName = searchParams.get("name") || "";
  const prefillEmail = searchParams.get("email") || "";
  const prefillPhone = searchParams.get("phone") || "";

  // Split full name into first/last
  const nameParts = prefillName.trim().split(/\s+/);
  const defaultFirst = nameParts[0] || "";
  const defaultLast = nameParts.slice(1).join(" ") || "";

  const [firstName, setFirstName] = useState(defaultFirst);
  const [lastName, setLastName] = useState(defaultLast);
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState(prefillPhone);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  // Detect if fields were pre-filled
  useEffect(() => {
    if (prefillName || prefillEmail) {
      setPrefilled(true);
    }
  }, [prefillName, prefillEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          source: "fwb_landing",
        }),
      });

      if (res.ok) {
        setStatus("success");
      } else {
        const data = await res.json();
        if (res.status === 409) {
          // Already subscribed — treat as success
          setStatus("success");
        } else {
          setErrorMsg(data.error || "Something went wrong. Please try again.");
          setStatus("error");
        }
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  return (
    <div className="fwb-page">
      {/* Hero Section */}
      <section className="fwb-hero">
        <div className="fwb-hero-glow" />
        <div className="fwb-hero-content">
          <span className="fwb-hero-eyebrow">LOYALTY PROGRAM</span>
          <h1 className="fwb-hero-title">Friends with Benefits</h1>
          <p className="fwb-hero-subtitle">
            Earn points on every ticket purchase. Unlock exclusive rewards, VIP perks, and presale access.
            The more shows you attend, the better it gets.
          </p>
          <a href="#fwb-signup" className="fwb-hero-cta">
            Join Now — It&apos;s Free
          </a>
        </div>
      </section>

      {/* How It Works */}
      <section className="fwb-section">
        <h2 className="fwb-section-title">How It Works</h2>
        <div className="fwb-perks-grid">
          {PERKS.map((perk, i) => (
            <div key={i} className="fwb-perk-card">
              <div className="fwb-perk-icon">{perk.icon}</div>
              <h3 className="fwb-perk-title">{perk.title}</h3>
              <p className="fwb-perk-desc">{perk.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tier Breakdown */}
      <section className="fwb-section">
        <h2 className="fwb-section-title">Tier Breakdown</h2>
        <p className="fwb-section-subtitle">
          Level up by earning lifetime Benefits points. Each tier unlocks better perks and rewards.
        </p>
        <div className="fwb-tiers-grid">
          {TIERS.map((tier, i) => (
            <div key={i} className="fwb-tier-card" style={{ borderColor: `${tier.color}33` }}>
              <div className="fwb-tier-badge" style={{ background: `${tier.color}22`, color: tier.color }}>
                {tier.name}
              </div>
              <span className="fwb-tier-range">{tier.range}</span>
              <ul className="fwb-tier-perks">
                {tier.perks.map((perk, j) => (
                  <li key={j}>{perk}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Signup Form */}
      <section className="fwb-section" id="fwb-signup">
        <div className="fwb-signup-card">
          {status === "success" ? (
            <div className="fwb-signup-success">
              <div className="fwb-signup-success-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="24" fill="rgba(16, 185, 129, 0.15)" />
                  <path d="M14 24L21 31L34 18" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="fwb-signup-success-heading">You&apos;re In!</h2>
              <p className="fwb-signup-success-text">
                Welcome to Friends with Benefits. You&apos;ll receive presale access, exclusive offers, and event updates.
                Check your email for a welcome message.
              </p>
              <Link href="/events" className="fwb-signup-success-btn">
                Browse Upcoming Events
              </Link>
            </div>
          ) : (
            <>
              <h2 className="fwb-signup-heading">Join Friends with Benefits</h2>
              <p className="fwb-signup-desc">
                Sign up to start earning points and unlocking rewards. It&apos;s free — no credit card required.
              </p>
              {prefilled && status === "idle" && (
                <div className="fwb-signup-prefill-notice">
                  We&apos;ve filled in your info from your recent purchase. Just hit join!
                </div>
              )}
              {errorMsg && <div className="fwb-signup-error">{errorMsg}</div>}
              <form onSubmit={handleSubmit} className="fwb-signup-form">
                <div className="fwb-signup-row">
                  <div className="fwb-signup-field">
                    <label htmlFor="fwb-first">First Name</label>
                    <input
                      id="fwb-first"
                      type="text"
                      placeholder="Jane"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                      autoComplete="given-name"
                    />
                  </div>
                  <div className="fwb-signup-field">
                    <label htmlFor="fwb-last">Last Name</label>
                    <input
                      id="fwb-last"
                      type="text"
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                      autoComplete="family-name"
                    />
                  </div>
                </div>
                <div className="fwb-signup-field">
                  <label htmlFor="fwb-email">Email</label>
                  <input
                    id="fwb-email"
                    type="email"
                    placeholder="jane@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
                <div className="fwb-signup-field">
                  <label htmlFor="fwb-phone">Phone <span className="fwb-optional">(optional)</span></label>
                  <input
                    id="fwb-phone"
                    type="tel"
                    placeholder="(555) 123-4567"
                    value={phone}
                    onChange={(e) => setPhone(formatPhoneNumber(e.target.value))}
                    autoComplete="tel"
                  />
                </div>
                <button type="submit" className="fwb-signup-submit" disabled={status === "loading"}>
                  {status === "loading" ? "Joining..." : "Join Friends with Benefits"}
                </button>
                <p className="fwb-signup-disclaimer">
                  By joining, you agree to receive emails about upcoming events, presales, and exclusive offers.
                  You can unsubscribe at any time. No spam, ever.
                </p>
              </form>
            </>
          )}
        </div>
      </section>

      {/* Back to events link */}
      <div className="fwb-back-link">
        <Link href="/events">← Back to Events</Link>
      </div>
    </div>
  );
}

// ── Page Export ────────────────────────────────────────────────────────────────

export default function FWBPage() {
  return (
    <main className="ticket-page">
      <Suspense fallback={<div style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", padding: 40 }}>Loading...</div>}>
        <FWBContent />
      </Suspense>
    </main>
  );
}
