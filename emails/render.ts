import { render } from "@react-email/components";
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
import { Html, Head, Body, Container } from "@react-email/components";

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
  const bg = doc.bg_color || "#111827";

  const element = createElement(
    Html,
    { lang: "en" },
    createElement(Head),
    createElement(
      Body,
      { style: { margin: 0, padding: 0, backgroundColor: bg, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif", WebkitFontSmoothing: "antialiased" } },
      createElement(
        Container,
        { style: { maxWidth: 600, margin: "24px auto", backgroundColor: bg, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(255,255,255,0.09)" } },
        ...doc.blocks.map(renderBlock),
      ),
    ),
  );

  return render(element);
}
