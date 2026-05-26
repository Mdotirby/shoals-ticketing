"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { BidderSession } from "@/lib/types/auction";
import { useOperator } from "@/app/components/OperatorContext";

type ItemStatus = {
  id: string;
  name: string;
  starting_bid: number;
  min_increment: number;
  current_bid: number | null;
  current_winner_id: string | null;
  current_winner_name: string | null;
  bid_count: number;
  my_highest_bid: number;
  is_winning: boolean;
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

function CountdownTimer({ closeTime }: { closeTime: string }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [progress, setProgress] = useState(1);
  const COUNTDOWN_WINDOW = 120; // 2 minutes in seconds

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const close = new Date(closeTime).getTime();
      const diff = close - now;

      if (diff <= 0) {
        setTimeLeft("Closed");
        setProgress(0);
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;

      if (totalSec <= COUNTDOWN_WINDOW) {
        setTimeLeft(`${min}:${sec.toString().padStart(2, "0")}`);
        setProgress(totalSec / COUNTDOWN_WINDOW);
      } else {
        const hrs = Math.floor(min / 60);
        const remainMin = min % 60;
        setTimeLeft(
          hrs > 0
            ? `${hrs}h ${remainMin}m`
            : `${remainMin}m ${sec.toString().padStart(2, "0")}s`
        );
        setProgress(1);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [closeTime]);

  const isUrgent = progress < 1;

  return (
    <div className={`auction-countdown ${isUrgent ? "auction-countdown-urgent" : ""}`}>
      <span className="auction-countdown-label">
        {timeLeft === "Closed" ? "Auction Closed" : "Time Remaining"}
      </span>
      <span className="auction-countdown-time">{timeLeft}</span>
      {isUrgent && (
        <div className="auction-countdown-bar">
          <div
            className="auction-countdown-bar-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export default function AuctionDashboardPage() {
  const operator = useOperator();
  const params = useParams();
  const router = useRouter();
  const auctionId = params.auctionId as string;

  const [session, setSession] = useState<BidderSession | null>(null);
  const [auction, setAuction] = useState<AuctionInfo | null>(null);
  const [myItems, setMyItems] = useState<ItemStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (bidderId: string) => {
    const [auctionRes, itemsRes] = await Promise.all([
      fetch(`/api/auctions/${auctionId}`).then((r) => r.json()),
      // bidder_id filter returns only items this bidder has bid on, with my_highest_bid
      fetch(`/api/auctions/${auctionId}/items?bidder_id=${bidderId}`).then((r) => r.json()),
    ]);

    if (auctionRes.name) setAuction(auctionRes);

    if (Array.isArray(itemsRes)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemStatuses: ItemStatus[] = itemsRes.map((item: any) => ({
        id: item.id as string,
        name: item.name as string,
        starting_bid: item.starting_bid as number,
        min_increment: item.min_increment as number,
        current_bid: item.current_bid as number | null,
        current_winner_id: item.current_winner_id as string | null,
        current_winner_name: item.current_winner_name as string | null,
        bid_count: item.bid_count as number,
        my_highest_bid: item.my_highest_bid as number ?? 0,
        is_winning: item.current_winner_id === bidderId,
      }));
      setMyItems(itemStatuses);
    }
  }, [auctionId]);

  useEffect(() => {
    const sess = getBidderSession(auctionId);
    if (!sess) {
      router.replace(`/auction/${auctionId}/register?return=/auction/${auctionId}/dashboard`);
      return;
    }
    setSession(sess);
    loadData(sess.bidder_id).finally(() => setLoading(false));
  }, [auctionId, router, loadData]);

  // ── Realtime: listen for item updates ──
  useEffect(() => {
    if (!session) return;
    const supabase = getSupabaseBrowser();

    const channel = supabase
      .channel(`dashboard-${auctionId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auction_items" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const updated = payload.new as Record<string, unknown>;
          setMyItems((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    current_bid: updated.current_bid as number | null,
                    current_winner_id: updated.current_winner_id as string | null,
                    is_winning: updated.current_winner_id === session.bidder_id,
                  }
                : item
            )
          );
          // Reload to get updated winner names
          loadData(session.bidder_id);
        }
      )
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
  }, [auctionId, session, loadData]);

  const isClosed = auction?.status === "closed" || auction?.status === "settled";
  const wonItems = myItems.filter((i) => i.is_winning);
  const lostItems = myItems.filter((i) => !i.is_winning && i.current_bid);

  if (loading) {
    return <div className="auction-loading">Loading dashboard…</div>;
  }

  if (!session || !auction) {
    return <div className="auction-loading">Loading…</div>;
  }

  return (
    <div className="auction-page auction-dashboard-page">
      {/* Header */}
      <header className="auction-header auction-header-compact">
        {auction.logo_url && (
          <img src={auction.logo_url} alt="Logo" className="auction-logo auction-logo-sm" />
        )}
        <div className="auction-header-info">
          <h1 className="auction-title-sm">{auction.name}</h1>
          <p className="auction-dashboard-greeting">
            Welcome, {session.first_name}!
          </p>
        </div>
        <CountdownTimer closeTime={auction.auction_close} />
      </header>

      {/* Nav */}
      <nav className="auction-nav">
        <Link href={`/auction/${auctionId}`} className="auction-nav-link">
          All Items
        </Link>
        {isClosed && wonItems.length > 0 && (
          <Link href={`/auction/${auctionId}/checkout`} className="auction-nav-link auction-nav-checkout">
            Go to Checkout
          </Link>
        )}
      </nav>

      {/* Post-auction messages */}
      {isClosed && (
        <div className="auction-dashboard-closed-banner">
          <h2>Auction has ended!</h2>
          {wonItems.length > 0 && (
            <p>You won {wonItems.length} item{wonItems.length !== 1 ? "s" : ""}. Proceed to checkout below.</p>
          )}
          {wonItems.length === 0 && (
            <p>Unfortunately you didn&apos;t win any items this time.</p>
          )}
        </div>
      )}

      {/* Items I'm winning */}
      {wonItems.length > 0 && (
        <section className="auction-dashboard-section">
          <h2 className="auction-dashboard-section-title">
            {isClosed ? "Items You Won" : "Items You're Winning"}
          </h2>
          <div className="auction-dashboard-items">
            {wonItems.map((item) => (
              <Link
                key={item.id}
                href={`/auction/${auctionId}/items/${item.id}`}
                className="auction-dashboard-card auction-dashboard-card-winning"
              >
                <h3 className="auction-dash-item-name">{item.name}</h3>
                <div className="auction-dash-item-price">
                  ${(item.current_bid || item.starting_bid).toFixed(2)}
                </div>
                <div className="auction-dash-item-status auction-dash-winning">
                  {isClosed
                    ? "Congratulations, You won this item!"
                    : "You're currently the highest bidder"}
                </div>
                {!isClosed && <CountdownTimer closeTime={auction.auction_close} />}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Items I've been outbid on */}
      {lostItems.length > 0 && (
        <section className="auction-dashboard-section">
          <h2 className="auction-dashboard-section-title">
            {isClosed ? "Items You Were Outbid On" : "Outbid — Keep Bidding!"}
          </h2>
          <div className="auction-dashboard-items">
            {lostItems.map((item) => (
              <Link
                key={item.id}
                href={`/auction/${auctionId}/items/${item.id}`}
                className="auction-dashboard-card auction-dashboard-card-outbid"
              >
                <h3 className="auction-dash-item-name">{item.name}</h3>
                <div className="auction-dash-item-price">
                  ${(item.current_bid || item.starting_bid).toFixed(2)}
                </div>
                <div className="auction-dash-item-status auction-dash-outbid">
                  {isClosed
                    ? "You were outbid on this item"
                    : `${item.current_winner_name || "Someone"} outbid you…keep bidding?`
                  }
                </div>
                {!isClosed && <CountdownTimer closeTime={auction.auction_close} />}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Checkout button after close */}
      {isClosed && wonItems.length > 0 && (
        <div className="auction-dashboard-checkout">
          <Link
            href={`/auction/${auctionId}/checkout`}
            className="auction-btn auction-btn-primary auction-btn-large"
          >
            Go to Checkout
          </Link>
        </div>
      )}

      <footer className="auction-footer">
        {operator.slug === "venuecore" && <span>Powered by <strong>VenueCore</strong></span>}
      </footer>
    </div>
  );
}
