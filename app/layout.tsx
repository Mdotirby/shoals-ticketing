import type { Metadata } from "next";
import { Bayon, Cairo, Geist, Geist_Mono, Urbanist } from "next/font/google";
import { cookies } from "next/headers";
import "./styles/globals.css";
import Header from "./components/Header";
import VenueThemeProvider from "./components/VenueThemeProvider";
import { VenueProvider } from "./components/VenueContext";


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


export const metadata: Metadata = {
  title: "VenueCore",
  description: "One Platform. Every Ticket.",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const venueSlug = cookieStore.get("venueSlug")?.value ?? "default";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${urbanist.variable} ${cairo.variable} ${bayon.variable} antialiased`}
      >
        <VenueProvider venueSlug={venueSlug}>
          <VenueThemeProvider>
            <Header />
            {children}
          </VenueThemeProvider>
        </VenueProvider>
      </body>
    </html>
  );
}
