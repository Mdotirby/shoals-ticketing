import { Section, Row, Column, Text, Link } from "@react-email/components";
import type { FooterBlockProps } from "../email-document";

export function FooterBlock({ props }: { props: FooterBlockProps }) {
  return (
    // The <!-- ee-footer --> comment tells the dispatcher not to inject a second footer
    <Section style={{ padding: "0 28px 26px" }}>
      {/* ee-footer */}
      <Row>
        <Column>
          <div style={{ height: 1, background: "rgba(255,255,255,0.09)", margin: "8px 0 18px" }} />
          <Text style={{ margin: 0, color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: "1.6", textAlign: "center" }}>
            Sent by <strong style={{ color: "rgba(255,255,255,0.75)" }}>{props.venue_name || "{{venue_name}}"}</strong>
            {props.reason ? ` ${props.reason}` : " because you asked to hear about new shows."}
            <br />
            <Link
              href={props.unsubscribe_url || "{{unsubscribe_url}}"}
              style={{ color: "rgba(255,255,255,0.35)", textDecoration: "underline", display: "inline-block", marginTop: 6 }}
            >
              Unsubscribe
            </Link>
          </Text>
        </Column>
      </Row>
    </Section>
  );
}
