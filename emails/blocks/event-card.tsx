import { Section, Row, Column, Text } from "@react-email/components";
import type { EventCardBlockProps } from "../email-document";

export function EventCardBlock({ props }: { props: EventCardBlockProps }) {
  return (
    <Section style={{ padding: "0 28px 16px" }}>
      <Row>
        <Column style={{
          background: "rgba(208,194,144,0.08)",
          border: "1px solid rgba(208,194,144,0.2)",
          borderRadius: 12,
          padding: "18px 20px",
        }}>
          <Text style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#d0c290" }}>
            {props.title}
          </Text>
          {props.date && (
            <Text style={{ margin: "0 0 4px", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
              {props.date}
            </Text>
          )}
          {props.venue && (
            <Text style={{ margin: "0 0 4px", fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
              {props.venue}
            </Text>
          )}
          {(props.ticket_count || props.total) && (
            <Text style={{ margin: "10px 0 0", fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
              {props.ticket_count && `${props.ticket_count} ticket${props.ticket_count === "1" ? "" : "s"}`}
              {props.ticket_count && props.total && " · "}
              {props.total && `${props.total}`}
            </Text>
          )}
        </Column>
      </Row>
    </Section>
  );
}
