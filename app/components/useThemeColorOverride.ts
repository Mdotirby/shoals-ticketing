"use client";

import { useEffect } from "react";

/**
 * Temporarily swap <meta name="theme-color"> while some overlay is open.
 *
 * iOS Safari tints its own chrome — the status strip above the page and the
 * toolbar below it — from theme-color, and nothing the page draws can reach
 * those areas. So when the mobile nav drawer covers the page with
 * rgba(0, 0, 0, 0.55), the PAGE darkens and the CHROME does not, leaving a hard
 * bright edge exactly at the top of the header. That is the "blur is cut off"
 * seam, and it cannot be fixed in CSS because the chrome is not ours to paint.
 *
 * Swapping the meta for as long as the scrim is up makes the chrome track the
 * page instead. The previous value is restored on close, so the page's normal
 * theme-color is never left stale.
 */
export function useThemeColorOverride(active: boolean, color: string) {
  useEffect(() => {
    if (!active) return;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;

    const previous = meta.getAttribute("content");
    meta.setAttribute("content", color);

    return () => {
      if (previous) meta.setAttribute("content", previous);
    };
  }, [active, color]);
}

/**
 * #34353f (the storefront theme-color) composited under the drawer scrim's
 * rgba(0, 0, 0, 0.55) — each channel × 0.45. Kept next to the hook so the two
 * values stay reasoned about together; if the scrim opacity or the base
 * theme-color changes, recompute this.
 */
export const SCRIM_THEME_COLOR = "#17181c";
