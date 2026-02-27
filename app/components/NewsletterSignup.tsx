"use client";

import { useState } from "react";
import Link from "next/link";
import { useVenue } from "@/app/components/VenueContext";

export default function NewsletterSignup() {
  const { venueSlug } = useVenue();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim()) return;

    setStatus("loading");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), source: "homepage", venueSlug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setStatus("success");
      setMessage("You're in! Welcome to the crew.");
      setFirstName("");
      setLastName("");
      setEmail("");
    } catch (err: unknown) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  return (
    <section className="newsletter-section">
      <div className="newsletter-glow" />
      <div className="newsletter-content">
        <div className="newsletter-header">
          <span className="newsletter-eyebrow">FRIENDS WITH BENEFITS</span>
          <h2 className="newsletter-title">Get the Inside Scoop</h2>
          <p className="newsletter-subtitle">
            Presales, exclusive offers, breaking news, and early announcements — delivered straight to your inbox.
          </p>
        </div>

        {status === "success" ? (
          <div className="newsletter-success">
            <span className="newsletter-success-icon">&#10003;</span>
            <p>{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="newsletter-form">
            <div className="newsletter-fields">
              <input
                type="text"
                placeholder="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="newsletter-input"
                required
              />
              <input
                type="text"
                placeholder="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="newsletter-input"
                required
              />
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="newsletter-input newsletter-input-email"
                required
              />
              <button
                type="submit"
                className="newsletter-submit"
                disabled={status === "loading"}
              >
                {status === "loading" ? "Signing Up..." : "Sign Up"}
              </button>
            </div>
            {status === "error" && (
              <p className="newsletter-error">{message}</p>
            )}
            <p className="newsletter-disclaimer">
              By signing up, you&apos;ll receive updates and offers from VenueCore
            </p>
            <p className="newsletter-privacy-link">
              Privacy Policy:{" "}
              <Link href="/privacy" className="newsletter-link">
                VenueCore
              </Link>
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
