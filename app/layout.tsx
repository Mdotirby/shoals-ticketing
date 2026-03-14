import type { Metadata } from "next";
import { Bayon, Cairo, Geist, Geist_Mono, Urbanist } from "next/font/google";
import { cookies } from "next/headers";
import "./styles/globals.css";
import Header from "./components/Header";
import VenueThemeProvider from "./components/VenueThemeProvider";
import { VenueProvider } from "./components/VenueContext";
import { OperatorProvider } from "./components/OperatorContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { getOperator } from "@/lib/operators";


const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

  return {
    title: operator.name,
    description: operator.tagline,
    icons: {
      icon: [
        { url: operator.favicon, sizes: "32x32", type: "image/png" },
        { url: operator.favicon, sizes: "192x192", type: "image/png" },
      ],
      apple: operator.favicon,
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

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${urbanist.variable} ${cairo.variable} ${bayon.variable} antialiased`}
      >
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
