"use client";

import Link from "next/link";
import MergedPage from "@/app/components/admin/MergedPage";
import Month from "./_panels/Month";
import ShowList from "./_panels/ShowList";

/**
 * Calendar & shows — PHASE1B § Merges: the calendar and the events list are
 * the same shows read two ways, the month for the room and the list for the
 * book. /admin/calendar?tab=month|list; each tab is the old page moved in
 * unchanged. Roles are the old routes' own: a box office user who could only
 * see the show list lands on it.
 */
export default function CalendarAndShowsPage() {
  return (
    <MergedPage
      pageId="calendar"
      title="Calendar & shows"
      sub="Holds, confirms & rentals — by month or as a list"
      actions={
        <Link href="/admin/events/new" className="btn btn-primary">
          + New event
        </Link>
      }
      tabsNote="Same shows, two readings — the month for the room, the list for the book"
      panels={{
        month: () => <Month />,
        list: () => <ShowList />,
      }}
    />
  );
}
