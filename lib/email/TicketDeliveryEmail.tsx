// Matches "your ticket is here email.psd" (640x1500). Bespoke component,
// same quality bar as standalone-emails/templates/* — the DB-backed block
// composer (lib/email/transactional-templates.ts) was tried first and
// abandoned: its block components have their own generic fixed styling
// (fonts, spacing, card treatment) with no way to pixel-match a specific
// design, which is exactly why the first attempt at this "looked like the
// old design" despite the copy being updated. Archivo fonts, matching the
// house style already established for the announcement/digest emails.
//
// The PSD overlays the heading/greeting directly on the bottom of the hero
// photo with a gradient fade to black. Approximated here as a hero image
// with its own self-contained bottom-fade overlay, followed immediately by
// a solid-black section for the heading/greeting — not true absolute
// positioning of text over the image, since Outlook doesn't reliably
// support that. Same stacked-section approach used by the other two
// templates, which both render correctly across clients.
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

export interface TicketDeliveryEmailProps {
  firstName: string;
  eventName: string;
  eventDate: string; // pre-formatted, e.g. "Thursday, August 13, 7:00pm"
  venueName: string;
  ticketCount: number;
  totalAmount: number;
  heroImageUrl: string; // events.image_url — NOT the email flyer
  ticketUrl: string;
  previewText: string;
}

export function TicketDeliveryEmail({
  firstName,
  eventName,
  eventDate,
  venueName,
  ticketCount,
  totalAmount,
  heroImageUrl,
  ticketUrl,
  previewText,
}: TicketDeliveryEmailProps) {
  return (
    <Html>
      <Head>
        {/* All-dark design, no light variant — see OnboardingEmail.tsx for
            why these are needed (prevents clients from partially auto-
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

          {/* Hero — self-contained bottom-fade, event.image_url (not the
              email flyer) per explicit requirement */}
          {heroImageUrl && (
            <div style={{ position: "relative", lineHeight: 0 }}>
              <Img
                src={heroImageUrl}
                width="640"
                alt={eventName}
                style={{ width: "100%", display: "block" }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to bottom, rgba(0,0,0,0) 60%, rgba(0,0,0,0.85) 100%)",
                }}
              />
            </div>
          )}

          {/* Heading + greeting */}
          <Section style={{ padding: "28px 28px 0", textAlign: "center" }}>
            <Text
              style={{
                margin: "0 0 20px",
                fontFamily: ARCHIVO_EXPANDED,
                fontWeight: 800,
                fontSize: 30,
                lineHeight: "36px",
                textTransform: "uppercase",
                color: "#ffffff",
              }}
            >
              Your Ticket Is Waiting For You
            </Text>
            <Text style={{ margin: "0 0 14px", fontFamily: ARCHIVO, fontSize: 15, lineHeight: "22px", color: "rgba(255,255,255,0.75)" }}>
              Hey {firstName}, Thank you for coming to the show!
            </Text>
            <Text style={{ margin: "0 0 8px", fontFamily: ARCHIVO, fontSize: 15, lineHeight: "22px", color: "rgba(255,255,255,0.75)" }}>
              You&apos;re all set! Here is everything you will need for the show:
            </Text>
          </Section>

          {/* Show info card */}
          <Section style={{ padding: "12px 28px 0" }}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ background: "rgba(136,136,136,0.12)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "22px 20px", textAlign: "center" }}>
                    <Text style={{ margin: "0 0 10px", fontFamily: ARCHIVO_EXPANDED, fontWeight: 800, fontSize: 20, textTransform: "uppercase", color: "#ffffff" }}>
                      {eventName}
                    </Text>
                    <Text style={{ margin: "0 0 2px", fontFamily: ARCHIVO, fontSize: 15, color: "rgba(255,255,255,0.85)" }}>
                      {eventDate}
                    </Text>
                    <Text style={{ margin: "0 0 10px", fontFamily: ARCHIVO, fontSize: 15, color: "rgba(255,255,255,0.85)" }}>
                      {venueName}
                    </Text>
                    <Text style={{ margin: 0, fontFamily: ARCHIVO, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                      {ticketCount} ticket{ticketCount !== 1 ? "s" : ""} &middot; ${totalAmount.toFixed(2)}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* QR notice */}
          <Section style={{ padding: "28px 28px 0", textAlign: "center" }}>
            <Text style={{ margin: "0 0 10px", fontFamily: ARCHIVO, fontWeight: 700, fontSize: 14, letterSpacing: 1, textTransform: "uppercase", color: "#ffffff" }}>
              Your QR Code is your ticket
            </Text>
            <Text style={{ margin: "0 0 24px", fontFamily: ARCHIVO, fontSize: 14, lineHeight: "22px", color: "rgba(255,255,255,0.6)" }}>
              Present your QR code at the door for entry. Screenshot it, save it to your photos, or print a copy — just have it ready when you arrive.
            </Text>

            <Button
              href={ticketUrl}
              className="email-cta-btn"
              style={{
                backgroundColor: "#ffffff",
                // Gmail's dark mode auto-inverts background-color with no
                // CSS opt-out — it does NOT touch background-image, so a
                // same-color gradient here keeps the button white instead
                // of going black-on-black.
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
              View My Ticket
            </Button>
          </Section>

          {/* Fine print */}
          <Section style={{ padding: "28px 28px 0", textAlign: "center" }}>
            <Text style={{ margin: 0, fontFamily: ARCHIVO, fontSize: 12, lineHeight: "18px", color: "rgba(255,255,255,0.4)" }}>
              All sales are final. Refunds are only issued if the event is cancelled by the organizer. Questions? Contact{" "}
              <Link href="mailto:support@west72ent.com" style={{ color: "rgba(255,255,255,0.5)" }}>
                support@west72ent.com
              </Link>
              .
            </Text>
          </Section>

          {/* Footer */}
          <Section style={{ padding: "40px 25px", textAlign: "center" }}>
            <Hr style={{ borderColor: "#4d4d4d", margin: "0 0 20px" }} />
            <Text style={{ margin: 0, fontFamily: ARCHIVO, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              Sent by <strong style={{ color: "rgba(255,255,255,0.85)" }}>West 72 Entertainment LLC</strong>
              <br />
              because, well, you bought a ticket
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

export default TicketDeliveryEmail;
