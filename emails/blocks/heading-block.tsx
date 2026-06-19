import type { HeadingBlockProps } from "../email-document";

export function HeadingBlock({ props }: { props: HeadingBlockProps }) {
  const fontSize = props.size || 32;
  const Tag = props.level || "h1";

  // Table wrapper ensures alignment works in Outlook. Heading tags (h1/h2/h3)
  // render consistently across clients with inline styles — never rely on
  // client stylesheets which often strip or override heading defaults.
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
      <tr>
        <td
          align={props.align || "center"}
          style={{ padding: "8px 28px 4px" }}
        >
          <Tag
            style={{
              margin: 0,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
              fontSize,
              fontWeight: 800,
              lineHeight: "1.1",
              letterSpacing: "-0.02em",
              color: props.color || "#ffffff",
              textAlign: props.align || "center",
            }}
          >
            {props.text}
          </Tag>
        </td>
      </tr>
    </table>
  );
}
