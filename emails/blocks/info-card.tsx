import { Section, Row, Column, Text } from "@react-email/components";
import type { InfoCardBlockProps } from "../email-document";

export function InfoCardBlock({ props }: { props: InfoCardBlockProps }) {
  const lines = props.lines.split("\n").filter(Boolean);
  const accent = props.accent_color || "#d0c290";

  return (
    <Section style={{ padding: "0 28px 16px" }}>
      <Row>
        <Column style={{
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${accent}33`,
          borderRadius: 12,
          padding: "18px 20px",
        }}>
          {props.heading && (
            <Text style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {props.heading}
            </Text>
          )}
          {lines.map((line, i) => (
            <Text key={i} style={{ margin: "0 0 6px", fontSize: 15, color: "rgba(255,255,255,0.8)", lineHeight: "1.5" }}>
              {line}
            </Text>
          ))}
        </Column>
      </Row>
    </Section>
  );
}
