// Matches "Newsletter:allupcoming events.psd" (640x3370, 3-event example).
// Fonts: Archivo family, same as EventAnnouncementEmail.tsx. Card layout is
// left-aligned (unlike the announcement email's centered card) — a real
// difference in this comp, not an oversight.
import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const ARCHIVO = '"Archivo", Arial, sans-serif';
const ARCHIVO_CONDENSED = '"Archivo Condensed", "Arial Narrow", Arial, sans-serif';
const ARCHIVO_EXPANDED = '"Archivo Expanded", "Arial Black", Arial, sans-serif';
const ASSET_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://west72ent.com";

// Static brand banner — same on every send, not event-specific. Flattened
// (photo + gradient overlay + "CHECK OUT WHAT'S ON" text) into one asset,
// same approach as the per-event flyer images, rather than trying to
// reconstruct the gradient overlay in email-safe CSS.
const HERO_BANNER_URL =
  "https://rgwykfwlnzkblsmtzatx.supabase.co/storage/v1/object/public/hero-images/newsletter-check-out-whats-on-banner.png";

export interface UpcomingEventSummary {
  id: string;
  eventName: string;
  eventDate: string; // e.g. "JULY 10"
  venueName: string;
  ticketPrice?: string; // e.g. "$10" — rendered as "FROM {ticketPrice}"
  heroImageUrl: string;
  ticketUrl: string;
}

export interface UpcomingEventsEmailProps {
  events: UpcomingEventSummary[];
  previewText: string;
  calendarUrl?: string;
}

export function UpcomingEventsEmail({
  events,
  previewText,
  calendarUrl = `${ASSET_ORIGIN}/events`,
}: UpcomingEventsEmailProps) {
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
          /* The CTA button is light-on-dark by design — without this lock,
             Gmail/other clients' auto-dark-mode sees a light element inside
             an all-dark email and auto-inverts it, turning a white button
             with dark text into a near-invisible black-on-black box. */
          [data-ogsc] .email-cta-btn, [data-ogsb] .email-cta-btn {
            background-color: #ffffff !important;
            color: #0a0a0a !important;
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
          <Hr style={{ borderColor: "rgba(255,255,255,0.15)", margin: 0 }} />

          {/* Hero banner — static asset, not per-send content */}
          <Img
            src={HERO_BANNER_URL}
            width="640"
            alt="Check out what's on"
            style={{ width: "100%", display: "block" }}
          />

          {/* Event cards */}
          <Section style={{ padding: "24px 24px 0" }}>
            {events.map((ev, i) => (
              <table
                key={ev.id}
                width="100%"
                cellPadding={0}
                cellSpacing={0}
                role="presentation"
                style={{
                  border: "1px solid #ffffff",
                  marginBottom: i === events.length - 1 ? 0 : 24,
                }}
              >
                <tbody>
                  <tr>
                    <td>
                      {ev.heroImageUrl && (
                        <Img
                          src={ev.heroImageUrl}
                          width="587"
                          alt={ev.eventName}
                          style={{ width: "100%", display: "block" }}
                        />
                      )}
                      <div style={{ padding: "18px 16px" }}>
                        <Text
                          style={{
                            margin: "0 0 4px",
                            fontFamily: ARCHIVO_EXPANDED,
                            fontWeight: 800,
                            fontSize: 20,
                            textTransform: "uppercase",
                            color: "#ffffff",
                          }}
                        >
                          {ev.eventName}
                        </Text>
                        <Text
                          style={{
                            margin: "0 0 2px",
                            fontFamily: ARCHIVO_CONDENSED,
                            fontWeight: 700,
                            fontSize: 13,
                            letterSpacing: 0.5,
                            textTransform: "uppercase",
                            color: "rgba(255,255,255,0.75)",
                          }}
                        >
                          {ev.eventDate} &bull; {ev.venueName}
                        </Text>
                        {ev.ticketPrice && (
                          <Text
                            style={{
                              margin: "0 0 14px",
                              fontFamily: ARCHIVO,
                              fontSize: 11,
                              color: "rgba(255,255,255,0.4)",
                            }}
                          >
                            FROM {ev.ticketPrice}
                          </Text>
                        )}
                        <Button
                          href={ev.ticketUrl}
                          className="email-cta-btn"
                          style={{
                            // #fefefe, not pure #ffffff — Apple Mail's dark
                            // mode specifically auto-inverts colors that are
                            // exactly #ffffff/#000000 regardless of other
                            // protections. One-hex-digit nudge, visually
                            // identical, dodges the trigger.
                            backgroundColor: "#fefefe",
                            // Gmail's dark mode auto-inverts background-color
                            // with no CSS opt-out — it does NOT touch
                            // background-image, so a same-color gradient
                            // here keeps the button white instead of
                            // going black-on-black.
                            backgroundImage: "linear-gradient(#fefefe, #fefefe)",
                            color: "#0a0a0a",
                            fontFamily: ARCHIVO_CONDENSED,
                            fontWeight: 900,
                            fontSize: 13,
                            letterSpacing: 1,
                            textTransform: "uppercase",
                            padding: "11px 28px",
                            display: "inline-block",
                          }}
                        >
                          Get Tickets
                        </Button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            ))}
          </Section>

          {/* Full calendar link */}
          <Section style={{ padding: "28px 24px 0", textAlign: "center" }}>
            <Link
              href={calendarUrl}
              style={{
                fontFamily: ARCHIVO,
                fontSize: 14,
                fontWeight: 600,
                color: "#ffffff",
                textDecoration: "underline",
              }}
            >
              Check out the full calendar &nbsp;&rarr;
            </Link>
          </Section>

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

export default UpcomingEventsEmail;
