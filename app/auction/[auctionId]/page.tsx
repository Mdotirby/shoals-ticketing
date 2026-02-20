"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { BidderSession } from "@/lib/types/auction";

type AuctionInfo = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  auction_open: string;
  auction_close: string;
  status: string;
};

type ItemCard = {
  id: string;
  name: string;
  starting_bid: number;
  min_increment: number;
  current_bid: number | null;
  current_winner_name: string | null;
  bid_count: number;
};

function getBidderSession(auctionId: string): BidderSession | null {
  try {
    const raw = localStorage.getItem(`vc-auction-${auctionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AuctionLandingPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.auctionId as string;

  const [auction, setAuction] = useState<AuctionInfo | null>(null);
  const [items, setItems] = useState<ItemCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<BidderSession | null>(null);

  useEffect(() => {
    setSession(getBidderSession(auctionId));

    Promise.all([
      fetch(`/api/auctions/${auctionId}`).then((r) => r.json()),
      fetch(`/api/auctions/${auctionId}/items`).then((r) => r.json()),
    ]).then(([auctionData, itemsData]) => {
      if (auctionData.id) setAuction(auctionData);
      if (Array.isArray(itemsData)) setItems(itemsData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [auctionId]);

  if (loading) {
    return <div className="auction-loading">Loading auction…</div>;
  }

  if (!auction) {
    return <div className="auction-loading">Auction not found.</div>;
  }

  const isOpen = auction.status === "open" || auction.status === "published";
  const isClosed = auction.status === "closed" || auction.status === "settled";

  return (
    <div className="auction-page">
      {/* Header with logo */}
      <header className="auction-header">
        {auction.logo_url && (
          <img
            src={auction.logo_url}
            alt={`${auction.name} logo`}
            className="auction-logo"
          />
        )}
        <div className="auction-header-info">
          <h1 className="auction-title">{auction.name}</h1>
          {auction.description && (
            <p className="auction-description">{auction.description}</p>
          )}
          <div className="auction-status-row">
            <span className={`auction-status-pill auction-status-${auction.status}`}>
              {auction.status === "open" ? "Bidding Open" :
               auction.status === "closed" ? "Auction Closed" :
               auction.status === "published" ? "Coming Soon" :
               auction.status}
            </span>
            <span className="auction-item-count">{items.length} item{items.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </header>

      {/* Navigation bar */}
      <nav className="auction-nav">
        {session && (
          <>
            <Link href={`/auction/${auctionId}/dashboard`} className="auction-nav-link">
              My Bids
            </Link>
            {isClosed && (
              <Link href={`/auction/${auctionId}/checkout`} className="auction-nav-link auction-nav-checkout">
                Go to Checkout
              </Link>
            )}
          </>
        )}
        {!session && isOpen && (
          <Link href={`/auction/${auctionId}/register`} className="auction-nav-link auction-nav-register">
            Register to Bid
          </Link>
        )}
      </nav>

      {/* Items Grid */}
      <div className="auction-items-grid">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/auction/${auctionId}/items/${item.id}`}
            className="auction-item-tile"
          >
            <h3 className="auction-item-tile-name">{item.name}</h3>
            <div className="auction-item-tile-price">
              {item.current_bid
                ? <><span className="auction-price-label">Current Bid</span><span className="auction-price-value">${item.current_bid.toFixed(2)}</span></>
                : <><span className="auction-price-label">Starting Bid</span><span className="auction-price-value">${item.starting_bid.toFixed(2)}</span></>
              }
            </div>
            <div className="auction-item-tile-meta">
              <span>{item.bid_count} bid{item.bid_count !== 1 ? "s" : ""}</span>
              <span>+${item.min_increment.toFixed(2)} min</span>
            </div>
            {item.current_winner_name && (
              <p className="auction-item-tile-leader">
                Leading: {item.current_winner_name}
              </p>
            )}
          </Link>
        ))}
      </div>

      {items.length === 0 && (
        <div className="auction-empty">
          <p>No items have been added to this auction yet.</p>
        </div>
      )}

      {/* Footer */}
      <footer className="auction-footer">
        <span>Powered by <strong>VenueCore</strong></span>
      </footer>
    </div>
  );
}
