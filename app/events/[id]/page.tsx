"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TicketType } from "@/lib/types/ticket";
import { Sponsor, SponsorTier } from "@/lib/types/sponsor";
import PurchaseTicketCard from "@/app/components/PurchaseTicketCard";
import OrderSummary from "@/app/components/OrderSummary";
import FAQAccordion from "@/app/components/FAQAccordion";
import Footer from "@/app/components/Footer";

type EventData = {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
  image_url?: string;
  venue_id?: string;
};

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [venueFees, setVenueFees] = useState({ ticketing_fee: 3.0, tax_rate: 0.09 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Fetch sponsors for this event
  useEffect(() => {
    fetch(`/api/sponsors?event_id=${eventId}`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setSponsors(data);
      })
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Event not found");
        return res.json();
      })
      .then((data: EventData) => {
        setEvent(data);

        // Fetch venue-specific fees
        if (data.venue_id) {
          fetch("/api/venues")
            .then((r) => r.json())
            .then((venues: Array<Record<string, unknown>>) => {
              if (!Array.isArray(venues)) return;
              const v = venues.find((x) => x.id === data.venue_id);
              if (v) {
                setVenueFees({
                  ticketing_fee: Number(v.ticketing_fee) || 3.0,
                  tax_rate: Number(v.tax_rate) || 0.09,
                });
              }
            })
            .catch(() => {});
        }

        // Fetch real ticket tiers from the API
        fetch(`/api/events/${data.id}/ticket-types`)
          .then((r) => r.json())
          .then((tiers) => {
            if (Array.isArray(tiers) && tiers.length > 0) {
              setTicketTypes(tiers.map((t: { id: string; event_id: string; tier_name: string; price: number; capacity: number; sort_order: number }) => ({
                id: t.id,
                event_id: t.event_id,
                name: t.tier_name,
                price: t.price,
                quantity_available: t.capacity,
                quantity_sold: 0,
                sort_order: t.sort_order,
                perks: ["Full event access", "Venue amenities"],
              })));
            } else {
              // Fallback: single GA tier from event price
              setTicketTypes([{
                id: `${data.id}-ga`,
                event_id: data.id,
                name: `GA - ${data.title}`,
                price: data.price,
                quantity_available: 500,
                quantity_sold: 0,
                sort_order: 0,
                perks: ["Full event access", "Venue amenities"],
              }]);
            }
          })
          .catch(() => {
            setTicketTypes([{
              id: `${data.id}-ga`, event_id: data.id, name: `GA - ${data.title}`,
              price: data.price, quantity_available: 500, quantity_sold: 0, sort_order: 0,
              perks: ["Full event access"],
            }]);
          });
      })
      .catch(() => {
        setError("Could not load this event.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [eventId]);

  const selectedTicket =
    ticketTypes.find((t) => t.id === selectedTicketId) || null;

  const handleCheckout = () => {
    if (!selectedTicket || !event) return;
    window.location.href = `/checkout?event=${eventId}&qty=1`;
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

  return (
    <>
      <main className="ticket-page">
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">{event.title}</h1>
        </section>

        <section className="ticket-selection-section">
          <div className="ticket-selection-header">
            <span className="ticket-selection-eyebrow">Secure Your Spot</span>
            <h2 className="ticket-selection-heading">{event.venue}</h2>
          </div>

          <div className="ticket-selection-layout">
            <div className="ticket-cards-column">
              {ticketTypes.map((tt) => (
                <PurchaseTicketCard
                  key={tt.id}
                  ticketType={tt}
                  isSelected={selectedTicketId === tt.id}
                  onSelect={setSelectedTicketId}
                  venueName={event.venue}
                />
              ))}
            </div>

            <div className="order-summary-column">
              <OrderSummary
                selectedTicket={selectedTicket}
                quantity={1}
                ticketingFee={venueFees.ticketing_fee}
                taxRate={venueFees.tax_rate}
                onCheckout={handleCheckout}
              />
            </div>
          </div>
        </section>

        {/* ── Sponsors Section ── */}
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
                          <img
                            src={s.logo_url}
                            alt={s.name}
                            className={`sponsor-logo sponsor-logo-${tier}`}
                          />
                        ) : (
                          <span className={`sponsor-name-text sponsor-name-${tier}`}>
                            {s.name}
                          </span>
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
