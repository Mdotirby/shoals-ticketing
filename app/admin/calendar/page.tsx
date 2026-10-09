"use client";

import Link from "next/link";
import { PageHeader } from "@/app/components/admin/ui";
import Month from "./_panels/Month";

/**
 * Calendar — the month, for the room: holds, confirms and rentals by date.
 * The list half of the old "Calendar & shows" page is the events list now
 * (/admin/events, eventslist.dc.html); /admin/calendar?tab=list redirects
 * there.
 */
export default function CalendarPage() {
  return (
    <div className="merged-page">
      <PageHeader
        title="Calendar"
        sub="Holds, confirms & rentals by month"
        actions={
          <>
            <Link href="/admin/events" className="btn">All events</Link>
            <Link href="/admin/events/new" className="btn btn-primary">+ New event</Link>
          </>
        }
      />
      <Month />
    </div>
  );
}
