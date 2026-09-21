"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A page's in-page tab, kept in `?tab=` instead of component state.
 *
 * ADMIN-NAV-SPEC.md: the sidebar's tab rows link to the page's own tab param,
 * so deep links and the in-page tab bar stay the single source of truth, and
 * the sidebar never owns tab state — it reads it. This is the page's half.
 *
 * The first key is the default and is left out of the URL, which is also
 * what the sidebar assumes when `?tab=` is absent. An unknown value falls back
 * to the default rather than rendering an empty panel. Switching tabs
 * replaces the history entry, so Back leaves the page instead of stepping
 * through every tab clicked.
 */
export function useTabParam<T extends string>(keys: readonly T[]): [T, (next: T) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fallback = keys[0];

  const raw = searchParams.get("tab");
  const tab = raw !== null && (keys as readonly string[]).includes(raw) ? (raw as T) : fallback;

  const setTab = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete("tab");
      else params.set("tab", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname, fallback]
  );

  return [tab, setTab];
}
