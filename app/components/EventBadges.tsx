"use client";

type EventBadgesProps = {
  eventDate: string;        // ISO string e.g. "2025-11-08T20:00:00"
  ageRestriction?: string;  // "all_ages" | "18+" | "21+" — default all_ages
};

function safeDate(d: string) { return (d && d.length === 10 && d[4] === "-") ? new Date(d + "T12:00:00") : new Date(d); }

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function EventBadges({ eventDate, ageRestriction = "all_ages" }: EventBadgesProps) {
  const now = new Date();
  const showDate = safeDate(eventDate);
  const diffMs = showDate.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  const doorsOpen = new Date(showDate.getTime() - 60 * 60 * 1000); // 1hr before

  const ageLabel =
    ageRestriction === "18+" ? "18+" :
    ageRestriction === "21+" ? "21+" :
    "All Ages";

  const countdownLabel =
    daysLeft <= 0 ? "Tonight" :
    daysLeft === 1 ? "Tomorrow" :
    `${daysLeft} Days`;

  return (
    <div className="event-badges">
      <span className="event-badge event-badge-age">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {ageLabel}
      </span>

      <span className="event-badge event-badge-countdown">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 10h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {countdownLabel}
      </span>

      <span className="event-badge event-badge-doors">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
          <path d="M3 12a9 9 0 1018 0 9 9 0 00-18 0zM12 7v5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        Doors {formatTime(doorsOpen)}
      </span>
    </div>
  );
}
