"use client";

/**
 * Venue settings — Profile tab, rebuilt on the shared primitives against
 * handoff/screens/settings.dc.html (#set-profile, #set-fees).
 *
 * Restyle only: the /api/venues load and PUT, the venue-id resolution, the
 * tax-rate percent/decimal conversion and the owner-only fee guard are
 * unchanged. The flat admin-form sections become the design's cards; fees
 * carry its "owner only" pill and read as locked fields for everyone else.
 */

import { useEffect, useState } from "react";
import { Button, Card, Field, FieldRow, Pill } from "@/app/components/admin/ui";
import { getCookie } from "@/lib/cookies";
import { formatPhoneNumber } from "@/lib/formatPhone";

export default function AdminSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [venueId, setVenueId] = useState("");
  const [isOwner, setIsOwner] = useState(false);

  const [venue, setVenue] = useState({
    name: "",
    nickname: "",
    capacity: "",
    address_street: "",
    address_city: "",
    address_state: "",
    address_zip: "",
  });

  const [fees, setFees] = useState({
    ticketing_fee: "3.00",
    facility_fee: "0",
    tax_rate: "9.5",
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

    setIsOwner(role === "owner" || role === "super_admin");

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
      setFees({
        ticketing_fee: v.ticketing_fee != null ? String(v.ticketing_fee) : "3.00",
        facility_fee: v.facility_fee != null ? String(v.facility_fee) : "0",
        tax_rate: v.tax_rate != null ? String(Number(v.tax_rate) > 1 ? v.tax_rate : Number(v.tax_rate) * 100) : "9.5",
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
          // Only owner can update fee fields
          ...(isOwner ? {
            ticketing_fee: parseFloat(fees.ticketing_fee) || 0,
            facility_fee: parseFloat(fees.facility_fee) || 0,
            tax_rate: parseFloat(fees.tax_rate) / 100, // store as decimal
          } : {}),
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
    return <div className="setp-state">Loading venue settings…</div>;
  }

  const feeLock = !isOwner
    ? { readOnly: true, title: "Only the owner can edit this field", className: "setp-locked" }
    : {};

  return (
    <form className="setp" onSubmit={handleSave}>
      {error && <div className="setp-banner setp-banner--bad">{error}</div>}
      {success && <div className="setp-banner setp-banner--good">{success}</div>}

      <div className="setp-grid">
        <Card title="Venue profile" sub="Name, room and address as they appear on offers and the storefront">
          <div className="setp-body">
            <FieldRow>
              <Field label="Venue name">
                <input type="text" value={venue.name} onChange={(e) => setVenue({ ...venue, name: e.target.value })} required />
              </Field>
              <Field label="Nickname">
                <input type="text" value={venue.nickname} onChange={(e) => setVenue({ ...venue, nickname: e.target.value })} placeholder="e.g. SRL" />
              </Field>
            </FieldRow>
            <Field label="Total capacity">
              <input type="number" value={venue.capacity} onChange={(e) => setVenue({ ...venue, capacity: e.target.value })} />
            </Field>
            <Field label="Street address">
              <input type="text" value={venue.address_street} onChange={(e) => setVenue({ ...venue, address_street: e.target.value })} />
            </Field>
            <FieldRow cols={3}>
              <Field label="City">
                <input type="text" value={venue.address_city} onChange={(e) => setVenue({ ...venue, address_city: e.target.value })} />
              </Field>
              <Field label="State">
                <input type="text" value={venue.address_state} onChange={(e) => setVenue({ ...venue, address_state: e.target.value })} placeholder="AL" maxLength={2} />
              </Field>
              <Field label="ZIP code">
                <input type="text" value={venue.address_zip} onChange={(e) => setVenue({ ...venue, address_zip: e.target.value })} />
              </Field>
            </FieldRow>
          </div>
        </Card>

        <Card title="Buyer / promoter" sub="The party named on offers and contracts">
          <div className="setp-body">
            <Field label="Buyer name (company)">
              <input type="text" value={buyer.buyer_name} onChange={(e) => setBuyer({ ...buyer, buyer_name: e.target.value })} placeholder="e.g. West 72 Entertainment LLC" />
            </Field>
            <Field label="Contract signatory">
              <input type="text" value={buyer.contract_signatory} onChange={(e) => setBuyer({ ...buyer, contract_signatory: e.target.value })} />
            </Field>
            <FieldRow>
              <Field label="Phone">
                <input type="tel" value={buyer.buyer_phone} onChange={(e) => setBuyer({ ...buyer, buyer_phone: formatPhoneNumber(e.target.value) })} />
              </Field>
              <Field label="Email">
                <input type="email" value={buyer.buyer_email} onChange={(e) => setBuyer({ ...buyer, buyer_email: e.target.value })} />
              </Field>
            </FieldRow>
            <Field label="Promoter address">
              <input type="text" value={buyer.promoter_address} onChange={(e) => setBuyer({ ...buyer, promoter_address: e.target.value })} placeholder="798 N Royal Ave, Florence AL, 35630" />
            </Field>
          </div>
        </Card>
      </div>

      <Card
        title="Fees & tax"
        actions={<Pill>owner only</Pill>}
        sub={isOwner ? "Per-ticket fees and the sales tax rate for this venue." : "Set by the platform owner — read-only for venue staff."}
      >
        <div className="setp-fees">
          <Field label="Ticketing fee ($ per ticket)">
            <input type="number" value={fees.ticketing_fee} onChange={(e) => setFees({ ...fees, ticketing_fee: e.target.value })} step="0.01" min="0" {...feeLock} />
          </Field>
          <Field label="Facility fee ($ per ticket)">
            <input type="number" value={fees.facility_fee} onChange={(e) => setFees({ ...fees, facility_fee: e.target.value })} step="0.01" min="0" {...feeLock} />
          </Field>
          <Field label="Tax rate (%)">
            <input type="number" value={fees.tax_rate} onChange={(e) => setFees({ ...fees, tax_rate: e.target.value })} step="0.5" min="0" {...feeLock} />
          </Field>
        </div>
      </Card>

      <div className="setp-actions">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
