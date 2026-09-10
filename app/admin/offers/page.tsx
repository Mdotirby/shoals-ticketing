"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArtistOffer } from "@/lib/types/offer";
import { getCookie } from "@/lib/cookies";
import { formatEventDateShort } from "@/lib/dates";

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
        <div>
          <h1 className="admin-page-title">Offers</h1>
          <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.42)", margin: "4px 0 0", maxWidth: 560, lineHeight: 1.5 }}>
            What each show is worth before it happens. Gross potential is figured on the
            sellable cap — the room less comps and kills — which is the same number the
            create-a-show rail prices against.
          </p>
        </div>
        <Link href="/admin/offers/new" className="admin-header-btn">
          + New offer
        </Link>
      </div>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading offers…</p>}

      {!loading && offers.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No offers yet. Click &quot;+ New offer&quot; to create one.
        </p>
      )}

      {!loading && offers.length > 0 && (
        <div className="ofr" style={{ marginTop: 18 }}>
          <div className="ofr-head">
            <div>Artist</div>
            <div>Gross potential</div>
            <div>Guarantee</div>
            <div>Deal</div>
            <div>Status</div>
          </div>

          {offers.map((offer) => {
            const status = (offer.status || "draft").toLowerCase();
            return (
              // The row is a Link, so Delete cannot be nested inside it —
              // a button inside an anchor is invalid, and the whole row would
              // navigate on the way to the button. It sits alongside instead.
              <div key={offer.id} className="ofr-line">
              <Link href={`/admin/offers/${offer.id}`} className="ofr-row">
                <div style={{ minWidth: 0 }}>
                  <div className="ofr-artist">{offer.artist_name}</div>
                  <div className="ofr-meta">
                    {offer.venue || "No venue"} ·{" "}
                    {offer.event_date ? formatEventDateShort(offer.event_date) : "No date"}
                  </div>
                </div>
                {/* Gross potential is the number an offer is argued over — it
                    leads, and the guarantee sits beside it for the comparison
                    that actually gets made. */}
                <div className="ofr-num ofr-num--strong">
                  {offer.gross_potential ? `$${Number(offer.gross_potential).toLocaleString()}` : "—"}
                </div>
                <div className="ofr-num">
                  {offer.guarantee ? `$${Number(offer.guarantee).toLocaleString()}` : "—"}
                </div>
                <div className="ofr-num">{offer.deal_type || "—"}</div>
                <div className={`ofr-status ofr-status--${status}`}>{status}</div>
              </Link>
              <button
                className="ofr-delete"
                title={`Delete the ${offer.artist_name} offer`}
                onClick={() => handleDelete(offer.id)}
              >
                ✕
              </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
