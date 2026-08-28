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

/**
 * How close the event itself is — orthogonal to OnSaleState (which tracks
 * proximity to the on-sale date, not the show date). Only set for
 * manually-triggered reminder sends via the broadcast dashboard; undefined
 * preserves today's announcement-only behavior everywhere below.
 */
export type ReminderStage = "week" | "tomorrow" | "tonight";

/** Shared with sendEventAnnouncement.ts so the subject line matches the banner. */
export function getAnnouncementStatusLabel(onSaleState: OnSaleState | undefined): string {
  return onSaleState === "available_now" ? "On Sale Now" : "Just Announced";
}

/** Shared with sendEventAnnouncement.ts so the subject line matches the banner. */
export function getReminderBannerLabel(reminderStage: ReminderStage): string {
  if (reminderStage === "week") return "One Week Away";
  if (reminderStage === "tomorrow") return "Tomorrow";
  return "Tonight's the Night";
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
  reminderStage?: ReminderStage;
}): string {
  if (props.reminderStage === "week") {
    return "One week out. Lock in your plans — tickets are moving.";
  }
  if (props.reminderStage === "tomorrow") {
    return "Doors open tomorrow. This is your last full day to grab tickets before the show.";
  }
  if (props.reminderStage === "tonight") {
    return "Tonight's the night. Grab your ticket before you walk in the door.";
  }
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
  /**
   * Manually-triggered reminder send (broadcast dashboard) — when set,
   * overrides the status banner, subject line, and body copy in favor of
   * event-proximity wording ("One Week Away"/"Tomorrow"/"Tonight's the
   * Night") instead of the on-sale-state wording. Undefined = today's
   * announcement behavior, unchanged.
   */
  reminderStage?: ReminderStage;
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
  reminderStage,
}: EventAnnouncementEmailProps) {
  const isPresale = onSaleState === "presale";
  const isCountdown = onSaleState === "countdown";
  const isAvailableNow = onSaleState === "available_now";
  const resolvedCtaLabel =
    ctaLabel ?? (isPresale ? "Get Presale Access" : isCountdown ? "Set a Reminder" : "Get Your Tickets");
  const bannerLabel = reminderStage ? getReminderBannerLabel(reminderStage) : getAnnouncementStatusLabel(onSaleState);

  return (
    <Html>
      <Head>
        {/* All-dark design, no light variant — see lib/email/OnboardingEmail.tsx
            for why these are needed (prevents clients from partially auto-
            remapping colors in their own dark mode). */}
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <style>{`
          :root { color-scheme: dark; supported-color-schemes: dark; }
          [data-ogsc] .email-bg, [data-ogsb] .email-bg { background-color: #000000 !important; }
          /* The CTA button and status banner are light-on-dark by design —
             without these locks, Gmail/other clients' auto-dark-mode sees a
             light element inside an all-dark email and auto-inverts it,
             turning a white button with dark text into a near-invisible
             black-on-black box (confirmed bug report). */
          [data-ogsc] .email-cta-btn, [data-ogsb] .email-cta-btn {
            background-color: #ffffff !important;
            color: #0a0a0a !important;
          }
          [data-ogsc] .email-status-banner, [data-ogsb] .email-status-banner {
            background-color: #B6C485 !important;
            color: #141414 !important;
          }
        `}</style>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;700;900&family=Archivo+Condensed:wght@600;700&family=Archivo+Expanded:wght@700;800&display=swap"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body className="email-bg" style={{ backgroundColor: "#000000", margin: 0, padding: 0 }}>
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
            <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
              <tbody>
                <tr>
                  <td
                    className="email-status-banner"
                    style={{
                      backgroundColor: SAGE,
                      // Gmail's dark mode (Android/iOS apps) auto-inverts
                      // background-color with no CSS opt-out — it does NOT
                      // touch background-image though, so a same-color
                      // gradient here paints over the inverted color and
                      // keeps the banner sage instead of going murky/olive.
                      backgroundImage: `linear-gradient(${SAGE}, ${SAGE})`,
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

          {/* Event card — border lives on the <td> of a raw table (not on a
              <Section>'s own table) so Outlook's unreliable height
              computation for the display:inline-block Button nested inside
              can't make the side borders run past the visible content; same
              pattern as the status banner above and the date/venue/time
              strip below, both of which already render correctly. */}
          <Section style={{ padding: "0 25px" }}>
          <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
            <tbody>
              <tr>
                <td
                  style={{
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
            <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation" style={{ borderTop: "1px solid #ffffff", borderBottom: "1px solid #ffffff" }}>
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
            {isAvailableNow && !reminderStage && (
              <Text style={{ margin: "20px 0 0", fontFamily: ARCHIVO, fontSize: 14, lineHeight: "22px", color: "#ffffff", textAlign: "center" }}>
                <strong>Tickets are ON SALE now.</strong>
                <br />
                Assemble the crew, make those last minute Shein orders, and snag your spot on the barricade
                <br />
                we just planned your {eventDayOfWeek ?? "upcoming"} night for you.
              </Text>
            )}
            {/* Reminder copy overrides the on-sale-state copy above once a
                reminderStage is set — by this point tickets are always on
                sale, the only thing that changes is how close the show is. */}
            {reminderStage === "week" && (
              <Text style={{ margin: "20px 0 0", fontFamily: ARCHIVO, fontSize: 14, lineHeight: "22px", color: "#ffffff", textAlign: "center" }}>
                <strong>One week out.</strong>
                <br />
                Lock in your plans — tickets are moving.
              </Text>
            )}
            {reminderStage === "tomorrow" && (
              <Text style={{ margin: "20px 0 0", fontFamily: ARCHIVO, fontSize: 14, lineHeight: "22px", color: "#ffffff", textAlign: "center" }}>
                <strong>Doors open tomorrow.</strong>
                <br />
                This is your last full day to grab tickets before the show.
              </Text>
            )}
            {reminderStage === "tonight" && (
              <Text style={{ margin: "20px 0 0", fontFamily: ARCHIVO, fontSize: 14, lineHeight: "22px", color: "#ffffff", textAlign: "center" }}>
                <strong>Tonight&apos;s the night.</strong>
                <br />
                Grab your ticket before you walk in the door.
              </Text>
            )}

            <Section style={{ textAlign: "center", padding: "20px 0 0" }}>
              <Button
                href={ticketUrl}
                className="email-cta-btn"
                style={{
                  backgroundColor: "#ffffff",
                  // Gmail's dark mode (Android/iOS apps) auto-inverts
                  // background-color with no CSS opt-out (confirmed: the
                  // [data-ogsc]/[data-ogsb] rule above only works for
                  // Outlook, not Gmail) — it does NOT touch background-image
                  // though, so a same-color gradient here paints over the
                  // inverted color and keeps the button white instead of
                  // going black-on-black.
                  backgroundImage: "linear-gradient(#ffffff, #ffffff)",
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
                <>
                  <Text style={{ margin: "14px 0 6px", fontFamily: ARCHIVO, fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>
                    Presale code
                  </Text>
                  {/* The button above already auto-fills this code — this
                      chip is the fallback for anyone who copies it by hand.
                      Real clipboard-copy can't run in email (no JS), so an
                      isolated, letter-spaced monospace block is what makes a
                      clean double-tap/double-click select the whole code. */}
                  <table width="100%" border={0} cellPadding={0} cellSpacing={0} role="presentation">
                    <tbody>
                      <tr>
                        <td align="center">
                          <span
                            style={{
                              display: "inline-block",
                              fontFamily: "monospace",
                              fontSize: 16,
                              letterSpacing: 2,
                              color: "#ffffff",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              borderRadius: 8,
                              padding: "8px 16px",
                              userSelect: "all",
                            }}
                          >
                            {presaleCode}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </Section>
                </td>
              </tr>
            </tbody>
          </table>
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
