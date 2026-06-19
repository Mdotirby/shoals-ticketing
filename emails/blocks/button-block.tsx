import type { ButtonBlockProps } from "../email-document";

export function ButtonBlock({ props }: { props: ButtonBlockProps }) {
  const align = props.align || "center";
  const bg = props.bg_color || "#d0c290";
  const fg = props.text_color || "#111827";

  return (
    // Outer table controls column alignment
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tr>
        <td align={align} style={{ paddingTop: 8, paddingBottom: 24, paddingLeft: 24, paddingRight: 24 }}>
          {/*
            Inner table wraps the button so Outlook renders the background color
            on the <td> — Outlook ignores background-color on <a> tags but
            honours it on <td>. Rounded corners degrade to square in Outlook,
            which is acceptable.
          */}
          <table role="presentation" cellPadding={0} cellSpacing={0} style={{ margin: align === "center" ? "0 auto" : undefined }}>
            <tr>
              <td
                align="center"
                style={{
                  backgroundColor: bg,
                  borderRadius: 10,
                  // mso-padding-alt lets Outlook use padding inside the td
                  // while the outer dimensions are set by the <a> tag's padding
                }}
              >
                <a
                  href={props.url}
                  style={{
                    display: "inline-block",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    lineHeight: "1",
                    color: fg,
                    textDecoration: "none",
                    paddingTop: 14,
                    paddingBottom: 14,
                    paddingLeft: 32,
                    paddingRight: 32,
                    letterSpacing: "0.2px",
                    // Outlook uses mso-padding-alt on the parent td; keep padding
                    // here for other clients
                  }}
                >
                  {props.label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  );
}
