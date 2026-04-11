"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { trackFbEvent } from "@/lib/fbq";
import { formatEventDateFull, formatEventTime } from "@/lib/dates";

type TicketType = {
  id: string;
  name: string;
  basePrice: number;
  allInPrice: number;
  capacity: number;
};

type EventData = {
  id: string;
  title: string;
  venue: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  imageUrl: string | null;
  description: string | null;
  isFree: boolean;
  onSaleAt: string | null;
};

type Props = {
  event: EventData;
  ticketTypes: TicketType[];
  attendeeCount: number;
};

export default function EventLandingPage({ event, ticketTypes, attendeeCount }: Props) {
  const searchParams = useSearchParams();
  const [quantity, setQuantity] = useState(1);
  const [selectedTierId, setSelectedTierId] = useState(ticketTypes[0]?.id ?? "");
  const [onSaleCountdown, setOnSaleCountdown] = useState<string | null>(null);
  const [ticketsOnSale, setTicketsOnSale] = useState(true);
  const [isCtaVisible, setIsCtaVisible] = useState(false);

  const selectedTier = ticketTypes.find((t) => t.id === selectedTierId) ?? ticketTypes[0];
  const displayPrice = selectedTier ? selectedTier.allInPrice : 0;
  const isFree = event.isFree || displayPrice === 0;

  // ── Persist tracking ref ──────────────────────────────────────────────────
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      sessionStorage.setItem("vc_tracking_ref", ref);
    }
  }, [searchParams]);

  // ── Track page view ───────────────────────────────────────────────────────
  useEffect(() => {
    let sessionId = sessionStorage.getItem("vc_session");
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("vc_session", sessionId);
    }

    const urlParams = new URLSearchParams(window.location.search);

    // Record landing page view
    fetch(`/api/landing/${event.id}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        referrer_url: document.referrer || null,
        utm_source: urlParams.get("utm_source") || null,
        utm_medium: urlParams.get("utm_medium") || null,
        utm_campaign: urlParams.get("utm_campaign") || null,
        ref: urlParams.get("ref") || null,
      }),
    }).catch(() => {});

    // Fire Meta Pixel ViewContent
    trackFbEvent("ViewContent", {
      content_name: event.title,
      content_ids: [event.id],
      content_type: "product",
      value: displayPrice,
      currency: "USD",
    });
  }, [event.id, event.title, displayPrice]);

  // ── On-sale countdown timer ───────────────────────────────────────────────
  useEffect(() => {
    if (!event.onSaleAt) {
      setTicketsOnSale(true);
      return;
    }
    const onSaleTime = new Date(event.onSaleAt).getTime();

    function updateCountdown() {
      const now = Date.now();
      const diff = onSaleTime - now;
      if (diff <= 0) {
        setTicketsOnSale(true);
        setOnSaleCountdown(null);
        return;
      }
      setTicketsOnSale(false);
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      const parts: string[] = [];
      if (days > 0) parts.push(`${days}d`);
      parts.push(`${hours}h`);
      parts.push(`${minutes}m`);
      parts.push(`${seconds}s`);
      setOnSaleCountdown(parts.join(" "));
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [event.onSaleAt]);

  // ── Sticky CTA visibility on scroll ───────────────────────────────────────
  useEffect(() => {
    const handleScroll = () => {
      setIsCtaVisible(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── CTA click handler ─────────────────────────────────────────────────────
  const handleGetTickets = useCallback(() => {
    if (!ticketsOnSale) return;

    // Fire Meta Pixel
    trackFbEvent("InitiateCheckout", {
      content_name: event.title,
      content_ids: [event.id],
      value: displayPrice * quantity,
      currency: "USD",
      num_items: quantity,
    });

    // Build checkout URL
    const trackingRef = sessionStorage.getItem("vc_tracking_ref");
    let url = `/checkout?event=${event.id}&qty=${quantity}`;
    if (trackingRef) url += `&ref=${encodeURIComponent(trackingRef)}`;

    window.location.href = url;
  }, [event.id, event.title, displayPrice, quantity, ticketsOnSale]);

  const showTime = formatEventTime(event.date);
  const eventDate = formatEventDateFull(event.date);

  // Social proof text
  const socialProofText =
    attendeeCount >= 10
      ? `${attendeeCount}+ people already going`
      : attendeeCount > 0
        ? "Selling fast"
        : "Be the first to get tickets";

  // Check if event is in the past
  const isPast = new Date(event.date) < new Date();

  return (
    <main className="lp-main">
      {/* ── HERO SECTION ────────────────────────────────────────────────── */}
      <section className="lp-hero">
        {event.imageUrl ? (
          <div className="lp-hero-image-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={event.imageUrl}
              alt={event.title}
              className="lp-hero-image"
            />
            <div className="lp-hero-gradient" />
          </div>
        ) : (
          <div className="lp-hero-fallback" />
        )}

        <div className="lp-hero-content">
          <h1 className="lp-headline">{event.title}</h1>
          <p className="lp-subheadline">
            {isPast ? "This event has passed" : "Don\u2019t miss out \u2014 limited availability"}
          </p>

          <div className="lp-meta">
            <span className="lp-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {eventDate}
            </span>
            {showTime && (
              <span className="lp-meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {showTime}
              </span>
            )}
            <span className="lp-meta-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {event.venue}
            </span>
          </div>

          {/* Price */}
          {!isPast && (
            <div className="lp-price-block">
              {isFree ? (
                <span className="lp-price">FREE</span>
              ) : (
                <>
                  <span className="lp-price">${displayPrice.toFixed(2)}</span>
                  <span className="lp-price-label">ALL-IN &middot; No hidden fees</span>
                </>
              )}
            </div>
          )}

          {/* Countdown or CTA */}
          {isPast ? (
            <div className="lp-past-banner">This event has already taken place</div>
          ) : !ticketsOnSale ? (
            <div className="lp-countdown">
              <span className="lp-countdown-label">Tickets on sale in</span>
              <span className="lp-countdown-timer">{onSaleCountdown}</span>
            </div>
          ) : (
            <>
              {/* Tier selector (only if multiple tiers) */}
              {ticketTypes.length > 1 && (
                <div className="lp-tier-selector">
                  {ticketTypes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className={`lp-tier-btn ${t.id === selectedTierId ? "lp-tier-btn-active" : ""}`}
                      onClick={() => setSelectedTierId(t.id)}
                    >
                      <span className="lp-tier-name">{t.name}</span>
                      <span className="lp-tier-price">${t.allInPrice.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Quantity + CTA */}
              <div className="lp-cta-row">
                <div className="lp-qty-control">
                  <button
                    type="button"
                    className="lp-qty-btn"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={quantity <= 1}
                  >
                    &minus;
                  </button>
                  <span className="lp-qty-value">{quantity}</span>
                  <button
                    type="button"
                    className="lp-qty-btn"
                    onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className="lp-cta-btn"
                  onClick={handleGetTickets}
                >
                  {isFree ? "Get Free Tickets" : `Get Tickets \u2014 $${(displayPrice * quantity).toFixed(2)}`}
                </button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── MID SECTION — Why you can't miss this ─────────────────────── */}
      {!isPast && (
        <section className="lp-mid">
          <h2 className="lp-mid-heading">Why You Can&apos;t Miss This</h2>
          <div className="lp-bullets">
            <div className="lp-bullet">
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
              <div>
                <div className="lp-bullet-title">Unforgettable Experience</div>
                <div className="lp-bullet-desc">A live event you&apos;ll be talking about for weeks</div>
              </div>
            </div>
            <div className="lp-bullet">
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <div className="lp-bullet-title">Limited Availability</div>
                <div className="lp-bullet-desc">Tickets are going fast &mdash; don&apos;t wait</div>
              </div>
            </div>
            <div className="lp-bullet">
              <div className="lp-bullet-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <div className="lp-bullet-title">Join the Crowd</div>
                <div className="lp-bullet-desc">{socialProofText}</div>
              </div>
            </div>
          </div>

          {/* Artist / description */}
          {event.description && (
            <div className="lp-about">
              <h3 className="lp-about-heading">About the Event</h3>
              <p className="lp-about-text">{event.description}</p>
            </div>
          )}
        </section>
      )}

      {/* ── SOCIAL PROOF BANNER ───────────────────────────────────────── */}
      {!isPast && attendeeCount >= 5 && (
        <section className="lp-social-proof">
          <div className="lp-social-proof-inner">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>{attendeeCount}+ people already have their tickets</span>
          </div>
        </section>
      )}

      {/* ── BOTTOM CTA SECTION ─────────────────────────────────────── */}
      {!isPast && ticketsOnSale && (
        <section className="lp-bottom-cta">
          <p className="lp-bottom-cta-text">Ready to secure your spot?</p>
          <button type="button" className="lp-cta-btn lp-cta-btn-lg" onClick={handleGetTickets}>
            Get Tickets &mdash; {isFree ? "Free" : `$${(displayPrice * quantity).toFixed(2)}`}
          </button>
        </section>
      )}

      {/* ── STICKY MOBILE CTA ────────────────────────────────────────── */}
      {!isPast && ticketsOnSale && (
        <div className={`lp-sticky-bar ${isCtaVisible ? "lp-sticky-bar-visible" : ""}`}>
          <div className="lp-sticky-price">
            {isFree ? "Free" : `$${displayPrice.toFixed(2)}`}
            {!isFree && <span className="lp-sticky-price-label">ALL-IN</span>}
          </div>
          <button type="button" className="lp-sticky-cta" onClick={handleGetTickets}>
            Get Tickets
          </button>
        </div>
      )}
    </main>
  );
}
