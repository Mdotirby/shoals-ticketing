import { Event } from "@/lib/types/event";
import { formatEventDateCompact, formatEventTime } from "@/lib/dates";

/**
 * Maps a full Event record onto EventCard's flat display props.
 *
 * EventCard used to take `event: Event` directly and format it internally.
 * The liquid-glass component layer (app/components/liquid-glass-components.tsx)
 * takes flat display strings instead — kept here in one place since three
 * call sites (home, the home hero carousel, and the checkout-success
 * cross-sell grid) all need the exact same price/date formatting, and
 * duplicating it three times is how they'd quietly drift apart.
 */
export function eventToCardProps(event: Event) {
  const isFree = Number(event.price) === 0;
  return {
    name: event.title,
    venue: event.venue,
    dateLabel: formatEventDateCompact(event.date),
    timeLabel: formatEventTime(event.date) ?? "",
    priceLabel: isFree ? "FREE" : `From $${Number(event.price).toFixed(2)}`,
    isFree,
    photoUrl: event.image_url,
    ctaHref: `/events/${event.id}`,
  };
}
