import { Section, Row, Column, Hr } from "@react-email/components";
import type { DividerBlockProps } from "../email-document";

export function DividerBlock({ props }: { props: DividerBlockProps }) {
  return (
    <Section style={{ padding: `${props.margin_top}px 28px ${props.margin_bottom}px` }}>
      <Row>
        <Column>
          <Hr style={{ border: 0, borderTop: `1px solid ${props.color || "rgba(255,255,255,0.09)"}`, margin: 0 }} />
        </Column>
      </Row>
    </Section>
  );
}
