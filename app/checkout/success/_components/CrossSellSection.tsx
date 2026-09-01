/**
 * CrossSellSection — "While You're Here" heading + the 3-up event grid at
 * the bottom of Checkout Success (checkout_success.png, .also-head +
 * .success-grid). Reuses the app's real EventCard — the SAME component as
 * home and its hero carousel, via eventToCardProps for the Event → flat-
 * prop mapping — not a separate card rebuilt for this page.
 */
import EventCard from "@/app/components/EventCard";
import { eventToCardProps } from "@/lib/eventCardProps";
import { Event } from "@/lib/types/event";

export function CrossSellSection({
  eyebrow = "While You're Here",
  title = "More Nights Worth Clearing Your Calendar For",
  shows,
}: {
  eyebrow?: string;
  title?: string;
  shows: Event[];
}) {
  if (shows.length === 0) return null;
  return (
    <div className="cs-crosssell">
      <p className="cs-crosssell-eyebrow">{eyebrow}</p>
      <h3 className="cs-crosssell-heading">{title}</h3>
      <div className="cs-crosssell-grid">
        {shows.map((e) => (
          <EventCard key={e.id} {...eventToCardProps(e)} />
        ))}
      </div>
    </div>
  );
}
