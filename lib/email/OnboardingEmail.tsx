// Matches "onboarding email.psd" (640x1500, "Agent onboarding email" artboard).
// Bespoke component, same pattern as TicketDeliveryEmail.tsx — the DB-backed
// block composer (lib/email/transactional-templates.ts) was tried first for
// this template too and has the same fixed-generic-styling limitation that
// made the first ticket-delivery attempt fail to pixel-match. Archivo fonts,
// matching the house style established across every other template this
// session.
//
// The PSD overlays the heading/greeting/instructions directly on the bottom
// of the hero photo with a gradient fade to black, then the credentials card
// straddles the hero/black boundary. Approximated here as a hero image with
// its own self-contained bottom-fade overlay, followed immediately by a
// solid-black section for everything else — same stacked-section approach
// used by TicketDeliveryEmail/EventAnnouncementEmail, which both render
// correctly across clients.
//
// No "Unsubscribe" link, despite the PSD showing one in the footer — same
// reasoning as the ticket-delivery email: this is a required account-
// credential email (agent/artist/venue-admin invite), not a marketing send,
// and there's no working unsubscribe mechanism wired for it.
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
const ONBOARDING_HERO_URL =
  "https://rgwykfwlnzkblsmtzatx.supabase.co/storage/v1/object/public/hero-images/onboarding-email-hero.jpg";

/** "Agent"/"Artist"/"Owner" -> "an", "Venue Admin"/"Box Office" -> "a". */
export function articleFor(word: string): string {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

export interface OnboardingEmailProps {
  displayName: string;
  roleLabel: string;
  email: string;
  tempPassword: string;
  loginUrl: string;
  ctaLabel: string;
  previewText: string;
}

export function OnboardingEmail({
  displayName,
  roleLabel,
  email,
  tempPassword,
  loginUrl,
  ctaLabel,
  previewText,
}: OnboardingEmailProps) {
  return (
    <Html>
      <Head>
        {/* This design is intentionally all-dark (black bg, white text) with
            no separate light variant. Without these, some clients (Outlook.com,
            Windows Mail, Gmail app) auto-apply their own dark-mode color
            remapping and only flip PART of the design — e.g. background stays
            black but text gets recolored, or vice versa. Declaring "dark"
            explicitly tells them this is already dark-mode-correct and to
            leave it alone. The [data-ogsc]/[data-ogsb] rule is a second layer
            specifically for Outlook.com/Windows Mail, which are known to
            inject their own dark-mode background overrides even when the
            meta tag above is present. */}
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

          {/* Hero — self-contained bottom-fade */}
          <div style={{ position: "relative", lineHeight: 0 }}>
            <Img
              src={ONBOARDING_HERO_URL}
              width="640"
              alt=""
              style={{ width: "100%", display: "block" }}
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to bottom, rgba(0,0,0,0) 55%, rgba(0,0,0,0.9) 100%)",
              }}
            />
          </div>

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
              Welcome to VenueCore
            </Text>
            <Text style={{ margin: "0 0 14px", fontFamily: ARCHIVO, fontSize: 15, lineHeight: "22px", color: "rgba(255,255,255,0.75)" }}>
              Hey {displayName}, you&apos;ve been added as {articleFor(roleLabel)} {roleLabel}!
            </Text>
            <Text style={{ margin: "0 0 8px", fontFamily: ARCHIVO, fontSize: 15, lineHeight: "22px", color: "rgba(255,255,255,0.75)" }}>
              Use the credentials below to sign in and get started. We recommend changing your password after your first login.
            </Text>
          </Section>

          {/* Credentials card */}
          <Section style={{ padding: "12px 28px 0" }}>
            <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 16 }}>
              <tbody>
                <tr>
                  <td style={{ padding: "22px 20px", textAlign: "center" }}>
                    <Text style={{ margin: "0 0 14px", fontFamily: ARCHIVO_EXPANDED, fontWeight: 800, fontSize: 18, textTransform: "uppercase", color: "#ffffff" }}>
                      Your Login Credentials
                    </Text>
                    <Text style={{ margin: "0 0 14px", fontFamily: ARCHIVO, fontSize: 15, color: "rgba(255,255,255,0.9)" }}>
                      Email: {email}
                    </Text>
                    <Text style={{ margin: "0 0 8px", fontFamily: ARCHIVO, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.5)" }}>
                      Temporary Password
                    </Text>
                    {/* The sign-in link below already auto-fills this — this
                        chip is the fallback for anyone who copies it by hand
                        instead. Real clipboard-copy can't run in email (no
                        JS), so an isolated, letter-spaced monospace block is
                        what makes a clean double-tap/double-click select the
                        whole code and nothing else. userSelect is a no-op in
                        most clients but free in the ones that honor it. */}
                    <table width="100%" cellPadding={0} cellSpacing={0} role="presentation">
                      <tbody>
                        <tr>
                          <td align="center">
                            <span
                              style={{
                                display: "inline-block",
                                fontFamily: "monospace",
                                fontSize: 18,
                                letterSpacing: 2,
                                color: "#ffffff",
                                background: "rgba(0,0,0,0.35)",
                                border: "1px solid rgba(255,255,255,0.2)",
                                borderRadius: 8,
                                padding: "10px 18px",
                                userSelect: "all",
                              }}
                            >
                              {tempPassword}
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* CTA — full pill, matches PSD */}
          <Section style={{ padding: "28px 28px 0", textAlign: "center" }}>
            <Button
              href={loginUrl}
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
                padding: "16px 44px",
                borderRadius: 999,
                display: "inline-block",
              }}
            >
              {ctaLabel}
            </Button>
          </Section>

          {/* Fine print */}
          <Section style={{ padding: "28px 28px 0", textAlign: "center" }}>
            <Text style={{ margin: 0, fontFamily: ARCHIVO, fontSize: 13, lineHeight: "20px", color: "rgba(255,255,255,0.5)" }}>
              If you didn&apos;t expect this invitation, you can safely ignore this email. Questions? Contact{" "}
              <Link href="mailto:support@west72ent.com" style={{ color: "rgba(255,255,255,0.6)" }}>
                support@west72ent.com
              </Link>
              .
            </Text>
          </Section>

          {/* Footer */}
          <Section style={{ padding: "40px 25px", textAlign: "center" }}>
            <Hr style={{ borderColor: "#4d4d4d", margin: "0 0 20px" }} />
            <Text style={{ margin: 0, fontFamily: ARCHIVO, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>
              Sent by <strong style={{ color: "rgba(255,255,255,0.85)" }}>VenueCore</strong> because you were invited to join the platform.
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

export default OnboardingEmail;
