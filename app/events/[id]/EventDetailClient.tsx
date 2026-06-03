"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { TicketType } from "@/lib/types/ticket";
import { Sponsor, SponsorTier } from "@/lib/types/sponsor";
import OrderSummary from "@/app/components/OrderSummary";
import InlineCheckout from "@/app/components/InlineCheckout";
import SeatMap from "@/app/components/seating/SeatMap";
import type { SectionFull } from "@/lib/seating/types";
import PurchaseTicketCard from "@/app/components/PurchaseTicketCard";
import FAQAccordion from "@/app/components/FAQAccordion";
import EventBadges from "@/app/components/EventBadges";
import Footer from "@/app/components/Footer";
import { safeDate, formatEventDateFull, formatEventTime } from "@/lib/dates";
import { trackFbEvent } from "@/lib/fbq";
import { pastEventReason } from "@/lib/events/closeout";

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
  closed_out_at?: string | null;
  external_ticket_url?: string | null;
  external_ticket_label?: string | null;
  presaleAvailable?: boolean;
};

// Date helpers imported from @/lib/dates

export default function EventDetailClient() {
  const params = useParams();
  const eventId = params.id as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [ticketTypes, setTicketTypes] = useState<TicketType[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [featuredArtists, setFeaturedArtists] = useState<FeaturedArtist[]>([]);
  const [venueFees, setVenueFees] = useState({ ticketing_fee: 3.0, facility_fee: 0, tax_rate: 0.095, tax_method: "multiplier" as "multiplier" | "divisor" });
  const [hostedByName, setHostedByName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"browse" | "checkout">("browse");
  const [freeRegName, setFreeRegName] = useState("");
  const [freeRegEmail, setFreeRegEmail] = useState("");
  const [freeRegLoading, setFreeRegLoading] = useState(false);
  const [onSaleCountdown, setOnSaleCountdown] = useState<string | null>(null);
  const [ticketsOnSale, setTicketsOnSale] = useState(true);
  const [presaleUnlocked, setPresaleUnlocked] = useState(false);
  const [presalePanelVisible, setPresalePanelVisible] = useState(false);
  const [presaleCodeInput, setPresaleCodeInput] = useState("");
  const [presaleError, setPresaleError] = useState<string | null>(null);
  const [presaleLoading, setPresaleLoading] = useState(false);
  const [presaleShake, setPresaleShake] = useState(false);
  const [presaleType, setPresaleType] = useState<"artist" | "venue" | null>(null);
  const [otherEvents, setOtherEvents] = useState<{ id: string; title: string; venue: string; date: string; price: number; image_url?: string; is_free?: boolean }[]>([]);
  const [reservedSeatingEnabled, setReservedSeatingEnabled] = useState(false);
  const [seatingSections, setSeatingSections] = useState<SectionFull[]>([]);
  const [seatingRoomW, setSeatingRoomW] = useState(100);
  const [seatingRoomH, setSeatingRoomH] = useState(60);
  const [selectedSeats, setSelectedSeats] = useState<{ seatId: string; sectionName: string; rowLabel: string; seatNumber: number; priceCents: number; color: string }[]>([]);
  const [selectedTables, setSelectedTables] = useState<{ objectId: string; seatIds: string[]; tableLabel: string; seatCount: number; sectionName: string; priceCents: number; color: string }[]>([]);
  const selectedSeatIds = new Set([
    ...selectedSeats.map((s) => s.seatId),
    ...selectedTables.flatMap((t) => t.seatIds),
  ]);
  const hasSeatingSelection = selectedSeats.length > 0 || selectedTables.length > 0;

  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Restore presale session
  useEffect(() => {
    if (!eventId) return;
    try {
      const stored = sessionStorage.getItem(`vc_presale_${eventId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.unlocked) {
          setPresaleUnlocked(true);
          setPresaleType(parsed.type ?? null);
        }
      }
    } catch { /* ignore */ }
  }, [eventId]);

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

    // Persist trackable link ref slug so it survives navigation to /checkout
    const refSlug = urlParams.get("ref");
    if (refSlug) {
      sessionStorage.setItem("vc_tracking_ref", refSlug);
    }

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

  const handleTableClick = useCallback((seatIds: string[], sectionId: string, objectId: string) => {
    setSelectedTables((prev) => {
      const exists = prev.find((t) => t.objectId === objectId);
      if (exists) return prev.filter((t) => t.objectId !== objectId);
      const sec = seatingSections.find((s) => s.id === sectionId);
      if (!sec) return prev;
      const obj = sec.objects.find((o) => o.id === objectId);
      const tableNum = (obj?.metadata as { table_number?: number })?.table_number ?? "?";
      return [...prev, {
        objectId,
        seatIds,
        tableLabel: `Table ${tableNum}`,
        seatCount: seatIds.length,
        sectionName: sec.name,
        priceCents: sec.price_cents,
        color: sec.color,
      }];
    });
  }, [seatingSections]);

  // Presale code validation
  const handlePresaleUnlock = useCallback(async () => {
    const code = presaleCodeInput.trim().toUpperCase();
    if (!code) return;
    setPresaleLoading(true);
    setPresaleError(null);

    try {
      const res = await fetch(`/api/events/${eventId}/presale/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (data.valid) {
        try {
          sessionStorage.setItem(
            `vc_presale_${eventId}`,
            JSON.stringify({ unlocked: true, type: data.type })
          );
        } catch { /* ignore */ }
        setPresaleType(data.type);
        setPresaleUnlocked(true);
      } else {
        setPresaleError(data.message || "That code isn't valid or the presale window isn't open yet");
        setPresaleShake(true);
        setTimeout(() => setPresaleShake(false), 500);
      }
    } catch {
      setPresaleError("Unable to validate code. Please try again.");
      setPresaleShake(true);
      setTimeout(() => setPresaleShake(false), 500);
    } finally {
      setPresaleLoading(false);
    }
  }, [eventId, presaleCodeInput]);

  // Fetch featured artists assigned to this event
  useEffect(() => {
    fetch(`/api/events/${eventId}/artists`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data)) setFeaturedArtists(data); })
      .catch(() => {});
  }, [eventId]);

  // Fetch event + venue fees + ticket types
  // Fetch other on-sale Florence-area events for the "You May Also Like" section
  useEffect(() => {
    fetch(`/api/events`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: { id: string; title: string; venue: string; date: string; price: number; image_url?: string; is_free?: boolean; on_sale_at?: string; closed_out_at?: string | null }[]) => {
        if (!Array.isArray(data)) return;
        const now = new Date();
        const florenceKeywords = ["florence", "shoals", "sheffield", "muscle shoals", "tuscumbia", "colbert", "lauderdale"];
        const others = data.filter((e) => {
          if (e.id === eventId) return false;
          if (e.closed_out_at) return false;
          if (new Date(e.date) <= now) return false;
          if (e.on_sale_at && new Date(e.on_sale_at) > now) return false;
          const v = (e.venue || "").toLowerCase();
          return florenceKeywords.some((kw) => v.includes(kw));
        }).slice(0, 4);
        setOtherEvents(others);
      })
      .catch(() => {});
  }, [eventId]);

  useEffect(() => {
    fetch(`/api/events/${eventId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Event not found");
        return res.json();
      })
      .then((data: EventData & { facility_fee_enabled?: boolean }) => {
        setEvent(data);

        // Fire Meta Pixel ViewContent so Meta knows which event pages get traffic
        trackFbEvent("ViewContent", {
          content_name: data.title,
          content_ids: [data.id],
          content_type: "product",
          value: data.price ?? 0,
          currency: "USD",
        });

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
                  tax_method: v.tax_method === "divisor" ? "divisor" : "multiplier",
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
                    tax_method: ev.tax_method === "divisor" ? "divisor" : "multiplier",
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
                price: number; capacity: number; sort_order: number; quantity_sold?: number;
              }) => ({
                id: t.id,
                event_id: t.event_id,
                name: t.tier_name,
                price: t.price,
                quantity_available: t.capacity,
                quantity_sold: t.quantity_sold ?? 0,
                sort_order: t.sort_order,
                perks: ["Full event access", "Venue amenities"],
              }));
              setTicketTypes(mapped);
              // Default to first available (non-sold-out) tier
              const firstAvailable = mapped.find((t) => t.quantity_sold < t.quantity_available) ?? mapped[0];
              setSelectedTicketId(firstAvailable?.id ?? null);
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

  // Sync selected seats/tables → ticket type + quantity for Order Summary
  useEffect(() => {
    if (!reservedSeatingEnabled) return;

    // Table selection takes priority
    if (selectedTables.length > 0) {
      const firstTable = selectedTables[0];
      const sectionName = firstTable.sectionName.toLowerCase();
      const tablePrice = firstTable.priceCents / 100;
      const matchByPrice = ticketTypes.find((t) => Math.abs(t.price - tablePrice) < 0.01);
      const matchByName = ticketTypes.find((t) => sectionName.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(sectionName));
      const bestMatch = matchByPrice ?? matchByName ?? ticketTypes[0] ?? null;
      if (bestMatch) setSelectedTicketId(bestMatch.id);
      setQuantity(selectedTables.length);
      return;
    }

    if (selectedSeats.length === 0) return;

    const seatPrice = selectedSeats[0].priceCents / 100;
    const sectionName = selectedSeats[0].sectionName.toLowerCase();
    const matchByPrice = ticketTypes.find((t) => Math.abs(t.price - seatPrice) < 0.01);
    const matchByName = ticketTypes.find((t) => sectionName.includes(t.name.toLowerCase()) || t.name.toLowerCase().includes(sectionName));
    const bestMatch = matchByPrice ?? matchByName ?? (ticketTypes.length > 0 ? ticketTypes[0] : null);
    if (bestMatch) setSelectedTicketId(bestMatch.id);
    setQuantity(selectedSeats.length);
  }, [selectedSeats, selectedTables, ticketTypes, reservedSeatingEnabled]);

  const selectedTicket = ticketTypes.find((t) => t.id === selectedTicketId) ?? null;
  const appliedPromoRef = useRef<string | null>(null);

  // Determine if this is a free event
  const isFreeEvent = event?.is_free === true || (event?.price === 0 && ticketTypes.every((t) => t.price === 0));

  const orderSummaryRef = useRef<HTMLDivElement>(null);

  const handleCheckout = () => {
    if (!event) return;
    if (!selectedTicket && !reservedSeatingEnabled) return;
    trackFbEvent("InitiateCheckout", {
      content_name: event.title,
      content_ids: [event.id],
      value: selectedTicket?.price ? selectedTicket.price * quantity : 0,
      currency: "USD",
    });
    setCheckoutStep("checkout");
    // Scroll the order summary into view smoothly instead of jumping to page top
    setTimeout(() => {
      orderSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
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
          seat_ids: hasSeatingSelection
            ? [...selectedSeats.map((s) => s.seatId), ...selectedTables.flatMap((t) => t.seatIds)]
            : undefined,
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
      {/* Presale animation styles — hoisted so they survive the unlock transition */}
      {event?.presaleAvailable && (
        <style>{`
          @keyframes edc-presale-panel-in {
            0%   { transform: translateY(-18px) scale(0.95); opacity: 0; filter: blur(10px); }
            60%  { transform: translateY(4px)   scale(1.01); opacity: 1; filter: blur(0);   }
            100% { transform: translateY(0)     scale(1);    opacity: 1; filter: blur(0);   }
          }
          @keyframes edc-presale-shake {
            0%   { transform: translateX(0)    rotate(0deg);    }
            10%  { transform: translateX(-10px) rotate(-1.4deg); }
            22%  { transform: translateX(10px)  rotate(1.4deg);  }
            35%  { transform: translateX(-7px)  rotate(-0.8deg); }
            48%  { transform: translateX(7px)   rotate(0.8deg);  }
            60%  { transform: translateX(-4px)  rotate(-0.3deg); }
            72%  { transform: translateX(4px)   rotate(0.3deg);  }
            85%  { transform: translateX(-1px);                  }
            100% { transform: translateX(0)    rotate(0deg);    }
          }
          @keyframes edc-presale-badge-in {
            0%   { transform: scale(0.68) translateY(12px); opacity: 0; }
            55%  { transform: scale(1.09) translateY(-3px); opacity: 1; }
            78%  { transform: scale(0.97) translateY(0);                }
            100% { transform: scale(1)   translateY(0);    opacity: 1; }
          }
          @keyframes edc-presale-badge-shimmer {
            0%   { background-position: -220% center; }
            100% { background-position: 220% center;  }
          }
          @keyframes edc-presale-link-breathe {
            0%, 100% { opacity: 0.55; }
            50%       { opacity: 0.92; }
          }
          .edc-presale-link {
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            color: rgba(208, 194, 144, 0.7);
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.01em;
            position: relative;
            display: inline-block;
            animation: edc-presale-link-breathe 2.6s ease-in-out infinite;
            transition: color 0.2s ease;
          }
          .edc-presale-link:hover {
            color: rgba(208, 194, 144, 1);
            animation: none;
          }
          .edc-presale-link::after {
            content: "";
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 0;
            height: 1px;
            background: rgba(208, 194, 144, 0.7);
            transition: width 0.28s ease;
          }
          .edc-presale-link:hover::after { width: 100%; }
          .edc-presale-input:focus {
            border-color: rgba(208, 194, 144, 0.45) !important;
            box-shadow: 0 0 0 3px rgba(208, 194, 144, 0.07) !important;
            outline: none;
          }
        `}</style>
      )}
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
                    presaleActive={!!event.presaleAvailable && !ticketsOnSale && !presaleUnlocked}
                  />

                  {/* Ticket type dropdown + quantity selector */}
                  <div className="ticket-selector-row">
                    <select
                      className="ticket-type-select"
                      value={selectedTicketId ?? ""}
                      onChange={(e) => setSelectedTicketId(e.target.value)}
                    >
                      {ticketTypes.map((tt) => {
                        const soldOut = tt.quantity_sold >= tt.quantity_available;
                        return (
                          <option key={tt.id} value={tt.id} disabled={soldOut}>
                            {tt.name} — ${tt.price.toFixed(2)}{soldOut ? " (Sold Out)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <div className="ticket-qty-control">
                      <button type="button" className="ticket-qty-btn" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1 || (selectedTicket ? selectedTicket.quantity_sold >= selectedTicket.quantity_available : false)}>−</button>
                      <span className="ticket-qty-value">{quantity}</span>
                      <button type="button" className="ticket-qty-btn" onClick={() => setQuantity((q) => Math.min(10, q + 1))} disabled={selectedTicket ? selectedTicket.quantity_sold >= selectedTicket.quantity_available : false}>+</button>
                    </div>
                  </div>

                  {/* Inline seat map for assigned seating */}
                  {reservedSeatingEnabled && seatingSections.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      {/* Sold-out banners for fully-sold table sections */}
                      {seatingSections
                        .filter((sec) => sec.sells_as_table && sec.seats.length > 0 && sec.seats.every((s) => s.status === "sold"))
                        .map((sec) => (
                          <div key={sec.id} style={{
                            marginBottom: 8, padding: "9px 14px", borderRadius: 8,
                            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
                            display: "flex", alignItems: "center", gap: 8,
                          }}>
                            <span style={{ fontSize: 14 }}>🚫</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#f87171" }}>
                              {sec.name} are SOLD OUT
                            </span>
                          </div>
                        ))
                      }
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
                          onTableClick={handleTableClick}
                        />
                      </div>
                      {/* Legend — skip stage and zero-price sections (not purchasable) */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 8 }}>
                        {seatingSections.filter((s) => s.type !== "stage" && s.price_cents > 0).map((s) => (
                          <span key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                            {s.name}{s.sells_as_table ? " (full table)" : ""} — ${(s.price_cents / 100).toFixed(2)}
                          </span>
                        ))}
                      </div>
                      {/* Selection summary */}
                      {hasSeatingSelection && (
                        <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)", borderRadius: 8, padding: 10, marginTop: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", marginBottom: 6 }}>
                            Your Selection ({selectedSeats.length + selectedTables.length} {selectedSeats.length + selectedTables.length === 1 ? "item" : "items"})
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            {selectedTables.map((t) => (
                              <div key={t.objectId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: t.color, display: "inline-block" }} />
                                  {t.tableLabel} ({t.seatCount} seats) — {t.sectionName}
                                </span>
                                <span style={{ color: "rgba(255,255,255,0.5)" }}>${(t.priceCents / 100).toFixed(2)}</span>
                              </div>
                            ))}
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
                            <span>${((selectedSeats.reduce((s, seat) => s + seat.priceCents, 0) + selectedTables.reduce((s, t) => s + t.priceCents, 0)) / 100).toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            </div>

            {/* RIGHT: Order Summary / Inline Checkout / Countdown */}
            <div className="order-summary-column" ref={orderSummaryRef}>
              {event.external_ticket_url ? (
                /* ── External Ticketing ── */
                <div style={{
                  background: "rgba(208,194,144,0.04)",
                  border: "1px solid rgba(208,194,144,0.15)",
                  borderRadius: 12,
                  padding: 28,
                  textAlign: "center",
                }}>
                  <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, margin: "0 0 20px" }}>
                    Tickets for this show are sold directly through Hernando's Hideaway.
                  </p>
                  <a
                    href={event.external_ticket_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-block",
                      padding: "14px 32px",
                      background: "linear-gradient(135deg, #d0c290, #b8a870)",
                      color: "#0b0d1d",
                      fontWeight: 700,
                      fontSize: 15,
                      borderRadius: 10,
                      textDecoration: "none",
                      letterSpacing: 0.3,
                    }}
                  >
                    {event.external_ticket_label || "Get Tickets"} →
                  </a>
                </div>
              ) : pastEventReason({ date: event.date, closed_out_at: event.closed_out_at ?? null }) ? (
                /* ── Past / Closed-Out Show — purchases locked ── */
                <div style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: 24,
                  textAlign: "center",
                }}>
                  <div style={{
                    display: "inline-block",
                    padding: "4px 10px",
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.55)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 1.4,
                    textTransform: "uppercase",
                    borderRadius: 4,
                    marginBottom: 14,
                  }}>
                    Past Show
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600, fontSize: 15, margin: "0 0 6px" }}>
                    Tickets are no longer on sale.
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: 0 }}>
                    {pastEventReason({ date: event.date, closed_out_at: event.closed_out_at ?? null })}
                  </p>
                </div>
              ) : checkoutStep === "checkout" ? (
                /* ── Inline Stripe Checkout ── */
                <div className="checkout-reveal">
                  <InlineCheckout
                    eventId={event.id}
                    eventTitle={event.title}
                    eventDate={formatEventDateFull(event.date)}
                    eventVenue={event.venue}
                    tierId={selectedTicket?.id}
                    tierName={selectedTicket?.name || "General Admission"}
                    ticketPrice={selectedTicket?.price || event.price || 0}
                    quantity={quantity}
                    promoCode={appliedPromoRef.current}
                    selectedSeatIds={reservedSeatingEnabled ? [...selectedSeats.map((s) => s.seatId), ...selectedTables.flatMap((t) => t.seatIds)] : undefined}
                    isFreeEvent={isFreeEvent}
                    onBack={() => setCheckoutStep("browse")}
                    ticketingFee={venueFees.ticketing_fee}
                    facilityFee={venueFees.facility_fee}
                    taxRate={venueFees.tax_rate}
                    taxMethod={venueFees.tax_method}
                  />
                </div>
              ) : !ticketsOnSale && !presaleUnlocked ? (
                /* ── On-Sale Countdown ── */
                <div style={{
                  background: "rgba(20, 20, 24, 0.95)",
                  border: "1px solid rgba(208, 194, 144, 0.2)",
                  borderRadius: 12,
                  padding: 24,
                  textAlign: "center",
                  boxShadow: "0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
                }}>
                  <p style={{ color: "rgba(208,194,144,0.65)", fontWeight: 700, fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Tickets On Sale Soon
                  </p>
                  <p style={{ color: "#d0c290", fontSize: 28, fontWeight: 800, fontFamily: "monospace", letterSpacing: 2 }}>
                    {onSaleCountdown}
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 8 }}>
                    Check back when the countdown ends!
                  </p>

                  {event?.presaleAvailable && (
                    <div style={{ marginTop: 18 }}>
                      <button
                        type="button"
                        className="edc-presale-link"
                        onClick={() => { setPresalePanelVisible((v) => !v); setPresaleError(null); }}
                      >
                        Have a presale code?
                      </button>

                      {presalePanelVisible && (
                        <div style={{
                          marginTop: 14,
                          padding: "18px 20px",
                          borderRadius: 12,
                          background: "rgba(20, 20, 24, 0.97)",
                          border: "1px solid rgba(255, 255, 255, 0.1)",
                          boxShadow: "0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.05)",
                          textAlign: "left",
                          animation: "edc-presale-panel-in 0.42s cubic-bezier(0.34,1.4,0.64,1) both",
                        }}>
                          <label style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", fontWeight: 600, display: "block", marginBottom: 10, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                            Presale Code
                          </label>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input
                              type="text"
                              className="edc-presale-input"
                              value={presaleCodeInput}
                              onChange={(e) => { setPresaleCodeInput(e.target.value.toUpperCase()); setPresaleError(null); }}
                              onKeyDown={(e) => { if (e.key === "Enter") handlePresaleUnlock(); }}
                              placeholder="Enter code"
                              maxLength={15}
                              style={{
                                flex: 1,
                                background: "rgba(255,255,255,0.04)",
                                border: `1px solid ${presaleError ? "rgba(239,68,68,0.65)" : "rgba(255,255,255,0.12)"}`,
                                borderRadius: 8,
                                padding: "11px 14px",
                                color: "#fff",
                                fontSize: 15,
                                fontFamily: "monospace",
                                letterSpacing: "0.1em",
                                textTransform: "uppercase",
                                transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                                animation: presaleShake ? "edc-presale-shake 0.52s ease-out" : "none",
                              }}
                            />
                            <button
                              type="button"
                              onClick={handlePresaleUnlock}
                              disabled={presaleLoading || !presaleCodeInput.trim()}
                              style={{
                                padding: "11px 20px",
                                borderRadius: 8,
                                border: "1px solid rgba(208,194,144,0.35)",
                                background: "rgba(208,194,144,0.09)",
                                color: "#d0c290",
                                fontSize: 13,
                                fontWeight: 700,
                                letterSpacing: "0.03em",
                                cursor: presaleLoading || !presaleCodeInput.trim() ? "not-allowed" : "pointer",
                                opacity: presaleLoading || !presaleCodeInput.trim() ? 0.45 : 1,
                                transition: "opacity 0.2s ease, background 0.2s ease",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {presaleLoading ? "Checking..." : "Unlock"}
                            </button>
                          </div>
                          {presaleError && (
                            <p style={{ margin: "9px 0 0", fontSize: 12, color: "rgba(239,68,68,0.85)" }}>
                              {presaleError}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : presaleUnlocked && presaleType ? (
                /* ── Presale unlocked — show badge then normal ticket flow ── */
                <>
                  <div style={{
                    display: "inline-block",
                    marginBottom: 16,
                    padding: "6px 20px",
                    borderRadius: 20,
                    background: "linear-gradient(90deg, rgba(208,194,144,0.07) 0%, rgba(208,194,144,0.18) 40%, rgba(255,248,220,0.16) 50%, rgba(208,194,144,0.18) 60%, rgba(208,194,144,0.07) 100%)",
                    backgroundSize: "220% auto",
                    border: "1px solid rgba(208,194,144,0.3)",
                    color: "#d0c290",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    animation: "edc-presale-badge-in 0.48s cubic-bezier(0.34,1.4,0.64,1) both, edc-presale-badge-shimmer 1.6s 0.45s ease-out both",
                  }}>
                    {presaleType === "artist" ? "Artist Presale" : "Venue Presale"}
                  </div>
                  {isFreeEvent ? (
                    <InlineCheckout
                      eventId={event.id}
                      eventTitle={event.title}
                      eventDate={formatEventDateFull(event.date)}
                      eventVenue={event.venue}
                      tierName="Free Admission"
                      ticketPrice={0}
                      quantity={quantity}
                      isFreeEvent={true}
                      onBack={() => {}}
                    />
                  ) : (
                    <OrderSummary
                      selectedTicket={selectedTicket}
                      quantity={quantity}
                      ticketingFee={venueFees.ticketing_fee}
                      facilityFee={venueFees.facility_fee}
                      taxRate={venueFees.tax_rate}
                      taxMethod={venueFees.tax_method}
                      onCheckout={handleCheckout}
                      onPromoApplied={(code) => { appliedPromoRef.current = code; }}
                      onFreeCheckout={handleFreeCheckout}
                    />
                  )}
                </>
              ) : isFreeEvent ? (
                /* ── Free Event — go straight to inline checkout ── */
                <InlineCheckout
                  eventId={event.id}
                  eventTitle={event.title}
                  eventDate={formatEventDateFull(event.date)}
                  eventVenue={event.venue}
                  tierName="Free Admission"
                  ticketPrice={0}
                  quantity={quantity}
                  isFreeEvent={true}
                  onBack={() => {}}
                />
              ) : (
                /* ── Normal Browse Mode: Order Summary ── */
                <>
                  <OrderSummary
                    selectedTicket={selectedTicket}
                    quantity={quantity}
                    ticketingFee={venueFees.ticketing_fee}
                    facilityFee={venueFees.facility_fee}
                    taxRate={venueFees.tax_rate}
                    taxMethod={venueFees.tax_method}
                    onCheckout={handleCheckout}
                    onPromoApplied={(code) => { appliedPromoRef.current = code; }}
                    onFreeCheckout={handleFreeCheckout}
                  />
                  {reservedSeatingEnabled && !hasSeatingSelection && (
                    <p style={{ fontSize: 12, color: "#a1a1aa", textAlign: "center", marginTop: 8, fontStyle: "italic" }}>
                      Select seats from the map to continue
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Event description — renders below order summary on mobile, full-width on desktop */}
          {event.description && (
            <p className="ticket-event-description ticket-event-description-below">
              {event.description}
            </p>
          )}
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
                      {event.venue_phone}
                    </a>
                  )}
                  {event.venue_email && (
                    <a href={`mailto:${event.venue_email}`} className="venue-directions-card-link">
                      {event.venue_email}
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
                          <img src={s.logo_url} alt={s.sponsor_name} className={`sponsor-logo sponsor-logo-${tier}`} />
                        ) : (
                          <span className={`sponsor-name-text sponsor-name-${tier}`}>{s.sponsor_name}</span>
                        )}
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* ── You May Also Like ────────────────────────────────────────────── */}
        {otherEvents.length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <style>{`
              .ymal-carousel { display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; padding-bottom:6px; scrollbar-width:none; }
              .ymal-carousel::-webkit-scrollbar { display:none; }
              .ymal-card { flex:0 0 min(210px,72vw); scroll-snap-align:start; background:#131629; border-radius:12px; border:1px solid rgba(255,255,255,0.08); overflow:hidden; display:flex; flex-direction:column; text-decoration:none; color:inherit; transition:transform 0.2s ease,border-color 0.2s ease; }
              .ymal-card:hover { transform:scale(1.02); border-color:rgba(208,194,144,0.45); }
              .ymal-img { position:relative; width:100%; aspect-ratio:16/9; background:#0b0d1d; overflow:hidden; display:flex; align-items:center; justify-content:center; }
              .ymal-img img { width:100%; height:100%; object-fit:cover; display:block; }
              .ymal-img::after { content:""; position:absolute; bottom:0; left:0; right:0; height:50%; background:linear-gradient(to top,rgba(19,22,41,0.85),transparent); pointer-events:none; }
              .ymal-body { padding:12px; display:flex; flex-direction:column; gap:6px; flex:1; }
              .ymal-title { font-size:14px; font-weight:700; color:#fff; margin:0; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
              .ymal-meta { font-size:11px; color:rgba(255,255,255,0.5); margin:0; display:flex; align-items:center; gap:4px; }
              .ymal-price { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; background:rgba(208,194,144,0.15); color:#d0c290; align-self:flex-start; }
              .ymal-btn { display:block; width:100%; padding:9px; border:none; border-radius:7px; background:#d0c290; color:#0b0d1d; font-size:12px; font-weight:700; text-align:center; text-decoration:none; margin-top:auto; transition:opacity 0.15s; box-sizing:border-box; }
              .ymal-btn:hover { opacity:0.88; }
            `}</style>

            <h2 style={{ fontSize: "clamp(15px, 3vw, 18px)", fontWeight: 800, margin: "0 0 14px", color: "#fff", letterSpacing: "-0.3px" }}>
              You May Also Like
            </h2>

            <div className="ymal-carousel">
              {otherEvents.map((ev) => {
                const isFree = ev.is_free || ev.price === 0;
                const dateObj = ev.date && ev.date.length === 10 ? new Date(ev.date + "T12:00:00") : new Date(ev.date);
                const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                return (
                  <a key={ev.id} href={`/events/${ev.id}`} className="ymal-card">
                    <div className={`ymal-img${!ev.image_url ? "" : ""}`}>
                      {ev.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ev.image_url} alt={ev.title} />
                      ) : (
                        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.2 }}>
                          <path d="M9 18V5l12-2v13" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="6" cy="18" r="3" stroke="#fff" strokeWidth="1.5"/>
                          <circle cx="18" cy="16" r="3" stroke="#fff" strokeWidth="1.5"/>
                        </svg>
                      )}
                    </div>
                    <div className="ymal-body">
                      <h3 className="ymal-title">{ev.title}</h3>
                      <p className="ymal-meta">{dateStr}</p>
                      <p className="ymal-meta">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke="currentColor" strokeWidth="1.5"/>
                          <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
                        </svg>
                        {ev.venue}
                      </p>
                      <span className="ymal-price">{isFree ? "FREE" : `$${ev.price?.toFixed(2) ?? "0.00"}`}</span>
                      <span className="ymal-btn">{isFree ? "Register Free" : "Get Tickets"}</span>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        <FAQAccordion />
      </main>

      <Footer />
    </>
  );
}
