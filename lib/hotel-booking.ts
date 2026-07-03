export type VenueHotel = {
  id: string;
  name: string;
  tagline?: string | null;
  booking_url_template: string;
  display_order: number;
};

/**
 * Builds a ready-to-open hotel booking URL from a venue_hotels template.
 * Replaces {checkin} and {checkout} tokens with the event date and day-after.
 * Marriott expects MM/DD/YYYY — encode that in the template; other OTAs
 * can use their own format in their own template string.
 */
export function buildHotelUrl(template: string, eventDate: string): string {
  const checkin = new Date(eventDate + "T12:00:00"); // noon to avoid TZ shift
  const checkout = new Date(checkin);
  checkout.setDate(checkout.getDate() + 1);

  const fmt = (d: Date) =>
    `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

  return template
    .replace("{checkin}", fmt(checkin))
    .replace("{checkout}", fmt(checkout));
}
