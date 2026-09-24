"use client";

import { useEffect } from "react";

/**
 * Measures how long a visitor stayed, for a tracked link.
 *
 * Mounted on the pages a trackable link points at. Does nothing at all unless
 * the URL carries a `?ref=` — an untracked visit is not measured, because
 * there is nothing to attribute it to.
 *
 * Counts VISIBLE time, not wall-clock: a backgrounded tab is not someone
 * reading, and counting it would make every link look better the more people
 * ignored it. The timer pauses on visibilitychange and resumes when the tab
 * comes back.
 *
 * Reports with sendBeacon on pagehide, which survives the navigation that
 * ends the visit — a fetch there is routinely cancelled. `pagehide` rather
 * than `unload` because Safari and mobile browsers keep pages in the
 * back/forward cache and never fire `unload` at all.
 */
export default function DwellTracker({ refSlug }: { refSlug?: string | null }) {
  useEffect(() => {
    const ref = refSlug ?? new URLSearchParams(window.location.search).get("ref");
    if (!ref) return;

    let visibleMs = 0;
    let since = document.visibilityState === "visible" ? Date.now() : null;

    const accrue = () => {
      if (since !== null) {
        visibleMs += Date.now() - since;
        since = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (since === null) since = Date.now();
      } else {
        accrue();
      }
    };

    let sent = false;
    const report = () => {
      if (sent) return;
      accrue();
      if (visibleMs < 1000) return;
      sent = true;
      const body = JSON.stringify({ ref, ms: visibleMs });
      // Beacon first; the fetch is only a fallback for browsers without it.
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/track/dwell", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/track/dwell", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", report);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", report);
      // Leaving via a client-side route change also ends the visit.
      report();
    };
  }, [refSlug]);

  return null;
}
