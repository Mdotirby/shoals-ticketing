"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";
import type { Auction, AuctionStatus } from "@/lib/types/auction";

const STATUS_COLORS: Record<AuctionStatus, string> = {
  draft: "#888",
  published: "#3b82f6",
  open: "#22c55e",
  closed: "#f59e0b",
  settled: "#8b5cf6",
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
        <h1 className="admin-page-title">Auctions</h1>
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
          {auctions.map((auction) => (
            <div key={auction.id} className="auction-card">
              <div className="auction-card-header">
                <h3 className="auction-card-title">{auction.name}</h3>
                <span
                  className="auction-status-badge"
                  style={{ background: STATUS_COLORS[auction.status] }}
                >
                  {auction.status}
                </span>
              </div>

              {auction.venue_name && (
                <p className="auction-card-venue">{auction.venue_name}</p>
              )}
              {auction.event_title && (
                <p className="auction-card-event">Event: {auction.event_title}</p>
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

              <div className="auction-card-meta">
                <span>Fee: {auction.host_fee_percent}%</span>
                <span>Anti-snipe: {auction.anti_snipe_enabled ? "On" : "Off"}</span>
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
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
