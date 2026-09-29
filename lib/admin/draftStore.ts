"use client";

/**
 * A local draft of a form that has not been saved yet.
 *
 * Create-a-show is three steps and around 1,800 lines of form, and until you
 * press Save or Publish nothing exists anywhere. A refresh, a misclick on a
 * sidebar link, or a browser crash took the lot.
 *
 * ── Why localStorage rather than a draft row ─────────────────────────────
 * The durable answer is to create the event as a draft row on first blur and
 * edit from then on, which also collapses create and edit into one form. It
 * is the better design and it is a bigger change: it puts half-typed shows
 * in the events table, and therefore in the calendar, the show list and
 * anything else that reads events. That is a decision about the data, not
 * about this form, so it is not made here.
 *
 * This keeps the typing safe without inventing rows. It is per-browser and
 * per-device, which is the honest limit of it.
 *
 * ── Rules ────────────────────────────────────────────────────────────────
 * Never throws. Storage is unavailable in a private window, can be full, and
 * can be disabled outright; a draft that cannot be saved must not take the
 * form down with it.
 *
 * Drafts expire, because a three-week-old half-typed show is not something
 * anyone wants restored on top of a new one.
 */

const PREFIX = "vc:draft:";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type Draft<T> = { savedAt: number; data: T };

export function saveDraft<T>(key: string, data: T): void {
  try {
    const payload: Draft<T> = { savedAt: Date.now(), data };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(payload));
  } catch {
    // Full, blocked, or private browsing. The form keeps working.
  }
}

export function readDraft<T>(key: string): Draft<T> | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      clearDraft(key);
      return null;
    }
    return parsed;
  } catch {
    // Corrupt or unreadable — treat as no draft rather than crashing the page.
    return null;
  }
}

export function clearDraft(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to do */
  }
}

/** "3 minutes ago" — for telling someone how old the thing being offered is. */
export function draftAge(savedAt: number, now: number = Date.now()): string {
  const mins = Math.floor((now - savedAt) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return "1 hour ago";
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
