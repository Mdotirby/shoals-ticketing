import type { Metadata } from "next";
import { Bayon, Cairo, Urbanist } from "next/font/google";
import { cookies } from "next/headers";
import "./styles/globals.css";
import Header from "./components/Header";
import VenueThemeProvider from "./components/VenueThemeProvider";
import { VenueProvider } from "./components/VenueContext";
import { OperatorProvider } from "./components/OperatorContext";
import ErrorBoundary from "./components/ErrorBoundary";
import TrackingPixels from "./components/TrackingPixels";
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
        className={`${urbanist.variable} ${cairo.variable} ${bayon.variable} antialiased`}
      >
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
