import EventCard from "./EventCard";
import { Event } from "@/app/types/event";

type EventCarouselProps = {
  events: Event[];
};

export default function EventCarousel({ events }: EventCarouselProps) {
  return (
    <section className="upcoming-events-row" aria-label="Upcoming events carousel">
      <div className="upcoming-events-content-container">
        <div className="upcoming-events-stack">
          {events.map((event) => (
            <div className="upcoming-events-item" key={event.id}>
              <EventCard event={event} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}