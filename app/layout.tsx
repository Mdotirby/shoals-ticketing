import type { Metadata } from "next";
import { Archivo, Archivo_Narrow, Bayon, Cairo, Urbanist } from "next/font/google";
import { cookies } from "next/headers";
import "./styles/globals.css";
import Header from "./components/Header";
import VenueThemeProvider from "./components/VenueThemeProvider";
import { VenueProvider } from "./components/VenueContext";
import { OperatorProvider } from "./components/OperatorContext";
import ErrorBoundary from "./components/ErrorBoundary";
import TrackingPixels from "./components/TrackingPixels";
import BackgroundField from "./components/BackgroundField";
import { getOperator } from "@/lib/operators";


const urbanist = Urbanist({
  variable: "--font-urbanist",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["latin"],
  weight: ["700"],
});

const bayon = Bayon({
  variable: "--font-bayon",
  subsets: ["latin"],
  weight: "400",
});

// West72's brand typeface — applied site-wide on west72ent.com via the
// body[data-operator="west72"] CSS scope in globals.css.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["100", "400", "500", "600", "700", "800", "900"],
});

// Google Fonts has no family literally named "Archivo Condensed" — the PSD's
// ArchivoCondensed-* layers use the closest real match, Archivo Narrow.
const archivoNarrow = Archivo_Narrow({
  variable: "--font-archivo-condensed",
  subsets: ["latin"],
  weight: ["400", "700"],
});


export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const operatorSlug = cookieStore.get("operatorSlug")?.value ?? "venuecore";
  const operator = getOperator(operatorSlug);

  const isVenueCore = operator.slug === "venuecore";

  return {
    title: operator.name,
    description: operator.tagline,
    icons: isVenueCore
      ? {
          icon: [
            { url: "/favicons/icon_32.ico", sizes: "32x32" },
            { url: "/favicons/icon_64.ico", sizes: "64x64" },
            { url: "/favicons/icon_128.ico", sizes: "128x128" },
            { url: "/VenueCore_Logos/app_icon_navy_512.png", sizes: "192x192", type: "image/png" },
            { url: "/VenueCore_Logos/app_icon_navy_512.png", sizes: "512x512", type: "image/png" },
          ],
          apple: [
            { url: "/favicons/icon_180.ico", sizes: "180x180" },
          ],
          shortcut: "/favicons/icon_32.ico",
        }
      : operatorSlug === "west72"
        ? {
            icon: [
              // Light mode (light browser chrome): dark icon is readable
              { url: "/favicons/West72/W72_tech_icon_solid_black.ico", sizes: "any", media: "(prefers-color-scheme: light)" },
              // Dark mode (dark browser chrome): white icon is readable
              { url: "/favicons/West72/W72_tech_icon_solid_white.ico", sizes: "any", media: "(prefers-color-scheme: dark)" },
              // Fallback for browsers that don't support media queries on icons
              { url: "/favicons/West72/W72_tech_icon_solid_white.ico", sizes: "32x32" },
              // High-res / PWA
              { url: "/West72_Logos/W72_tech_icon_solid_white.png", sizes: "192x192", type: "image/png" },
              { url: "/West72_Logos/W72_tech_icon_solid_white.png", sizes: "512x512", type: "image/png" },
            ],
            apple: [
              // Apple touch icon: iOS adds white background, so use black icon for contrast
              { url: "/West72_Logos/W72_tech_icon_solid_black.png", sizes: "180x180" },
            ],
            shortcut: "/favicons/West72/W72_tech_icon_solid_white.ico",
          }
        : {
            icon: [
              { url: operator.favicon, sizes: "32x32" },
              { url: operator.favicon, sizes: "192x192" },
            ],
            apple: operator.favicon,
            shortcut: operator.favicon,
          },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const venueSlug = cookieStore.get("venueSlug")?.value ?? "default";
  const operatorSlug = cookieStore.get("operatorSlug")?.value ?? "venuecore";
  const operator = getOperator(operatorSlug);

  return (
    <html lang="en">
      <body
        data-operator={operatorSlug}
        className={`${urbanist.variable} ${cairo.variable} ${bayon.variable} ${archivo.variable} ${archivoNarrow.variable} antialiased`}
      >
        {/* Ambient orb field the liquid-glass surfaces refract. west72 only —
            VenueCore keeps its navy theme. */}
        {operatorSlug === "west72" && <BackgroundField />}

        {/* Operator-specific tracking pixels (Meta Pixel, etc.) */}
        <TrackingPixels metaPixelId={operator.metaPixelId ?? null} />
        <OperatorProvider operatorSlug={operatorSlug}>
          <VenueProvider venueSlug={venueSlug}>
            <VenueThemeProvider>
              <ErrorBoundary>
                <Header />
                {children}
              </ErrorBoundary>
            </VenueThemeProvider>
          </VenueProvider>
        </OperatorProvider>
      </body>
    </html>
  );
}
