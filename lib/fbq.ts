/**
 * Meta Pixel (fbq) helper — fires conversion events safely.
 * Handles SSR (no window), missing pixel, and TypeScript types.
 *
 * Usage:
 *   import { trackFbEvent } from "@/lib/fbq";
 *   trackFbEvent("InitiateCheckout");
 *   trackFbEvent("Purchase", { value: 29.99, currency: "USD", num_items: 2 });
 */
export function trackFbEvent(
  eventName: string,
  params?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq;
  if (typeof fbq !== "function") return;
  if (params) {
    fbq("track", eventName, params);
  } else {
    fbq("track", eventName);
  }
}
