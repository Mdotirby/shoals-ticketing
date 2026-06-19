import { Section, Row, Column, Hr } from "@react-email/components";
import type { DividerBlockProps } from "../email-document";

export function DividerBlock({ props }: { props: DividerBlockProps }) {
  return (
    <Section style={{ padding: `${props.margin_top}px 0 ${props.margin_bottom}px` }}>
      <Row>
        <Column>
          <Hr style={{ border: 0, borderTop: `1px solid ${props.color || "rgba(255,255,255,0.09)"}`, margin: 0, width: "100%" }} />
        </Column>
      </Row>
    </Section>
  );
}
