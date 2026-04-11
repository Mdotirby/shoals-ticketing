import { cookies } from "next/headers";
import { getOperator } from "@/lib/operators";
import { OperatorProvider } from "@/app/components/OperatorContext";
import { VenueProvider } from "@/app/components/VenueContext";
import VenueThemeProvider from "@/app/components/VenueThemeProvider";
import TrackingPixels from "@/app/components/TrackingPixels";
import ErrorBoundary from "@/app/components/ErrorBoundary";

/**
 * Landing page layout — NO Header, NO Footer, NO navigation.
 *
 * This layout is intentionally stripped-down for conversion focus.
 * Every exit path removed = higher ticket conversion rate.
 *
 * Still includes:
 *   - OperatorProvider (branding / pixel ID)
 *   - VenueProvider + VenueThemeProvider (theme colors)
 *   - TrackingPixels (Meta Pixel fires on every landing page)
 *   - ErrorBoundary (graceful failures)
 */
export default async function LandingPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const venueSlug = cookieStore.get("venueSlug")?.value ?? "default";
  const operatorSlug = cookieStore.get("operatorSlug")?.value ?? "venuecore";
  const operator = getOperator(operatorSlug);

  return (
    <OperatorProvider operatorSlug={operatorSlug}>
      <VenueProvider venueSlug={venueSlug}>
        <VenueThemeProvider>
          <TrackingPixels metaPixelId={operator.metaPixelId ?? null} />
          <ErrorBoundary>{children}</ErrorBoundary>
        </VenueThemeProvider>
      </VenueProvider>
    </OperatorProvider>
  );
}
