"use client";

// 90-minute inactivity timeout session manager
// Tracks user activity via DOM events and refreshes Supabase tokens

const INACTIVITY_LIMIT_MS = 90 * 60 * 1000; // 90 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // Refresh token every 10 minutes of activity
const STORAGE_KEY = "venuecore_last_activity";

const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  "mousemove",
  "mousedown",
  "click",
  "keydown",
  "touchstart",
  "scroll",
];

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastRefreshTime = 0;

/** Update the last-activity timestamp in localStorage */
function recordActivity() {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, String(Date.now()));
}

/** Get last recorded activity timestamp */
function getLastActivity(): number {
  if (typeof window === "undefined") return Date.now();
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? Number(stored) : Date.now();
}

/** Check if the session has been inactive for more than 90 minutes */
function isInactive(): boolean {
  return Date.now() - getLastActivity() > INACTIVITY_LIMIT_MS;
}

/**
 * Start the session manager.
 * - Attaches activity listeners to the window
 * - Runs a 60-second interval to check inactivity
 * - Calls onExpire() if 90 minutes of inactivity
 * - Periodically refreshes the Supabase session token
 */
export function startSessionManager(options: {
  onExpire: () => void;
  refreshSession: () => Promise<void>;
}) {
  if (typeof window === "undefined") return;

  const { onExpire, refreshSession } = options;

  // Record initial activity
  recordActivity();
  lastRefreshTime = Date.now();

  // Activity handler — record timestamp + conditionally refresh token
  const handleActivity = () => {
    recordActivity();

    // Refresh Supabase token every 10 minutes of active use
    if (Date.now() - lastRefreshTime > REFRESH_INTERVAL_MS) {
      lastRefreshTime = Date.now();
      refreshSession().catch(console.error);
    }
  };

  // Attach event listeners
  ACTIVITY_EVENTS.forEach((event) => {
    window.addEventListener(event, handleActivity, { passive: true });
  });

  // Also track visibility changes (tab focus)
  const handleVisibility = () => {
    if (document.visibilityState === "visible") {
      handleActivity();
    }
  };
  document.addEventListener("visibilitychange", handleVisibility);

  // Periodic inactivity check every 60 seconds
  intervalId = setInterval(() => {
    if (isInactive()) {
      onExpire();
    }
  }, CHECK_INTERVAL_MS);

  // Return cleanup function
  return () => {
    ACTIVITY_EVENTS.forEach((event) => {
      window.removeEventListener(event, handleActivity);
    });
    document.removeEventListener("visibilitychange", handleVisibility);
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

/**
 * Manually record activity from API calls or route changes.
 * Call this from fetch wrappers or route change handlers.
 */
export function touchActivity() {
  recordActivity();
}
