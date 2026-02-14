"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Event } from "@/lib/types/event";
import { TicketType } from "@/lib/types/ticket";
import PurchaseTicketCard from "@/app/components/PurchaseTicketCard";
import OrderSummary from "@/app/components/OrderSummary";
import FAQAccordion from "@/app/components/FAQAccordion";
import Footer from "@/app/components/Footer";

export default function EventDetailPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch event details from Supabase via API
    fetch(`/api/events/${eventId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Event not found");
        return res.json();
      })
      .then((data) => {
        setEvent(data);

        // Build ticket types from the event's price field
        // Only show General Admission since VIP/Tables are not being sold
        // Later when ticket_types table exists, this will fetch from /api/events/[id]/ticket-types
        const gaTicket: TicketType = {
          id: `${data.id}-ga`,
          event_id: data.id,
          name: "General Admission",
          price: data.price,
          quantity_available: 500,
          quantity_sold: 0,
          sort_order: 0,
          perks: ["Full event access", "Standing room", "Venue amenities"],
        };

        setTicketTypes([gaTicket]);
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
    // TODO: Phase 3 — redirect to Stripe Checkout
    window.location.href = `/checkout?event=${eventId}&ticket_type=${selectedTicket.id}&qty=1`;
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
        {/* Hero section */}
        <section className="ticket-hero">
          <h1 className="ticket-hero-title">Get Your Ticket</h1>
        </section>

        {/* Ticket selection section */}
        <section className="ticket-selection-section">
          <div className="ticket-selection-header">
            <span className="ticket-selection-eyebrow">Book Your Ticket</span>
            <h2 className="ticket-selection-heading">Choose the Right One</h2>
          </div>

          <div className="ticket-selection-layout">
            {/* Left: Ticket cards */}
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

            {/* Right: Order summary */}
            <div className="order-summary-column">
              <OrderSummary
                selectedTicket={selectedTicket}
                quantity={1}
                onCheckout={handleCheckout}
              />
            </div>
          </div>
        </section>

        {/* FAQ section */}
        <FAQAccordion />
      </main>

      <Footer />
    </>
  );
}
