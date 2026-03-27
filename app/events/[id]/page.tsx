"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { TicketType } from "@/lib/types/ticket";
import { Sponsor, SponsorTier } from "@/lib/types/sponsor";
import OrderSummary from "@/app/components/OrderSummary";
import SeatMap from "@/app/components/seating/SeatMap";
import type { SectionFull } from "@/lib/seating/types";
import PurchaseTicketCard from "@/app/components/PurchaseTicketCard";
import FAQAccordion from "@/app/components/FAQAccordion";
import EventBadges from "@/app/components/EventBadges";
import Footer from "@/app/components/Footer";
import { safeDate, formatEventDateFull, formatEventTime } from "@/lib/dates";

type FeaturedArtist = {
  id: string;
  name: string;
  avatar_url?: string;
  website_url?: string;
};

type Artist = {
  id: string;
  name: string;
  image_url?: string;
};

type EventData = {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
  image_url?: string;
  venue_id?: string;
  event_venue_id?: string;
  description?: string;
  age_restriction?: string;
  venue_lat?: number;
  venue_lng?: number;
  venue_phone?: string;
  venue_email?: string;
  venue_address?: string;
  venue_directions_car?: string;
  venue_parking_info?: string;
  venue_directions_transit?: string;
  artists?: Artist[];
  is_free?: boolean;
  on_sale_at?: string;
};

// Date helpers imported from @/lib/dates

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [featuredArtists, setFeaturedArtists] = useState<FeaturedArtist[]>([]);
  const [venueFees, setVenueFees] = useState({ ticketing_fee: 3.0, facility_fee: 0, tax_rate: 0.095 });
  const [hostedByName, setHostedByName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [freeRegName, setFreeRegName] = useState("");
  const [freeRegEmail, setFreeRegEmail] = useState("");
  const [freeRegLoading, setFreeRegLoading] = useState(false);
  const [onSaleCountdown, setOnSaleCountdown] = useState<string | null>(null);
  const [ticketsOnSale, setTicketsOnSale] = useState(true);
  const [reservedSeatingEnabled, setReservedSeatingEnabled] = useState(false);
  const [seatingSections, setSeatingSections] = useState<SectionFull[]>([]);
  const [seatingRoomW, setSeatingRoomW] = useState(100);
  const [seatingRoomH, setSeatingRoomH] = useState(60);
  const [selectedSeats, setSelectedSeats] = useState<{ seatId: string; sectionName: string; rowLabel: string; seatNumber: number; priceCents: number; color: string }[]>([]);
  const selectedSeatIds = new Set(selectedSeats.map((s) => s.seatId));

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // On-sale countdown timer
  useEffect(() => {
    if (!event?.on_sale_at) { setTicketsOnSale(true); return; }
    const onSaleTime = new Date(event.on_sale_at).getTime();

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
  }, [event?.on_sale_at]);

  // Track page view
  useEffect(() => {
    let sessionId = sessionStorage.getItem("vc_session");
    if (!sessionId) {
      sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("vc_session", sessionId);
    }
    // Capture UTM params and referrer for marketing attribution
    const urlParams = new URLSearchParams(window.location.search);
    fetch(`/api/events/${eventId}/views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        referrer_url: document.referrer || null,
        utm_source: urlParams.get("utm_source") || null,
        utm_medium: urlParams.get("utm_medium") || null,
        utm_campaign: urlParams.get("utm_campaign") || null,
      }),
    }).catch(() => {});
  }, [eventId]);

  // Fetch sponsors
  useEffect(() => {
    fetch(`/api/sponsors?event_id=${eventId}`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setSponsors(data); })
      .catch(() => {});
  }, [eventId]);

  // Check if reserved seating is enabled and load layout data
  useEffect(() => {
    fetch(`/api/seating/events/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.enabled && data.layout) {
          setReservedSeatingEnabled(true);
          setSeatingSections(data.layout.sections || []);
          setSeatingRoomW(data.layout.room_width_ft || 100);
          setSeatingRoomH(data.layout.room_height_ft || 60);
        }
      })
      .catch(() => {});
  }, [eventId]);

  // Seat click handler for inline SeatMap
  const handleSeatClick = useCallback((seatId: string, sectionId: string) => {
    setSelectedSeats((prev) => {
      const exists = prev.find((s) => s.seatId === seatId);
      if (exists) return prev.filter((s) => s.seatId !== seatId);
      const sec = seatingSections.find((s) => s.id === sectionId);
      if (!sec) return prev;
      const seat = sec.seats.find((s) => s.id === seatId);
      if (!seat || seat.status !== "available") return prev;
      return [...prev, {
        seatId: seat.id,
        sectionName: sec.name,
        rowLabel: seat.row_label,
        seatNumber: seat.seat_number,
        priceCents: sec.price_cents,
        color: sec.color,
      }];
    });
  }, [seatingSections]);

  // Fetch featured artists assigned to this event
  useEffect(() => {
    fetch(`/api/events/${eventId}/artists`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setFeaturedArtists(data); })
      .catch(() => {});
  }, [eventId]);

  // Fetch event + venue fees + ticket types
  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Event not found");
        return res.json();
      })
      .then((data: EventData & { facility_fee_enabled?: boolean }) => {
        setEvent(data);

        if (data.venue_id) {
          fetch("/api/venues")
            .then((r) => r.json())
            .then((venues: Array<Record<string, unknown>>) => {
              if (!Array.isArray(venues)) return;
              const v = venues.find((x) => x.id === data.venue_id);
              if (v) {
                // Save hosted by name from the venues (client/promoter) table
                if (v.name) setHostedByName(v.name as string);
                setVenueFees({
                  ticketing_fee: Number(v.ticketing_fee) || 3.0,
                  facility_fee: Number(v.facility_fee) || 0,
                  tax_rate: Number(v.tax_rate) || 0.095,
                });
                // Override facility fee if disabled on this event
                if (data.facility_fee_enabled === false) {
                  setVenueFees(prev => ({ ...prev, facility_fee: 0 }));
                }
                // Only use venues table address as fallback when there is NO event_venue_id.
                // The venues table holds the business/host address — customers should see
                // the event_venues location instead.
                if (!data.event_venue_id) {
                  const parts = [v.address_street, v.address_city, v.address_state, v.address_zip].filter(Boolean);
                  const fullAddress = parts.length > 0 ? parts.join(", ") : "";
                  setEvent((prev) => prev ? {
                    ...prev,
                    venue_address: fullAddress || prev.venue_address,
                    venue_phone: (v.buyer_phone as string) || prev.venue_phone,
                    venue_email: (v.buyer_email as string) || prev.venue_email,
                  } : prev);
                }
              }
            })
            .catch(() => {});
        }

        // Fetch event venue data (non-platform venues) — also read fees
        if (data.event_venue_id) {
          import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
            const sb = getSupabaseBrowser();
            sb.from("event_venues")
              .select("*")
              .eq("id", data.event_venue_id)
              .single()
              .then(({ data: ev }: { data: Record<string, unknown> | null }) => {
                if (ev) {
                  // Update fees from event_venues if present
                  setVenueFees((prev) => ({
                    ticketing_fee: ev.ticketing_fee != null ? Number(ev.ticketing_fee) : prev.ticketing_fee,
                    facility_fee: ev.facility_fee != null ? Number(ev.facility_fee) : prev.facility_fee,
                    tax_rate: ev.tax_rate != null ? Number(ev.tax_rate) : prev.tax_rate,
                  }));
                  // Override facility fee if disabled on this event
                  if (data.facility_fee_enabled === false) {
                    setVenueFees(prev => ({ ...prev, facility_fee: 0 }));
                  }
                  setEvent((prev) => prev ? {
                    ...prev,
                    // Use event_venues name as the customer-facing venue name
                    venue: (ev.name as string) || prev.venue,
                    venue_address: (ev.full_address as string) || prev.venue_address,
                    venue_lat: (ev.lat as number) || prev.venue_lat,
                    venue_lng: (ev.lng as number) || prev.venue_lng,
                    venue_phone: (ev.phone as string) || prev.venue_phone,
                    venue_email: (ev.email as string) || prev.venue_email,
                    venue_directions_car: (ev.directions_by_car as string) || prev.venue_directions_car,
                    venue_parking_info: (ev.parking_info as string) || prev.venue_parking_info,
                    venue_directions_transit: (ev.directions_public_transit as string) || prev.venue_directions_transit,
                  } : prev);
                }
              });
          });
        }

        fetch(`/api/events/${data.id}/ticket-types`)
          .then((r) => r.json())
          .then((tiers) => {
            if (Array.isArray(tiers) && tiers.length > 0) {
              const mapped = tiers.map((t: {
                id: string; event_id: string; tier_name: string;
                price: number; capacity: number; sort_order: number;
              }) => ({
                id: t.id,
                event_id: t.event_id,
                name: t.tier_name,
                price: t.price,
                quantity_available: t.capacity,
                quantity_sold: 0,
                sort_order: t.sort_order,
                perks: ["Full event access", "Venue amenities"],
              }));
              setTicketTypes(mapped);
              setSelectedTicketId(mapped[0]?.id ?? null);
            } else {
              const ga: TicketType = {
                id: `${data.id}-ga`,
                event_id: data.id,
                name: "General Admission",
                price: data.price,
                quantity_available: 500,
                quantity_sold: 0,
                sort_order: 0,
                perks: ["Full event access", "Venue amenities"],
              };
              setTicketTypes([ga]);
              setSelectedTicketId(ga.id);
            }
          })
          .catch(() => {
            const ga: TicketType = {
              id: `${data.id}-ga`, event_id: data.id, name: "General Admission",
              price: data.price, quantity_available: 500, quantity_sold: 0, sort_order: 0,
              perks: ["Full event access"],
            };
            setTicketTypes([ga]);
            setSelectedTicketId(ga.id);
          });
      })
      .catch(() => setError("Could not load this event."))
      .finally(() => setIsLoading(false));
  }, [eventId]);

  // Sync selected seats → ticket type + quantity for Order Summary
  useEffect(() => {
    if (!reservedSeatingEnabled || selectedSeats.length === 0) return;

    // Check if user selected a full table (all seats at same table)
    const tableLabels = selectedSeats.map((s) => s.rowLabel);
    const uniqueTables = [...new Set(tableLabels)];
    const isFullTable = uniqueTables.length === 1 && uniqueTables[0].startsWith("T") && (() => {
      const tableSec = seatingSections.find((sec) => sec.seats.some((s) => s.id === selectedSeats[0].seatId));
      if (!tableSec) return false;
      const tableSeats = tableSec.seats.filter((s) => s.row_label === uniqueTables[0]);
      return tableSeats.length === selectedSeats.length;
    })();

    const seatPrice = selectedSeats[0].priceCents / 100;

    // Try to find matching ticket type
    let bestMatch: string | null = null;

    if (isFullTable) {
      // Look for "full table" type first
      const fullTableType = ticketTypes.find((t) =>
        t.name.toLowerCase().includes("full table") || t.name.toLowerCase().includes("full tbl")
      );
      if (fullTableType) {
        bestMatch = fullTableType.id;
        setQuantity(1);
        setSelectedTicketId(bestMatch);
        return;
      }
    }

    // Find individual seat type matching the price
    const matchByPrice = ticketTypes.find((t) => Math.abs(t.price - seatPrice) < 0.01);
    if (matchByPrice) {
      bestMatch = matchByPrice.id;
    } else {
      // Find type with closest name match to the section name
      const sectionName = selectedSeats[0].sectionName.toLowerCase();
      const nameMatch = ticketTypes.find((t) => sectionName.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(sectionName));
      if (nameMatch) bestMatch = nameMatch.id;
    }

    if (!bestMatch && ticketTypes.length > 0) {
      bestMatch = ticketTypes[0].id;
    }

    if (bestMatch) {
      setSelectedTicketId(bestMatch);
    }
    setQuantity(selectedSeats.length);
  }, [selectedSeats, ticketTypes, reservedSeatingEnabled, seatingSections]);

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId) ?? null;
  const appliedPromoRef = useRef<string | null>(null);

  // Determine if this is a free event
  const isFreeEvent = event?.is_free === true || (event?.price === 0 && ticketTypes.every((t) => t.price === 0));

  const handleCheckout = () => {
    if (!event) return;
    // For assigned seating, use selected seats; for GA, use ticket quantity
    if (reservedSeatingEnabled && selectedSeats.length > 0) {
      const seatIds = selectedSeats.map((s) => s.seatId).join(",");
      let url = `/checkout?event=${eventId}&qty=${selectedSeats.length}&seat_ids=${seatIds}`;
      if (appliedPromoRef.current) url += `&promo_code=${encodeURIComponent(appliedPromoRef.current)}`;
      window.location.href = url;
      return;
    }
    if (!selectedTicket) return;
    let url = `/checkout?event=${eventId}&qty=${quantity}`;
    if (appliedPromoRef.current) {
      url += `&promo_code=${encodeURIComponent(appliedPromoRef.current)}`;
    }
    window.location.href = url;
  };

  const handleFreeCheckout = async (name: string, email: string) => {
    try {
      const res = await fetch("/api/checkout/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          buyer_name: name,
          buyer_email: email,
          quantity,
          promo_code: appliedPromoRef.current,
        }),
      });
      const data = await res.json();
      if (data.success && data.ticket_url) {
        window.location.href = data.ticket_url;
      }
    } catch {
      // silently fail — user can retry
    }
  };

  if (isLoading) {
    return (
      <main className="ticket-page">
        <div className="ticket-page-loading">Loading event...</div>
      </main>
    );
  }

  if (error || !event) {
    return (
      <main className="ticket-page">
        <div className="ticket-page-loading">{error || "Event not found."}</div>
      </main>
    );
  }

  const showTime = formatEventTime(event.date);
  const mapSrc = event.venue_lat && event.venue_lng
    ? `https://maps.google.com/maps?q=${event.venue_lat},${event.venue_lng}&z=15&output=embed`
    : event.venue_address
    ? `https://maps.google.com/maps?q=${encodeURIComponent(event.venue_address)}&z=15&output=embed`
    : null;

  return (
    <>
      <main className="ticket-page">

        {/* ── Section Header ── */}
        <section className="ticket-selection-header">
          <span className="ticket-selection-eyebrow">Secure Your Spot</span>
          <h2 className="ticket-selection-heading">{event.title}</h2>
        </section>

        {/* ── Side by side: Event Card + Order Summary ── */}
        <section className="ticket-selection-section">
          <div className="ticket-selection-layout">

            {/* LEFT: Event Detail Card */}
            <div className="ticket-cards-column">
              <div className="ticket-event-card">
                {/* Hero image with gradient fade */}
                {event.image_url && (
                  <div className="ticket-hero-image-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={event.image_url}
                      alt={event.title}
                      className="ticket-hero-image"
                    />
                    <div className="ticket-hero-gradient" />
                  </div>
                )}

                <div className="ticket-card-body">
                  <h1 className="ticket-hero-title">{event.title}</h1>
                  <p className="ticket-event-meta">
                    <span className="ticket-event-date">{formatEventDateFull(event.date)}</span>
                    {showTime && (
                      <>
                        <span className="ticket-event-meta-sep">·</span>
                        <span className="ticket-event-time">{showTime}</span>
                      </>
                    )}
                    <span className="ticket-event-meta-sep">·</span>
                    <span className="ticket-event-venue">{event.venue}</span>
                  </p>
                  {hostedByName && (
                    <p className="ticket-event-hosted-by" style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "4px 0 8px" }}>
                      Hosted by {hostedByName}
                    </p>
                  )}

                  <EventBadges
                    eventDate={event.date}
                    ageRestriction={event.age_restriction}
                  />

                  {/* Ticket type dropdown + quantity selector */}
                  <div className="ticket-selector-row">
                    <select
                      className="ticket-type-select"
                      value={selectedTicketId ?? ""}
                      onChange={(e) => setSelectedTicketId(e.target.value)}
                    >
                      {ticketTypes.map((tt) => (
                        <option key={tt.id} value={tt.id}>
                          {tt.name} — ${tt.price.toFixed(2)}
                        </option>
                      ))}
                    </select>
                    <div className="ticket-qty-control">
                      <button type="button" className="ticket-qty-btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>−</button>
                      <span className="ticket-qty-value">{quantity}</span>
                      <button type="button" className="ticket-qty-btn" onClick={() => setQuantity((q) => Math.min(10, q + 1))}>+</button>
                    </div>
                  </div>

                  {/* Inline seat map for assigned seating */}
                  {reservedSeatingEnabled && seatingSections.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 8 }}>
                        Tap seats on the map to select them
                      </p>
                      <div style={{ height: 350, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", marginBottom: 12 }}>
                        <SeatMap
                          sections={seatingSections}
                          roomWidthFt={seatingRoomW}
                          roomHeightFt={seatingRoomH}
                          interactive={true}
                          selectedSeatIds={selectedSeatIds}
                          onSeatClick={handleSeatClick}
                        />
                      </div>
                      {/* Legend */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                        {seatingSections.filter((s) => s.type !== "ga" || s.name !== "Stage").map((s) => (
                          <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, display: "inline-block" }} />
                            {s.name} — ${(s.price_cents / 100).toFixed(2)}
                          </span>
                        ))}
                      </div>
                      {/* Selected seats list */}
                      {selectedSeats.length > 0 && (
                        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 8, padding: 10, marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", marginBottom: 6 }}>
                            Your Seats ({selectedSeats.length})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {selectedSeats.map((s) => (
                              <div key={s.seatId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: 2, background: s.color, display: "inline-block" }} />
                                  {s.sectionName} · {s.rowLabel} · #{s.seatNumber}
                                </span>
                                <span style={{ color: "rgba(255,255,255,0.5)" }}>${(s.priceCents / 100).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 13, fontWeight: 700 }}>
                            <span>Total</span>
                            <span>${(selectedSeats.reduce((s, seat) => s + seat.priceCents, 0) / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {event.description && (
                    <p className="ticket-event-description">{event.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: Order Summary / Free Registration / Countdown */}
            <div className="order-summary-column">
              {!ticketsOnSale ? (
                /* ── On-Sale Countdown ── */
                <div style={{
                  background: "rgba(59,130,246,0.06)",
                  border: "1px solid rgba(59,130,246,0.2)",
                  borderRadius: 12,
                  padding: 24,
                  textAlign: "center",
                }}>
                  <p style={{ color: "#3b82f6", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    Tickets On Sale Soon
                  </p>
                  <p style={{ color: "#93c5fd", fontSize: 28, fontWeight: 800, fontFamily: "monospace", letterSpacing: 2 }}>
                    {onSaleCountdown}
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 8 }}>
                    Check back when the countdown ends!
                  </p>
                </div>
              ) : isFreeEvent ? (
                /* ── Free Event Registration ── */
                <div style={{
                  background: "rgba(34,197,94,0.06)",
                  border: "1px solid rgba(34,197,94,0.2)",
                  borderRadius: 12,
                  padding: 24,
                }}>
                  <p style={{ color: "#22c55e", fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
                    Free Event
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 16 }}>
                    Register below to get your free ticket.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input
                      type="text"
                      placeholder="Your Name"
                      value={freeRegName}
                      onChange={(e) => setFreeRegName(e.target.value)}
                      style={{
                        padding: "10px 14px", borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#fff", fontSize: 14,
                      }}
                    />
                    <input
                      type="email"
                      placeholder="Your Email"
                      value={freeRegEmail}
                      onChange={(e) => setFreeRegEmail(e.target.value)}
                      style={{
                        padding: "10px 14px", borderRadius: 8,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.04)",
                        color: "#fff", fontSize: 14,
                      }}
                    />
                    {/* Quantity selector */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>Qty:</span>
                      <div className="ticket-qty-control">
                        <button type="button" className="ticket-qty-btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1}>-</button>
                        <span className="ticket-qty-value">{quantity}</span>
                        <button type="button" className="ticket-qty-btn" onClick={() => setQuantity((q) => Math.min(10, q + 1))}>+</button>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        if (!freeRegName.trim() || !freeRegEmail.trim()) return;
                        setFreeRegLoading(true);
                        try {
                          const res = await fetch("/api/checkout/free", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              event_id: eventId,
                              buyer_name: freeRegName.trim(),
                              buyer_email: freeRegEmail.trim(),
                              quantity,
                              seat_ids: reservedSeatingEnabled ? selectedSeats.map((s) => s.seatId) : undefined,
                            }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            alert(data.error || "Registration failed");
                            return;
                          }
                          if (data.success) {
                            window.location.href = `/checkout/confirmation?order_id=${data.order_id}`;
                          }
                        } catch {
                          alert("Something went wrong. Please try again.");
                        } finally {
                          setFreeRegLoading(false);
                        }
                      }}
                      disabled={freeRegLoading || !freeRegName.trim() || !freeRegEmail.trim()}
                      style={{
                        padding: "14px 24px", borderRadius: 10,
                        border: "none",
                        background: freeRegLoading ? "rgba(34,197,94,0.3)" : "#22c55e",
                        color: "#fff", fontSize: 15, fontWeight: 700,
                        cursor: freeRegLoading ? "not-allowed" : "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {freeRegLoading ? "Registering..." : "Get Free Ticket"}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Normal Paid Checkout ── */
                <>
                  <OrderSummary
                    selectedTicket={selectedTicket}
                    quantity={quantity}
                    ticketingFee={venueFees.ticketing_fee}
                    facilityFee={venueFees.facility_fee}
                    taxRate={venueFees.tax_rate}
                    onCheckout={handleCheckout}
                    onPromoApplied={(code) => { appliedPromoRef.current = code; }}
                    onFreeCheckout={handleFreeCheckout}
                  />
                  {reservedSeatingEnabled && selectedSeats.length === 0 && (
                    <p style={{ fontSize: 12, color: "#a1a1aa", textAlign: "center", marginTop: 8, fontStyle: "italic" }}>
                      Select seats from the map to continue
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Featured Artists ── */}
        {featuredArtists.length > 0 && (
          <section className="event-featured-artists-section">
            <h2 className="event-featured-artists-heading">Featured Artists</h2>
            <div className="event-featured-artists-grid">
              {featuredArtists.map((artist) => {
                const Wrapper = artist.website_url ? "a" : "div";
                const wrapperProps = artist.website_url
                  ? { href: artist.website_url, target: "_blank", rel: "noopener noreferrer", style: { textDecoration: "none" } }
                  : {};
                return (
                  <Wrapper key={artist.id} className="event-featured-artist-card" {...wrapperProps}>
                    <div className="event-featured-artist-avatar">
                      {artist.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={artist.avatar_url} alt={artist.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <div className="event-featured-artist-placeholder" />
                      )}
                    </div>
                    <span className="event-featured-artist-name">{artist.name}</span>
                  </Wrapper>
                );
              })}
            </div>
          </section>
        )}

        {/* ── How to Get to the Venue ── */}
        {(mapSrc || event.venue_address) && (
          <section className="venue-directions-section">
            <span className="venue-directions-label">Getting Here</span>
            <h2 className="venue-directions-heading">How to Get to the Venue</h2>

            <div className="venue-directions-container">
              {mapSrc && (
                <div className="venue-directions-map-wrap">
                  <iframe
                    title="Venue location"
                    src={mapSrc}
                    className="venue-directions-map-iframe"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
              )}

              <div className="venue-directions-cards">
                {/* Address Card */}
                <div className="venue-directions-card venue-address-card">
                  <h3 className="venue-directions-card-title">Address</h3>
                  <p className="venue-directions-card-name">{event.venue}</p>
                  {event.venue_address && (
                    <p className="venue-directions-card-text">{event.venue_address}</p>
                  )}
                  {event.venue_phone && (
                    <a href={`tel:${event.venue_phone}`} className="venue-directions-card-link">
                      📞 {event.venue_phone}
                    </a>
                  )}
                  {event.venue_email && (
                    <a href={`mailto:${event.venue_email}`} className="venue-directions-card-link">
                      ✉️ {event.venue_email}
                    </a>
                  )}
                </div>

                {/* Directions & Parking Card */}
                {(event.venue_directions_car || event.venue_parking_info || event.venue_directions_transit) && (
                  <div className="venue-directions-card venue-parking-card">
                    <h3 className="venue-directions-card-title">Directions &amp; Parking</h3>
                    {event.venue_directions_car && (
                      <div className="venue-directions-info-block">
                        
                        <div>
                          <strong className="venue-directions-info-label">By Car</strong>
                          <p className="venue-directions-card-text">{event.venue_directions_car}</p>
                        </div>
                      </div>
                    )}
                    {event.venue_parking_info && (
                      <div className="venue-directions-info-block">

                        <div>
                          <strong className="venue-directions-info-label">Parking</strong>
                          <p className="venue-directions-card-text">{event.venue_parking_info}</p>
                        </div>
                      </div>
                    )}
                    {event.venue_directions_transit && (
                      <div className="venue-directions-info-block">
                        <span className="venue-directions-info-icon">🚌</span>
                        <div>
                          <strong className="venue-directions-info-label">Public Transport</strong>
                          <p className="venue-directions-card-text">{event.venue_directions_transit}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ── Sponsors ── */}
        {sponsors.length > 0 && (
          <section className="event-sponsors-section">
            <h2 className="event-sponsors-heading">Our Partners</h2>
            {(["title", "presenting", "supporting"] as SponsorTier[]).map((tier) => {
              const tierSponsors = sponsors.filter((s) => s.tier === tier);
              if (tierSponsors.length === 0) return null;
              return (
                <div key={tier} className={`sponsor-tier-group sponsor-tier-${tier}`}>
                  <h3 className="sponsor-tier-label">
                    {tier === "title" ? "Title Partner" : tier === "presenting" ? "Presenting Partners" : "Supporting Partners"}
                  </h3>
                  <div className="sponsor-logos-row">
                    {tierSponsors.map((s) => (
                      <a
                        key={s.id}
                        href={s.website_url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sponsor-logo-link"
                      >
                        {s.logo_url ? (
                          <img src={s.logo_url} alt={s.name} className={`sponsor-logo sponsor-logo-${tier}`} />
                        ) : (
                          <span className={`sponsor-name-text sponsor-name-${tier}`}>{s.name}</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        <FAQAccordion />
      </main>

      <Footer />
    </>
  );
}
