"use client";

import { useEffect, useState } from "react";

/**
 * Returns true when the viewport width is below `breakpoint` (default 640px).
 * Safe for SSR — defaults to false on the first render.
 */
export function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpoint]);

  return isMobile;
}
