import { Section } from "@react-email/components";
import type { SpacerBlockProps } from "../email-document";

export function SpacerBlock({ props }: { props: SpacerBlockProps }) {
  return (
    <Section style={{ padding: 0, lineHeight: 0, fontSize: 0 }}>
      <div style={{ height: props.height || 24 }} />
    </Section>
  );
}
