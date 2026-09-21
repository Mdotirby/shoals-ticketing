"use client";

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
      panels={{
        month: () => <Month />,
        list: () => <ShowList />,
      }}
    />
  );
}
