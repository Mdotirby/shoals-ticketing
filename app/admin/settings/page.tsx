"use client";

import { useEffect, useState } from "react";
import { getCookie } from "@/lib/cookies";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [venueId, setVenueId] = useState("");

  const [venue, setVenue] = useState({
    name: "",
    nickname: "",
    capacity: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
  });

  const [buyer, setBuyer] = useState({
    buyer_name: "",
    contract_signatory: "",
    buyer_phone: "",
    buyer_email: "",
    promoter_address: "",
  });

  useEffect(() => {
    const vid = getCookie("venue-id");
    const role = getCookie("user-role");

    if (!vid && role !== "owner" && role !== "super_admin") {
      setLoading(false);
      setError("No venue assigned to your account.");
      return;
    }

    // Helper to load a venue's settings into state
    const loadVenue = (v: Record<string, unknown>) => {
      setVenueId(v.id as string);
      setVenue({
        name: (v.name as string) || "",
        nickname: (v.nickname as string) || "",
        capacity: v.capacity ? String(v.capacity) : "",
        address_street: (v.address_street as string) || "",
        address_city: (v.address_city as string) || "",
        address_state: (v.address_state as string) || "",
        address_zip: (v.address_zip as string) || "",
      });
      setBuyer({
        buyer_name: (v.buyer_name as string) || "",
        contract_signatory: (v.contract_signatory as string) || "",
        buyer_phone: (v.buyer_phone as string) || "",
        buyer_email: (v.buyer_email as string) || "",
        promoter_address: (v.promoter_address as string) || "",
      });
    };

    // Fetch all venues and resolve the target
    fetch("/api/venues")
      .then((r) => r.json())
      .then((venues) => {
        if (!Array.isArray(venues) || venues.length === 0) {
          setError("No venues found.");
          return;
        }
        // If we have a venue-id cookie, use it; otherwise pick the first venue (owner/super_admin)
        const v = vid
          ? venues.find((x: { id: string }) => x.id === vid)
          : venues[0];
        if (!v) {
          setError("Venue not found.");
          return;
        }
        loadVenue(v);
      })
      .catch(() => setError("Failed to load venue settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const res = await fetch("/api/venues", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: venueId,
          name: venue.name,
          nickname: venue.nickname || null,
          capacity: venue.capacity ? parseInt(venue.capacity) : null,
          address_street: venue.address_street || null,
          address_city: venue.address_city || null,
          address_state: venue.address_state || null,
          address_zip: venue.address_zip || null,
          buyer_name: buyer.buyer_name || null,
          contract_signatory: buyer.contract_signatory || null,
          buyer_phone: buyer.buyer_phone || null,
          buyer_email: buyer.buyer_email || null,
          promoter_address: buyer.promoter_address || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSuccess("Settings saved successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Settings</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Settings</h1>

      <form className="admin-form" onSubmit={handleSave}>
        {error && <div className="admin-form-error">{error}</div>}
        {success && <div className="admin-form-success">{success}</div>}

        {/* ── Venue Information ── */}
        <h2 className="admin-form-section-title">Venue Information</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            Venue Name
            <input
              type="text"
              className="admin-form-input"
              value={venue.name}
              onChange={(e) => setVenue({ ...venue, name: e.target.value })}
            />
          </label>
          <label className="admin-form-label">
            Nickname
            <input
              type="text"
              className="admin-form-input"
              value={venue.nickname}
              onChange={(e) => setVenue({ ...venue, nickname: e.target.value })}
              placeholder="e.g. SRL"
            />
          </label>
          <label className="admin-form-label">
            Total Capacity
            <input
              type="number"
              className="admin-form-input"
              value={venue.capacity}
              onChange={(e) => setVenue({ ...venue, capacity: e.target.value })}
            />
          </label>
          <label className="admin-form-label">
            Street Address
            <input
              type="text"
              className="admin-form-input"
              value={venue.address_street}
              onChange={(e) => setVenue({ ...venue, address_street: e.target.value })}
            />
          </label>
          <label className="admin-form-label">
            City
            <input
              type="text"
              className="admin-form-input"
              value={venue.address_city}
              onChange={(e) => setVenue({ ...venue, address_city: e.target.value })}
            />
          </label>
          <label className="admin-form-label">
            State
            <input
              type="text"
              className="admin-form-input"
              value={venue.address_state}
              onChange={(e) => setVenue({ ...venue, address_state: e.target.value })}
              placeholder="AL"
              maxLength={2}
            />
          </label>
          <label className="admin-form-label">
            ZIP Code
            <input
              type="text"
              className="admin-form-input"
              value={venue.address_zip}
              onChange={(e) => setVenue({ ...venue, address_zip: e.target.value })}
            />
          </label>
        </div>

        {/* ── Buyer Information ── */}
        <h2 className="admin-form-section-title">Buyer / Promoter Information</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            Buyer Name (Company)
            <input
              type="text"
              className="admin-form-input"
              value={buyer.buyer_name}
              onChange={(e) => setBuyer({ ...buyer, buyer_name: e.target.value })}
              placeholder="e.g. West 72 Entertainment LLC"
            />
          </label>
          <label className="admin-form-label">
            Contract Signatory
            <input
              type="text"
              className="admin-form-input"
              value={buyer.contract_signatory}
              onChange={(e) => setBuyer({ ...buyer, contract_signatory: e.target.value })}
            />
          </label>
          <label className="admin-form-label">
            Phone
            <input
              type="tel"
              className="admin-form-input"
              value={buyer.buyer_phone}
              onChange={(e) => setBuyer({ ...buyer, buyer_phone: e.target.value })}
            />
          </label>
          <label className="admin-form-label">
            Email
            <input
              type="email"
              className="admin-form-input"
              value={buyer.buyer_email}
              onChange={(e) => setBuyer({ ...buyer, buyer_email: e.target.value })}
            />
          </label>
          <label className="admin-form-label admin-form-full">
            Promoter Address
            <input
              type="text"
              className="admin-form-input"
              value={buyer.promoter_address}
              onChange={(e) => setBuyer({ ...buyer, promoter_address: e.target.value })}
              placeholder="798 N Royal Ave, Florence AL, 35630"
            />
          </label>
        </div>

        <button
          type="submit"
          className="admin-form-submit"
          disabled={saving}
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </form>
    </div>
  );
}
