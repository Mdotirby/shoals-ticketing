// Matches "New announce with Presale.psd" (640x1685). Fonts confirmed by
// Matt as the actual design fonts: Archivo / Archivo Condensed / Archivo
// Expanded (all open-license Google Fonts). Loaded via <link> as a
// progressive enhancement since Outlook and some clients ignore custom web
// fonts; the fallback stacks below are what most recipients will actually
// see. Width assignment (Expanded for the big headliner name, Condensed for
// the tight date/venue/time columns, base Archivo elsewhere) is a visual
// read of the comp, not confirmed layer-by-layer — flag anything that looks
// off and I'll reassign.
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";

const ARCHIVO = '"Archivo", Arial, sans-serif';
const ARCHIVO_CONDENSED = '"Archivo Condensed", "Arial Narrow", Arial, sans-serif';
const ARCHIVO_EXPANDED = '"Archivo Expanded", "Arial Black", Arial, sans-serif';
const SAGE = "#B6C485";
const ASSET_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://west72ent.com";

export interface SponsorLogo {
  name: string;
  logoUrl: string;
}

export type OnSaleState = "countdown" | "presale" | "available_now";

/** Shared with sendEventAnnouncement.ts so the subject line matches the banner. */
export function getAnnouncementStatusLabel(onSaleState: OnSaleState | undefined): string {
  return onSaleState === "available_now" ? "On Sale Now" : "Just Announced";
}

/**
 * Plain-text version of whichever state-dependent paragraph renders just
 * above the CTA (see the JSX below) — used as the inbox preview snippet
 * (previewText) so it matches what the card itself says instead of a
 * generic "event — date at venue" string. Wording must stay in sync with
 * the JSX blocks below by hand; the JSX needs <br/>/<strong> the preview
 * text doesn't.
 */
export function getAnnouncementBodyText(props: {
  onSaleState?: OnSaleState;
  onSaleDateLabel?: string;
  daysUntilOnSale?: number;
  hoursUntilOnSale?: number;
  presaleOpensLabel?: string;
  publicOnSaleLabel?: string;
  eventDayOfWeek?: string;
}): string {
  if (props.onSaleState === "presale") {
    return `Presale opens ${props.presaleOpensLabel}. Public onsale ${props.publicOnSaleLabel}. Presale code lives at the bottom of this email, the rest of the internet finds out later.`;
  }
  if (props.onSaleState === "countdown") {
    const away =
      typeof props.daysUntilOnSale === "number"
        ? ` · ${props.daysUntilOnSale}d ${props.hoursUntilOnSale ?? 0}h away`
        : "";
    return `Tickets on sale ${props.onSaleDateLabel}${away}`;
  }
  return `Tickets are ON SALE now. Assemble the crew, make those last minute Shein orders, and snag your spot on the barricade — we just planned your ${props.eventDayOfWeek ?? "upcoming"} night for you.`;
}

export interface EventAnnouncementEmailProps {
  eventName: string;
  /** Short marketing subheader shown below the headliner, e.g. "The In Defense of Drinking Tour". Optional — omitted if the show has no distinct tour/show name. */
  eventSubtitle?: string;
  eventDate: string;
  eventTime: string;
  /** e.g. "Friday" — used in the on-sale-now copy ("we planned your Friday night for you"). */
  eventDayOfWeek?: string;
  venueName: string;
  venueAddress?: string;
  heroImageUrl: string;
  headlinerName: string;
  supportingActs?: string[];
  ticketUrl: string;
  ticketPrice?: string;
  sponsorLogos?: SponsorLogo[];
  previewText: string;
  ctaLabel?: string;
  /**
   * Snapshot at send time, not a live-ticking countdown (email clients don't
   * run JS) — mirrors modules/email-engine/lib/eventContext.ts's approach.
   *   "countdown"      — announced, presale hasn't opened (or none exists)
   *   "presale"        — presale window open, public on-sale still ahead
   *   "available_now"  — public on-sale has started
   */
  onSaleState?: OnSaleState;
  onSaleDateLabel?: string;
  daysUntilOnSale?: number;
  hoursUntilOnSale?: number;
  presaleCode?: string;
  presaleOpensLabel?: string;
  publicOnSaleLabel?: string;
}

export function EventAnnouncementEmail({
  eventName,
  eventSubtitle,
  eventDate,
  eventTime,
  eventDayOfWeek,
  venueName,
  venueAddress,
  heroImageUrl,
  headlinerName,
  supportingActs = [],
  ticketUrl,
  sponsorLogos = [],
  previewText,
  ctaLabel,
  onSaleState = "available_now",
  onSaleDateLabel,
  daysUntilOnSale,
  hoursUntilOnSale,
  presaleCode,
  presaleOpensLabel,
  publicOnSaleLabel,
}: EventAnnouncementEmailProps) {
  const isPresale = onSaleState === "presale";
  const isCountdown = onSaleState === "countdown";
  const isAvailableNow = onSaleState === "available_now";
  const resolvedCtaLabel =
    ctaLabel ?? (isPresale ? "Get Presale Access" : isCountdown ? "Set a Reminder" : "Get Your Tickets");
  const bannerLabel = getAnnouncementStatusLabel(onSaleState);

  return (
    <Html>
      <Head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;900&family=Archivo+Condensed:wght@600;700&family=Archivo+Expanded:wght@700;800&display=swap"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#000000", margin: 0, padding: 0 }}>
        <Container style={{ width: 640, maxWidth: 640, margin: "0 auto" }}>
          {/* Header */}
          <Section style={{ padding: "32px 0", textAlign: "center" }}>
            <Img
              src={`${ASSET_ORIGIN}/West72_Logos/W72_tech_wordmark_white.png`}
              width="376"
              alt="West 72 Entertainment"
              style={{ margin: "0 auto", display: "block" }}
            />
          </Section>

          {/* Status banner — "Just Announced" or "On Sale Now" depending on state */}
          <Section style={{ padding: "0 25px" }}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td
                    style={{
                      backgroundColor: SAGE,
                      textAlign: "center",
                      padding: "10px 0",
                    }}
                  >
                    <Text
                      style={{
                        margin: 0,
                        fontFamily: ARCHIVO,
                        fontWeight: 700,
                        fontSize: 14,
                        letterSpacing: 4,
                        textTransform: "uppercase",
                        color: "#141414",
                      }}
                    >
                      {bannerLabel}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Hero flyer — content baked into the image, supplied per show */}
          {heroImageUrl && (
            <Section style={{ padding: "18px 25px 0" }}>
              <Img
                src={heroImageUrl}
                width="590"
                alt={eventName}
                style={{ width: "100%", display: "block", border: "1px solid #ffffff" }}
              />
            </Section>
          )}

          {/* Event card */}
          <Section
            style={{
              margin: "0 25px",
              borderLeft: "1px solid #ffffff",
              borderRight: "1px solid #ffffff",
              padding: "24px 20px",
            }}
          >
            <Text
              style={{
                margin: "0 0 2px",
                fontFamily: ARCHIVO_EXPANDED,
                fontWeight: 800,
                fontSize: 26,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#ffffff",
                textAlign: "center",
              }}
            >
              {headlinerName}
            </Text>
            {eventSubtitle && (
              <Text
                style={{
                  margin: "0 0 20px",
                  fontFamily: ARCHIVO,
                  fontWeight: 600,
                  fontSize: 15,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.75)",
                  textAlign: "center",
                }}
              >
                {eventSubtitle}
              </Text>
            )}
            {supportingActs.length > 0 && (
              <Text
                style={{
                  margin: "0 0 20px",
                  fontFamily: ARCHIVO,
                  fontSize: 13,
                  color: "rgba(255,255,255,0.55)",
                  textAlign: "center",
                }}
              >
                {supportingActs.join(" · ")}
              </Text>
            )}

            {/* Date / Venue / Time strip */}
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ borderTop: "1px solid #ffffff", borderBottom: "1px solid #ffffff" }}>
              <tbody>
                <tr>
                  <td style={{ width: "33%", borderRight: "1px solid #ffffff", padding: "10px 8px", textAlign: "center" }}>
                    <Text style={{ margin: "0 0 4px", fontFamily: ARCHIVO_CONDENSED, fontWeight: 600, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Date</Text>
                    <Text style={{ margin: 0, fontFamily: ARCHIVO_CONDENSED, fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", color: "#ffffff" }}>{eventDate}</Text>
                  </td>
                  <td style={{ width: "34%", borderRight: "1px solid #ffffff", padding: "10px 8px", textAlign: "center" }}>
                    <Text style={{ margin: "0 0 4px", fontFamily: ARCHIVO_CONDENSED, fontWeight: 600, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Venue</Text>
                    <Text style={{ margin: 0, fontFamily: ARCHIVO_CONDENSED, fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", color: "#ffffff" }}>
                      {venueName}
                      {venueAddress ? <><br />{venueAddress}</> : null}
                    </Text>
                  </td>
                  <td style={{ width: "33%", padding: "10px 8px", textAlign: "center" }}>
                    <Text style={{ margin: "0 0 4px", fontFamily: ARCHIVO_CONDENSED, fontWeight: 600, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Time</Text>
                    <Text style={{ margin: 0, fontFamily: ARCHIVO_CONDENSED, fontWeight: 700, fontSize: 15, letterSpacing: 1, textTransform: "uppercase", color: "#ffffff" }}>{eventTime}</Text>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* State-dependent copy */}
            {isPresale && (
              <Text style={{ margin: "20px 0 0", fontFamily: ARCHIVO, fontSize: 14, lineHeight: "22px", color: "#ffffff", textAlign: "center" }}>
                <strong>Presale opens {presaleOpensLabel}.</strong>
                <br />
                Public onsale {publicOnSaleLabel}.
                <br />
                Presale code lives at the bottom of this email, the rest of the internet finds out later.
              </Text>
            )}
            {isCountdown && (
              <Text style={{ margin: "20px 0 0", fontFamily: ARCHIVO, fontSize: 14, color: "#ffffff", textAlign: "center" }}>
                Tickets on sale {onSaleDateLabel}
                {typeof daysUntilOnSale === "number" &&
                  ` · ${daysUntilOnSale}d ${hoursUntilOnSale ?? 0}h away`}
              </Text>
            )}
            {isAvailableNow && (
              <Text style={{ margin: "20px 0 0", fontFamily: ARCHIVO, fontSize: 14, lineHeight: "22px", color: "#ffffff", textAlign: "center" }}>
                <strong>Tickets are ON SALE now.</strong>
                <br />
                Assemble the crew, make those last minute Shein orders, and snag your spot on the barricade
                <br />
                we just planned your {eventDayOfWeek ?? "upcoming"} night for you.
              </Text>
            )}

            <Section style={{ textAlign: "center", padding: "20px 0 0" }}>
              <Button
                href={ticketUrl}
                style={{
                  backgroundColor: "#ffffff",
                  color: "#0a0a0a",
                  fontFamily: ARCHIVO_CONDENSED,
                  fontWeight: 900,
                  fontSize: 15,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  padding: "14px 40px",
                  display: "inline-block",
                }}
              >
                {resolvedCtaLabel}
              </Button>
              {isPresale && presaleCode && (
                <Text style={{ margin: "12px 0 0", fontFamily: ARCHIVO, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
                  Presale code: <strong style={{ color: "#ffffff" }}>{presaleCode}</strong>
                </Text>
              )}
            </Section>
          </Section>

          {sponsorLogos.length > 0 && (
            <Section style={{ padding: "28px 25px 0", textAlign: "center" }}>
              {sponsorLogos.map((s) => (
                <Img
                  key={s.name}
                  src={s.logoUrl}
                  alt={s.name}
                  height="32"
                  style={{ display: "inline-block", margin: "0 12px", height: 32 }}
                />
              ))}
            </Section>
          )}

          {/* Footer */}
          <Section style={{ padding: "40px 25px", textAlign: "center" }}>
            <Hr style={{ borderColor: "#4d4d4d", margin: "0 0 20px" }} />
            <Text style={{ margin: 0, fontFamily: ARCHIVO, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              Sent by <strong style={{ color: "rgba(255,255,255,0.85)" }}>West 72 Entertainment LLC</strong>
              <br />
              because, well, you asked me to :)
              <br />
              <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style={{ color: "rgba(255,255,255,0.6)" }}>
                Unsubscribe
              </a>
            </Text>
            <Img
              src={`${ASSET_ORIGIN}/West72_Logos/W72_tech_icon_white.png`}
              width="40"
              alt=""
              style={{ margin: "20px auto 0", display: "block", opacity: 0.6 }}
            />
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default EventAnnouncementEmail;
