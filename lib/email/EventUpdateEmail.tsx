// A message from the venue to everyone holding a ticket to one show.
//
// Deliberately plainer than TicketDeliveryEmail: that one is a keepsake with
// a hero image and a big button, this one is a notice — doors moved, parking
// changed, thank you for coming. The thing being read is what the sender
// typed, so the shell stays out of its way and the show's own details sit
// underneath, where they answer "which show is this about?" without the
// sender having to retype them every time (and get them stale).
//
// Same Archivo house style and the same stacked-section approach as the other
// templates, which render correctly across clients.
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

const ARCHIVO = '"Archivo", Arial, sans-serif';
const ARCHIVO_EXPANDED = '"Archivo Expanded", "Arial Black", Arial, sans-serif';

export interface EventUpdateEmailProps {
  firstName: string;
  /** The body as typed, with its line breaks. Rendered as text, never as HTML. */
  message: string;
  eventName: string;
  /** Pre-formatted, e.g. "Saturday, October 24, 2026". */
  eventDate: string;
  doorsTime?: string | null;
  showTime?: string | null;
  venueName: string;
  eventUrl: string;
  senderName: string;
  previewText: string;
}

export function EventUpdateEmail({
  firstName,
  message,
  eventName,
  eventDate,
  doorsTime,
  showTime,
  venueName,
  eventUrl,
  senderName,
  previewText,
}: EventUpdateEmailProps) {
  // Paragraphs, as typed. Split rather than dangerouslySetInnerHTML: the body
  // is admin-entered text and it renders as text, so nothing anyone types can
  // become markup in a customer's inbox.
  const paragraphs = message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: "#0b0b0d", margin: 0, padding: 0, fontFamily: ARCHIVO }}>
        <Container style={{ width: "100%", maxWidth: 640, margin: "0 auto", backgroundColor: "#0b0b0d" }}>
          <Section style={{ padding: "36px 32px 0" }}>
            <Text
              style={{
                fontFamily: ARCHIVO_EXPANDED,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.45)",
                margin: "0 0 18px",
              }}
            >
              A note about your tickets
            </Text>

            <Text style={{ fontSize: 16, lineHeight: 1.6, color: "#ffffff", margin: "0 0 16px" }}>
              Hi {firstName},
            </Text>

            {paragraphs.map((p, i) => (
              <Text key={i} style={{ fontSize: 16, lineHeight: 1.65, color: "rgba(255,255,255,0.86)", margin: "0 0 16px", whiteSpace: "pre-line" }}>
                {p}
              </Text>
            ))}

            <Text style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(255,255,255,0.86)", margin: "22px 0 0" }}>
              — {senderName}
            </Text>
          </Section>

          <Section style={{ padding: "28px 32px 0" }}>
            <Hr style={{ borderColor: "rgba(255,255,255,0.12)", margin: "0 0 20px" }} />
            {/* Which show this is about. Filled from the event, so it cannot
                drift from what the storefront says. */}
            <Text
              style={{
                fontFamily: ARCHIVO_EXPANDED,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.4)",
                margin: "0 0 10px",
              }}
            >
              Your show
            </Text>
            <Text style={{ fontSize: 18, fontWeight: 700, color: "#ffffff", margin: "0 0 6px" }}>
              {eventName}
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.6)", margin: 0 }}>
              {eventDate}
              {showTime ? ` · Show ${showTime}` : ""}
              {doorsTime ? ` · Doors ${doorsTime}` : ""}
              <br />
              {venueName}
            </Text>
            <Text style={{ fontSize: 14, margin: "14px 0 0" }}>
              <Link href={eventUrl} style={{ color: "#ffffff", textDecoration: "underline" }}>
                View the event page
              </Link>
            </Text>
          </Section>

          <Section style={{ padding: "28px 32px 40px" }}>
            <Hr style={{ borderColor: "rgba(255,255,255,0.12)", margin: "0 0 16px" }} />
            <Text style={{ fontSize: 11, lineHeight: 1.6, color: "rgba(255,255,255,0.35)", margin: 0 }}>
              You are receiving this because you bought tickets to this show. It is a
              one-off message about your order, not a newsletter.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
