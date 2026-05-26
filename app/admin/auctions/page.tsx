"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import type { Auction, AuctionStatus } from "@/lib/types/auction";

const STATUS_BADGE: Record<AuctionStatus, { cls: string; dot: string; label: string }> = {
  draft:     { cls: "auction-badge-draft",     dot: "#71717a", label: "Draft" },
  published: { cls: "auction-badge-published", dot: "#60a5fa", label: "Published" },
  open:      { cls: "auction-badge-open",      dot: "#4ade80", label: "Open" },
  closed:    { cls: "auction-badge-closed",    dot: "#fbbf24", label: "Closed" },
  settled:   { cls: "auction-badge-settled",   dot: "#a78bfa", label: "Settled" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function AdminAuctionsPage() {
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [loading, setLoading] = useState(true);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await fetch(`/api/auctions/${id}`, { method: "DELETE" });
    setAuctions((prev) => prev.filter((a) => a.id !== id));
  };

  useEffect(() => {
    const venueId = getCookie("venue-id");
    const url = venueId ? `/api/auctions?venue_id=${venueId}` : "/api/auctions";
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAuctions(data);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="admin-page-loading">Loading auctions…</div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Auctions</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginTop: 2 }}>
            {auctions.length} auction{auctions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link href="/admin/auctions/new" className="admin-btn admin-btn-primary">
          + New Auction
        </Link>
      </div>

      {auctions.length === 0 ? (
        <div className="admin-empty-state">
          <p>No auctions yet. Create your first auction to get started.</p>
        </div>
      ) : (
        <div className="auction-cards-grid">
          {auctions.map((auction) => {
            const badge = STATUS_BADGE[auction.status] ?? STATUS_BADGE.draft;
            return (
              <div key={auction.id} className="auction-card">
                <div className="auction-card-header">
                  <h3 className="auction-card-title">{auction.name}</h3>
                  <span className={`auction-status-badge ${badge.cls}`}>
                    <span className="auction-badge-dot" style={{ background: badge.dot }} />
                    {badge.label}
                  </span>
                </div>

                {(auction.venue_name || auction.event_title) && (
                  <div style={{ marginBottom: 10 }}>
                    {auction.venue_name && (
                      <p className="auction-card-venue">{auction.venue_name}</p>
                    )}
                    {auction.event_title && (
                      <p className="auction-card-event" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {auction.event_title}
                      </p>
                    )}
                  </div>
                )}

                <div className="auction-card-dates">
                  <div className="auction-card-date">
                    <span className="auction-date-label">Opens</span>
                    <span>{formatDate(auction.auction_open)}</span>
                  </div>
                  <div className="auction-card-date">
                    <span className="auction-date-label">Closes</span>
                    <span>{formatDate(auction.auction_close)}</span>
                  </div>
                </div>

                <div className="auction-card-tags">
                  <span className="auction-card-tag">Fee {auction.host_fee_percent}%</span>
                  {auction.anti_snipe_enabled && (
                    <span className="auction-card-tag auction-card-tag-gold">
                      Anti-snipe {auction.anti_snipe_minutes}m
                    </span>
                  )}
                </div>

                <div className="auction-card-actions">
                  <Link
                    href={`/admin/auctions/${auction.id}/edit`}
                    className="admin-btn admin-btn-sm"
                  >
                    Edit
                  </Link>
                  <Link
                    href={`/admin/auctions/${auction.id}/reports`}
                    className="admin-btn admin-btn-sm admin-btn-outline"
                  >
                    Reports
                  </Link>
                  {auction.status === "draft" && (
                    <button
                      onClick={() => handleDelete(auction.id, auction.name)}
                      className="admin-btn admin-btn-sm admin-btn-danger"
                      style={{ marginLeft: "auto" }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
