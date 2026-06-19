import { Section, Row, Column, Text } from "@react-email/components";
import type { TextBlockProps } from "../email-document";

export function TextBlock({ props }: { props: TextBlockProps }) {
  const paragraphs = props.content.split(/\n{2,}/).filter(Boolean);
  return (
    <Section>
      <Row>
        <Column style={{ padding: "8px 28px" }}>
          {paragraphs.map((p, i) => (
            <Text key={i} style={{ margin: "0 0 14px", color: "rgba(255,255,255,0.85)", fontSize: 15, lineHeight: "1.65" }}>
              {p}
            </Text>
          ))}
        </Column>
      </Row>
    </Section>
  );
}
