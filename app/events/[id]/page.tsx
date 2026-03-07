"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TicketType } from "@/lib/types/ticket";
import { Sponsor, SponsorTier } from "@/lib/types/sponsor";
import OrderSummary from "@/app/components/OrderSummary";
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { window.scrollTo(0, 0); }, []);

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
      .then((data: EventData) => {
        setEvent(data);

        if (data.venue_id) {
          fetch("/api/venues")
            .then((r) => r.json())
            .then((venues: Array<Record<string, unknown>>) => {
              if (!Array.isArray(venues)) return;
              const v = venues.find((x) => x.id === data.venue_id);
              if (v) {
                setVenueFees({
                  ticketing_fee: Number(v.ticketing_fee) || 3.0,
                  facility_fee: Number(v.facility_fee) || 0,
                  tax_rate: Number(v.tax_rate) || 0.095,
                });
                // Enrich event with venue location data
                const parts = [v.address_street, v.address_city, v.address_state, v.address_zip].filter(Boolean);
                const fullAddress = parts.length > 0 ? parts.join(", ") : "";
                setEvent((prev) => prev ? {
                  ...prev,
                  venue_address: fullAddress || prev.venue_address,
                  venue_phone: (v.buyer_phone as string) || prev.venue_phone,
                  venue_email: (v.buyer_email as string) || prev.venue_email,
                } : prev);
              }
            })
            .catch(() => {});
        }

        // Fetch event venue data (non-platform venues)
        if (data.event_venue_id) {
          import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
            const sb = getSupabaseBrowser();
            sb.from("event_venues")
              .select("*")
              .eq("id", data.event_venue_id)
              .single()
              .then(({ data: ev }: { data: Record<string, unknown> | null }) => {
                if (ev) {
                  setEvent((prev) => prev ? {
                    ...prev,
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

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId) ?? null;

  const handleCheckout = () => {
    if (!selectedTicket || !event) return;
    window.location.href = `/checkout?event=${eventId}&qty=${quantity}`;
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

                  {event.description && (
                    <p className="ticket-event-description">{event.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT: Order Summary */}
            <div className="order-summary-column">
              <OrderSummary
                selectedTicket={selectedTicket}
                quantity={quantity}
                ticketingFee={venueFees.ticketing_fee}
                facilityFee={venueFees.facility_fee}
                taxRate={venueFees.tax_rate}
                onCheckout={handleCheckout}
              />
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
                        <span className="venue-directions-info-icon">🚗</span>
                        <div>
                          <strong className="venue-directions-info-label">By Car</strong>
                          <p className="venue-directions-card-text">{event.venue_directions_car}</p>
                        </div>
                      </div>
                    )}
                    {event.venue_parking_info && (
                      <div className="venue-directions-info-block">
                        <span className="venue-directions-info-icon">🅿️</span>
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
