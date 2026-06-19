import { Section, Row, Column, Button } from "@react-email/components";
import type { ButtonBlockProps } from "../email-document";

const alignMap: Record<string, "left" | "center" | "right"> = {
  left: "left",
  center: "center",
  right: "right",
};

export function ButtonBlock({ props }: { props: ButtonBlockProps }) {
  return (
    <Section>
      <Row>
        <Column style={{ padding: "8px 24px 24px", textAlign: alignMap[props.align] ?? "center" }}>
          {/* Outlook VML fallback */}
          <Button
            href={props.url}
            style={{
              display: "inline-block",
              backgroundColor: props.bg_color || "#d0c290",
              color: props.text_color || "#111827",
              textDecoration: "none",
              padding: "14px 32px",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "0.3px",
            }}
          >
            {props.label}
          </Button>
        </Column>
      </Row>
    </Section>
  );
}
