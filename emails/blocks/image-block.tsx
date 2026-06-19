import { Img } from "@react-email/components";
import type { ImageBlockProps } from "../email-document";

const alignMap: Record<string, string> = { left: "left", center: "center", right: "right" };

export function ImageBlock({ props }: { props: ImageBlockProps }) {
  if (!props.src) return null;

  const img = (
    <Img
      src={props.src}
      alt={props.alt || ""}
      width={props.width || 600}
      style={{
        display: "block",
        border: 0,
        outline: "none",
        textDecoration: "none",
        // Honor explicit width; fluid at smaller viewports
        width: props.width < 600 ? props.width : "100%",
        maxWidth: props.width || 600,
        height: "auto",
      }}
    />
  );

  return (
    // Outer table stretches full container width; inner td centers image
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{ backgroundColor: props.bg_color || "transparent" }}
    >
      <tr>
        <td align={(alignMap[props.align] as "left" | "center" | "right") || "center"} style={{ padding: 0 }}>
          {props.link_url ? (
            <a href={props.link_url} style={{ display: "block", textDecoration: "none" }}>
              {img}
            </a>
          ) : img}
        </td>
      </tr>
    </table>
  );
}
