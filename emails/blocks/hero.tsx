import { Img, Row, Column, Section, Text } from "@react-email/components";
import type { HeroBlockProps } from "../email-document";

export function HeroBlock({ props }: { props: HeroBlockProps }) {
  return (
    <Section style={{ padding: 0, background: "#111827" }}>
      {props.image_url && (
        <Row>
          <Column>
            <Img
              src={props.image_url}
              alt={props.title}
              width="600"
              style={{ display: "block", width: "100%", maxWidth: 600, height: "auto", border: 0 }}
            />
            {/* Gradient fade from image into body */}
            <div style={{ height: 40, background: "linear-gradient(180deg,rgba(17,24,39,0) 0%,#111827 100%)", marginTop: -40, position: "relative" }} />
          </Column>
        </Row>
      )}
      <Row>
        <Column style={{ padding: "4px 28px 24px" }}>
          {props.kicker && (
            <Text style={{ margin: "0 0 12px", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#d0c290", fontWeight: 700 }}>
              ★ {props.kicker}
            </Text>
          )}
          <Text style={{ margin: "0 0 16px", color: "#ffffff", fontSize: 32, lineHeight: "1.1", fontWeight: 800, letterSpacing: "-0.02em" }}>
            {props.title}
          </Text>
          {props.show_meta && (
            <table role="presentation" cellPadding={0} cellSpacing={0}>
              <tr>
                {props.date && (
                  <td style={{ paddingRight: 16, color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
                    📅&nbsp;{props.date}
                  </td>
                )}
                {props.time && (
                  <td style={{ paddingRight: 16, color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
                    ⏰&nbsp;{props.time}
                  </td>
                )}
                {props.venue && (
                  <td style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
                    📍&nbsp;{props.venue}
                  </td>
                )}
              </tr>
            </table>
          )}
        </Column>
      </Row>
    </Section>
  );
}
