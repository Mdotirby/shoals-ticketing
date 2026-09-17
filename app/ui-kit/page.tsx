import { notFound } from "next/navigation";
import Gallery from "./Gallery";

/**
 * /ui-kit — the admin primitive gallery.
 *
 * Development only: it 404s in production, so it adds no public surface and
 * needs no auth gate. It lives outside /admin deliberately — middleware
 * protects everything under /admin, and this page has no data on it, only
 * components, so keeping it reachable without a login is what makes it
 * useful for a quick visual check against the design canvas.
 */
export default function UiKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Gallery />;
}
