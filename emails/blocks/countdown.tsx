import { Section, Row, Column, Text } from "@react-email/components";
import type { CountdownBlockProps } from "../email-document";

export function CountdownBlock({ props }: { props: CountdownBlockProps }) {
  return (
    <Section style={{ padding: "0 28px 16px" }}>
      <Row>
        <Column style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.09)",
          borderRadius: 14,
          padding: "22px 20px 20px",
          textAlign: "center",
        }}>
          <Text style={{ margin: "0 0 10px", fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>
            {props.label || "Tickets on sale in"}
          </Text>
          <Text style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "#d0c290", lineHeight: "1", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>
            {props.days}d&nbsp;&nbsp;{props.hours}h&nbsp;&nbsp;{props.minutes}m
          </Text>
          {props.subtext && (
            <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, margin: "14px 0 0", lineHeight: "1.55", padding: "0 8px" }}>
              {props.subtext}
            </Text>
          )}
        </Column>
      </Row>
    </Section>
  );
}
