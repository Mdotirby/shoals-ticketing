"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { BidderSession } from "@/lib/types/auction";
import { formatPhoneNumber } from "@/lib/formatPhone";

export default function AuctionRegisterPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auctionId = params.auctionId as string;
  const returnTo = searchParams.get("return");

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [auctionName, setAuctionName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Check if already registered
    try {
      const raw = localStorage.getItem(`vc-auction-${auctionId}`);
      if (raw) {
        const session: BidderSession = JSON.parse(raw);
        if (session.bidder_id) {
          router.replace(returnTo || `/auction/${auctionId}/dashboard`);
          return;
        }
      }
    } catch { /* ignore */ }

    // Fetch auction info for branding
    fetch(`/api/auctions/${auctionId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.name) setAuctionName(data.name);
        if (data.logo_url) setLogoUrl(data.logo_url);
      })
      .catch(() => {});
  }, [auctionId, returnTo, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!form.first_name || !form.last_name || !form.email || !form.phone) {
      setError("All fields are required.");
      setLoading(false);
      return;
    }

    const res = await fetch(`/api/auctions/${auctionId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Registration failed.");
      setLoading(false);
      return;
    }

    const bidder = await res.json();

    // Save session to localStorage
    const session: BidderSession = {
      bidder_id: bidder.id,
      auction_id: auctionId,
      first_name: bidder.first_name,
      last_name: bidder.last_name,
      email: bidder.email,
      phone: bidder.phone,
    };

    localStorage.setItem(`vc-auction-${auctionId}`, JSON.stringify(session));

    // Redirect
    router.replace(returnTo || `/auction/${auctionId}/dashboard`);
  };

  // Enter acts as Tab
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const formEl = (e.target as HTMLElement).closest("form");
      if (!formEl) return;
      const inputs = Array.from(
        formEl.querySelectorAll<HTMLElement>("input, button[type='submit']")
      ).filter((el) => !el.hasAttribute("disabled"));
      const idx = inputs.indexOf(e.target as HTMLElement);
      if (idx >= 0 && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      } else if (idx === inputs.length - 2) {
        // Last input — submit
        formEl.requestSubmit();
      }
    }
  };

  return (
    <div className="auction-page auction-register-page">
      <header className="auction-header">
        {logoUrl && (
          <img src={logoUrl} alt="Auction logo" className="auction-logo" />
        )}
        <h1 className="auction-title">{auctionName || "Auction"}</h1>
      </header>

      <div className="auction-register-card">
        <h2 className="auction-register-heading">Register to Bid</h2>
        <p className="auction-register-subtext">
          Enter your information to start bidding on items.
        </p>

        {error && <div className="auction-error">{error}</div>}

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="auction-register-form">
          <div className="auction-form-group">
            <label className="auction-label">First Name *</label>
            <input
              type="text"
              name="first_name"
              value={form.first_name}
              onChange={handleChange}
              className="auction-input"
              placeholder="John"
              required
              autoFocus
            />
          </div>

          <div className="auction-form-group">
            <label className="auction-label">Last Name *</label>
            <input
              type="text"
              name="last_name"
              value={form.last_name}
              onChange={handleChange}
              className="auction-input"
              placeholder="Doe"
              required
            />
          </div>

          <div className="auction-form-group">
            <label className="auction-label">Email *</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              className="auction-input"
              placeholder="john@example.com"
              required
            />
          </div>

          <div className="auction-form-group">
            <label className="auction-label">Phone *</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: formatPhoneNumber(e.target.value) })}
              className="auction-input"
              placeholder="(555)-123-4567"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auction-btn auction-btn-primary"
          >
            {loading ? "Registering…" : "Start Bidding"}
          </button>
        </form>
      </div>

      <footer className="auction-footer">
        <span>Powered by <strong>VenueCore</strong></span>
      </footer>
    </div>
  );
}
