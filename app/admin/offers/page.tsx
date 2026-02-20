"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArtistOffer } from "@/lib/types/offer";
import { getCookie } from "@/lib/cookies";

const STATUS_COLORS: Record<string, string> = {
  draft: "status-draft",
  sent: "status-published",
  accepted: "status-published",
  declined: "status-declined",
  expired: "status-declined",
};

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d.replace(/[+-]\d{2}:\d{2}$/, "").replace(/Z$/, "")); }

function formatDate(date: string) {
  return safeDate(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AdminOffersPage() {
  const [offers, setOffers] = useState<ArtistOffer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const params = venueId ? `?venue_id=${venueId}` : "";

    fetch(`/api/offers${params}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setOffers(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this offer?")) return;

    const res = await fetch(`/api/offers/${id}`, { method: "DELETE" });
    if (res.ok) {
      setOffers((prev) => prev.filter((o) => o.id !== id));
    }
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Booking</h1>
        <Link href="/admin/offers/new" className="admin-header-btn">
          + New Offer
        </Link>
      </div>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading offers…</p>
      )}

      {!loading && offers.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No offers yet. Click &quot;+ New Offer&quot; to create one.
        </p>
      )}

      {!loading && offers.length > 0 && (
        <div className="admin-events-list">
          {offers.map((offer) => (
            <div key={offer.id} className="admin-event-card">
              <div className="admin-event-info">
                <div>
                  <h3 className="admin-event-name">{offer.artist_name}</h3>
                  <span className="admin-event-meta">
                    {offer.venue || "No venue"} ·{" "}
                    {offer.event_date
                      ? formatDate(offer.event_date)
                      : "No date"}
                  </span>
                  <span
                    className={`admin-event-status ${
                      STATUS_COLORS[offer.status] || ""
                    }`}
                  >
                    {offer.status}
                  </span>
                </div>
              </div>
              <div className="admin-event-actions">
                {offer.guarantee && (
                  <span className="admin-event-price">
                    ${offer.guarantee.toLocaleString()}
                  </span>
                )}
                <Link
                  href={`/admin/offers/${offer.id}`}
                  className="admin-sponsor-edit-btn"
                >
                  Edit
                </Link>
                <button
                  className="admin-sponsor-delete-btn"
                  onClick={() => handleDelete(offer.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
