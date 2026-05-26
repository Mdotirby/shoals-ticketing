"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { BidderSession } from "@/lib/types/auction";
import { useOperator } from "@/app/components/OperatorContext";

type ItemData = {
  id: string;
  name: string;
  starting_bid: number;
  min_increment: number;
  current_bid: number | null;
  current_winner_id: string | null;
  current_winner_name: string | null;
  bid_count: number;
  auction_id: string;
};

type AuctionInfo = {
  name: string;
  logo_url: string | null;
  auction_close: string;
  status: string;
};

function getBidderSession(auctionId: string): BidderSession | null {
  try {
    const raw = localStorage.getItem(`vc-auction-${auctionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function AuctionItemBidPage() {
  const operator = useOperator();
  const params = useParams();
  const router = useRouter();
  const auctionId = params.auctionId as string;
  const itemId = params.itemId as string;

  const [item, setItem] = useState<ItemData | null>(null);
  const [auction, setAuction] = useState<AuctionInfo | null>(null);
  const [session, setSession] = useState<BidderSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [bidding, setBidding] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [customBid, setCustomBid] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const loadItem = useCallback(async () => {
    const res = await fetch(`/api/auctions/${auctionId}/items`);
    if (!res.ok) return;
    const items = await res.json();
    const found = items.find((i: ItemData) => i.id === itemId);
    if (found) setItem(found);
  }, [auctionId, itemId]);

  useEffect(() => {
    const sess = getBidderSession(auctionId);
    setSession(sess);

    Promise.all([
      loadItem(),
      fetch(`/api/auctions/${auctionId}`).then((r) => r.json()),
    ]).then(([, auctionData]) => {
      if (auctionData.name) setAuction(auctionData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [auctionId, loadItem]);

  // ── Realtime subscription for item updates ──
  useEffect(() => {
    const supabase = getSupabaseBrowser();

    const channel = supabase
      .channel(`item-${itemId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auction_items", filter: `id=eq.${itemId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const updated = payload.new as Record<string, unknown>;
          setItem((prev) =>
            prev
              ? {
                  ...prev,
                  current_bid: updated.current_bid as number | null,
                  current_winner_id: updated.current_winner_id as string | null,
                }
              : prev
          );
          // Reload to get winner name
          loadItem();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [itemId, loadItem]);

  // ── Realtime for auction close time changes (anti-snipe) ──
  useEffect(() => {
    const supabase = getSupabaseBrowser();

    const channel = supabase
      .channel(`auction-${auctionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${auctionId}` },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const updated = payload.new as Record<string, unknown>;
          setAuction((prev) =>
            prev
              ? { ...prev, auction_close: updated.auction_close as string, status: updated.status as string }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId]);

  const minBid = item
    ? item.current_bid
      ? item.current_bid + item.min_increment
      : item.starting_bid
    : 0;

  const isWinning = session && item?.current_winner_id === session.bidder_id;
  const isOpen = auction?.status === "open" || auction?.status === "published";

  const handleQuickBid = () => {
    setBidAmount(minBid.toFixed(2));
    setCustomBid(false);
    setShowConfirm(true);
  };

  const handleCustomBid = () => {
    if (!bidAmount || parseFloat(bidAmount) < minBid) {
      setError(`Bid must be at least $${minBid.toFixed(2)}`);
      return;
    }
    setShowConfirm(true);
  };

  const confirmBid = async () => {
    if (!session) {
      router.push(`/auction/${auctionId}/register?return=/auction/${auctionId}/items/${itemId}`);
      return;
    }

    setBidding(true);
    setError("");
    setSuccessMsg("");
    setShowConfirm(false);

    const res = await fetch(`/api/auctions/${auctionId}/bid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        item_id: itemId,
        bidder_id: session.bidder_id,
        amount: parseFloat(bidAmount),
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to place bid.");
      setBidding(false);
      return;
    }

    const result = await res.json();
    setSuccessMsg(
      result.time_extended
        ? `Bid placed! $${parseFloat(bidAmount).toFixed(2)} — Time extended due to anti-snipe protection.`
        : `Bid placed! $${parseFloat(bidAmount).toFixed(2)}`
    );
    setBidAmount("");
    setCustomBid(false);
    setBidding(false);
    loadItem();
  };

  if (loading) {
    return <div className="auction-loading">Loading item…</div>;
  }

  if (!item || !auction) {
    return <div className="auction-loading">Item not found.</div>;
  }

  return (
    <div className="auction-page auction-item-page">
      {/* Header */}
      <header className="auction-header auction-header-compact">
        {auction.logo_url && (
          <img src={auction.logo_url} alt="Logo" className="auction-logo auction-logo-sm" />
        )}
        <Link href={`/auction/${auctionId}`} className="auction-back-link">
          ← {auction.name}
        </Link>
      </header>

      {/* Item Card */}
      <div className="auction-bid-card">
        <h1 className="auction-bid-item-name">{item.name}</h1>

        <div className="auction-bid-price-block">
          <div className="auction-bid-current">
            <span className="auction-bid-label">
              {item.current_bid ? "Current Bid" : "Starting Bid"}
            </span>
            <span className="auction-bid-amount">
              ${(item.current_bid || item.starting_bid).toFixed(2)}
            </span>
          </div>
          <div className="auction-bid-info">
            <span>{item.bid_count} bid{item.bid_count !== 1 ? "s" : ""}</span>
            <span>Min +${item.min_increment.toFixed(2)}</span>
          </div>
        </div>

        {/* Status messages */}
        {isWinning && (
          <div className="auction-bid-status auction-bid-winning">
            You&apos;re currently the highest bidder!
          </div>
        )}

        {!isWinning && item.current_winner_name && session && (
          <div className="auction-bid-status auction-bid-outbid">
            {item.current_winner_name} outbid you…keep bidding?
          </div>
        )}

        {error && <div className="auction-error">{error}</div>}
        {successMsg && <div className="auction-success">{successMsg}</div>}

        {/* Bid Actions */}
        {isOpen && !isWinning && (
          <div className="auction-bid-actions">
            {/* Quick Bid */}
            <button
              onClick={handleQuickBid}
              disabled={bidding}
              className="auction-btn auction-btn-primary auction-btn-large"
            >
              {bidding ? "Placing…" : `Bid $${minBid.toFixed(2)}`}
            </button>

            {/* Custom Bid Toggle */}
            {!customBid ? (
              <button
                onClick={() => { setCustomBid(true); setBidAmount(""); }}
                className="auction-btn auction-btn-outline"
              >
                Custom Amount
              </button>
            ) : (
              <div className="auction-custom-bid">
                <input
                  type="number"
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  className="auction-input auction-bid-input"
                  placeholder={`Min $${minBid.toFixed(2)}`}
                  min={minBid}
                  step="0.01"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCustomBid();
                    }
                  }}
                />
                <button
                  onClick={handleCustomBid}
                  disabled={bidding}
                  className="auction-btn auction-btn-primary"
                >
                  Place Bid
                </button>
              </div>
            )}
          </div>
        )}

        {!isOpen && (
          <div className="auction-bid-closed">
            {auction.status === "closed" || auction.status === "settled"
              ? "Bidding has ended."
              : "Bidding has not started yet."}
          </div>
        )}

        {!session && isOpen && (
          <Link
            href={`/auction/${auctionId}/register?return=/auction/${auctionId}/items/${itemId}`}
            className="auction-btn auction-btn-primary auction-btn-large"
          >
            Register to Bid
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="auction-item-nav">
        <Link href={`/auction/${auctionId}`} className="auction-nav-link">
          All Items
        </Link>
        {session && (
          <Link href={`/auction/${auctionId}/dashboard`} className="auction-nav-link">
            My Dashboard
          </Link>
        )}
      </nav>

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="auction-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="auction-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="auction-modal-title">Confirm Your Bid</h3>
            <p className="auction-modal-text">
              You&apos;re about to bid <strong>${parseFloat(bidAmount).toFixed(2)}</strong> on{" "}
              <strong>{item.name}</strong>.
            </p>
            <div className="auction-modal-actions">
              <button
                onClick={confirmBid}
                disabled={bidding}
                className="auction-btn auction-btn-primary"
              >
                {bidding ? "Placing…" : "Confirm Bid"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="auction-btn auction-btn-outline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="auction-footer">
        {operator.slug === "venuecore" && <span>Powered by <strong>VenueCore</strong></span>}
      </footer>
    </div>
  );
}
