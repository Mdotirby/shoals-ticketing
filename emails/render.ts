import { render, Html, Head, Body, Preview } from "@react-email/components";
import { createElement } from "react";
import type { EmailDocument, Block } from "./email-document";
import { ImageBlock } from "./blocks/image-block";
import { HeadingBlock } from "./blocks/heading-block";
import { HeroBlock } from "./blocks/hero";
import { TextBlock } from "./blocks/text-block";
import { ButtonBlock } from "./blocks/button-block";
import { EventCardBlock } from "./blocks/event-card";
import { InfoCardBlock } from "./blocks/info-card";
import { CountdownBlock } from "./blocks/countdown";
import { DividerBlock } from "./blocks/divider";
import { SpacerBlock } from "./blocks/spacer";
import { FooterBlock } from "./blocks/footer";

function renderBlock(block: Block) {
  switch (block.type) {
    case "image":      return createElement(ImageBlock,      { key: block.id, props: block.props });
    case "heading":    return createElement(HeadingBlock,    { key: block.id, props: block.props });
    case "hero":       return createElement(HeroBlock,       { key: block.id, props: block.props });
    case "text":       return createElement(TextBlock,       { key: block.id, props: block.props });
    case "button":     return createElement(ButtonBlock,     { key: block.id, props: block.props });
    case "event_card": return createElement(EventCardBlock,  { key: block.id, props: block.props });
    case "info_card":  return createElement(InfoCardBlock,   { key: block.id, props: block.props });
    case "countdown":  return createElement(CountdownBlock,  { key: block.id, props: block.props });
    case "divider":    return createElement(DividerBlock,    { key: block.id, props: block.props });
    case "spacer":     return createElement(SpacerBlock,     { key: block.id, props: block.props });
    case "footer":     return createElement(FooterBlock,     { key: block.id, props: block.props });
  }
}

export async function renderDocument(doc: EmailDocument): Promise<string> {
  const bg = doc.bg_color || "#000000";

  const element = createElement(
    Html,
    { lang: "en" },
    createElement(Head, null,
      createElement("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
      createElement("meta", { name: "x-apple-disable-message-reformatting" }),
    ),
    doc.preview_text ? createElement(Preview, null, doc.preview_text) : null,
    createElement(
      Body,
      {
        style: {
          margin: 0,
          padding: 0,
          backgroundColor: bg,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: "antialiased" as const,
          WebkitTextSizeAdjust: "100%" as const,
        },
      },
      // Outer 100%-width table centers the email on desktop.
      // Inner table is capped at 640px and goes full-width on mobile.
      createElement("table", {
        role: "presentation",
        width: "100%",
        cellPadding: 0,
        cellSpacing: 0,
        style: { borderCollapse: "collapse", backgroundColor: bg },
      },
        createElement("tr", null,
          createElement("td", { align: "center", style: { padding: "24px 0" } },
            createElement("table", {
              role: "presentation",
              width: "640",
              cellPadding: 0,
              cellSpacing: 0,
              style: {
                maxWidth: 640,
                width: "100%",
                borderCollapse: "collapse",
                backgroundColor: bg,
              },
            },
              createElement("tr", null,
                createElement("td", { style: { padding: 0 } },
                  ...doc.blocks.map(renderBlock),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

  return render(element);
}
