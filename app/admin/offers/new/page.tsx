"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import { newOfferDefaults, type OwnerDefaults, type VenueDefaults } from "@/lib/offers/defaults";

/**
 * Creating an offer opens the offer builder.
 *
 * This route used to be a second, older offer form: 1,041 lines of
 * single-column `admin-form-grid` with no rail, no tabs, no scaling table and
 * no live financial summary — while `/admin/offers/[id]` had all of it. Two
 * forms for one record, and the one the sidebar sent you to was the worse of
 * the two. handoff/screens/offers.dc.html has no separate "new offer" screen
 * for the same reason: the builder IS the form.
 *
 * So this creates the record and hands you to the builder. Everything the old
 * form collected — artist, agency, agent, venue, date, deal, scaling, terms —
 * is on the builder's Details tab.
 *
 * It stays a route rather than becoming a redirect because the create-a-show
 * flow deep-links here with the show already decided:
 *
 *   /admin/offers/new?event_id=…&event_date=…&deal_type=VS
 *
 * Those are carried onto the new offer, so a co-promote or rental created
 * from a show arrives linked to it. *
 * The new offer starts filled in — default expenses, PRO rates, the venue's
 * fees, tax rate, contact and radius clause — from lib/offers/defaults.ts.
 * It used to start blank, which made the builder more typing than the form
 * it replaced.
 */
export default function NewOfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  // React 18 StrictMode mounts effects twice in development; without this the
  // page would create two offers and strand one.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const eventId = searchParams.get("event_id");
    const eventDate = searchParams.get("event_date");
    const dealType = searchParams.get("deal_type");

    (async () => {
      try {
        // Both are best-effort: an offer with the generic defaults beats no
        // offer. /api/admin/users answers only roles that can assign roles.
        const [venues, users] = await Promise.all([
          fetch("/api/venues").then((r) => r.json()).catch(() => []),
          fetch("/api/admin/users").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        ]);
        const venueId = getCookie("venue-id");
        const venueList: VenueDefaults[] = Array.isArray(venues) ? venues : [];
        const venue = venueList.find((v) => v.id === venueId) ?? (venueList.length === 1 ? venueList[0] : null);
        const owner: OwnerDefaults | null = Array.isArray(users)
          ? users.find((u: { role?: string }) => u.role === "owner") ?? null
          : null;

        const res = await fetch("/api/offers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...newOfferDefaults(venue, owner, dealType || "VS"),
            artist_name: "",
            event_id: eventId || null,
            event_date: eventDate || null,
            status: "draft",
          }),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        if (!created?.id) throw new Error();
        router.replace(`/admin/offers/${created.id}`);
      } catch {
        setError("Could not start a new offer. Go back to Offers and try again.");
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="admin-form-page">
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
        {error || "Opening the offer builder…"}
      </p>
    </div>
  );
}
