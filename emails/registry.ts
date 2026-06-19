import type { BlockType, Block, PropField } from "./email-document";

export type BlockMeta = {
  type: BlockType;
  label: string;
  description: string;
  icon: string;
  defaultProps: Block["props"];
  fields: PropField[];
};

export const BLOCK_REGISTRY: BlockMeta[] = [
  {
    type: "image",
    label: "Image",
    description: "Standalone image — logo bar, hero photo, banner",
    icon: "🖼",
    defaultProps: {
      src: "",
      alt: "",
      width: 600,
      link_url: "",
      bg_color: "#000000",
      align: "center",
    },
    fields: [
      { key: "src",      label: "Image URL",       type: "url",    placeholder: "https://..." },
      { key: "alt",      label: "Alt text",         type: "text",   placeholder: "Logo" },
      { key: "width",    label: "Width (px)",       type: "number", min: 40, max: 600 },
      { key: "link_url", label: "Link URL (optional)", type: "url", placeholder: "https://..." },
      { key: "bg_color", label: "Background color", type: "color" },
      { key: "align",    label: "Align", type: "select", options: [
        { label: "Center", value: "center" },
        { label: "Left",   value: "left" },
        { label: "Right",  value: "right" },
      ]},
    ],
  },
  {
    type: "heading",
    label: "Heading",
    description: "Large bold title text",
    icon: "H",
    defaultProps: {
      text: "Welcome to VenueCore",
      level: "h1",
      color: "#ffffff",
      align: "center",
      size: 32,
    },
    fields: [
      { key: "text",  label: "Text",      type: "text" },
      { key: "color", label: "Color",     type: "color" },
      { key: "size",  label: "Font size (px)", type: "number", min: 14, max: 64 },
      { key: "level", label: "Tag",       type: "select", options: [
        { label: "H1 (largest)", value: "h1" },
        { label: "H2",           value: "h2" },
        { label: "H3",           value: "h3" },
      ]},
      { key: "align", label: "Align",     type: "select", options: [
        { label: "Center", value: "center" },
        { label: "Left",   value: "left" },
        { label: "Right",  value: "right" },
      ]},
    ],
  },
  {
    type: "hero",
    label: "Hero",
    description: "Event image with gradient, kicker text, title, and meta row",
    icon: "🖼",
    defaultProps: {
      image_url: "",
      kicker: "Just Announced · Early Access",
      title: "{{event_name}}",
      show_meta: true,
      date: "{{event_date_short}}",
      time: "{{event_time}}",
      venue: "{{venue_name}}",
    },
    fields: [
      { key: "image_url",  label: "Image URL",   type: "url",      placeholder: "https://..." },
      { key: "kicker",     label: "Kicker text",  type: "text",     placeholder: "Just Announced · Early Access" },
      { key: "title",      label: "Title",        type: "text",     placeholder: "{{event_name}}" },
      { key: "show_meta",  label: "Show date / time / venue row", type: "checkbox" },
      { key: "date",       label: "Date",         type: "text",     placeholder: "{{event_date_short}}" },
      { key: "time",       label: "Time",         type: "text",     placeholder: "{{event_time}}" },
      { key: "venue",      label: "Venue",        type: "text",     placeholder: "{{venue_name}}" },
    ],
  },
  {
    type: "text",
    label: "Text",
    description: "Body copy paragraph(s). Blank lines create new paragraphs.",
    icon: "¶",
    defaultProps: {
      content: "Hey {{first_name}}, we have something for you.",
    },
    fields: [
      { key: "content", label: "Content", type: "textarea", placeholder: "Body copy… blank lines = new paragraph" },
    ],
  },
  {
    type: "button",
    label: "Button",
    description: "CTA button with configurable label, URL, and colors",
    icon: "⬛",
    defaultProps: {
      label: "Get Tickets →",
      url: "{{event_url}}",
      bg_color: "#d0c290",
      text_color: "#111827",
      align: "center",
    },
    fields: [
      { key: "label",      label: "Label",      type: "text",   placeholder: "Get Tickets →" },
      { key: "url",        label: "URL",        type: "url",    placeholder: "{{event_url}}" },
      { key: "bg_color",   label: "Background", type: "color" },
      { key: "text_color", label: "Text color", type: "color" },
      { key: "align",      label: "Align",      type: "select", options: [
        { label: "Center", value: "center" },
        { label: "Left",   value: "left" },
        { label: "Right",  value: "right" },
      ]},
    ],
  },
  {
    type: "event_card",
    label: "Event Card",
    description: "Boxed summary of event details",
    icon: "🎟",
    defaultProps: {
      title: "{{event_name}}",
      date: "{{event_date}}",
      venue: "{{venue_name}}",
      ticket_count: "",
      total: "",
    },
    fields: [
      { key: "title",        label: "Event name",    type: "text", placeholder: "{{event_name}}" },
      { key: "date",         label: "Date",          type: "text", placeholder: "{{event_date}}" },
      { key: "venue",        label: "Venue",         type: "text", placeholder: "{{venue_name}}" },
      { key: "ticket_count", label: "Ticket count",  type: "text", placeholder: "e.g. 2 (or leave blank)" },
      { key: "total",        label: "Total amount",  type: "text", placeholder: "e.g. $50.00 (or leave blank)" },
    ],
  },
  {
    type: "info_card",
    label: "Info Card",
    description: "Generic key-value card — credentials, summaries, notices",
    icon: "📋",
    defaultProps: {
      heading: "Details",
      accent_color: "#d0c290",
      lines: "Line one\nLine two",
    },
    fields: [
      { key: "heading",      label: "Heading",      type: "text",     placeholder: "Your Login Credentials" },
      { key: "accent_color", label: "Accent color", type: "color" },
      { key: "lines",        label: "Lines (one per line)", type: "textarea", placeholder: "Email: {{email}}\nTemp Password: {{temp_password}}" },
    ],
  },
  {
    type: "countdown",
    label: "Countdown",
    description: "Static on-sale countdown timer (days / hours / minutes)",
    icon: "⏳",
    defaultProps: {
      label: "Tickets on sale in",
      days: "{{days_until_onsale}}",
      hours: "{{hours_until_onsale}}",
      minutes: "{{minutes_until_onsale}}",
      subtext: "Public on-sale opens {{on_sale_date}} at {{on_sale_time}}.",
    },
    fields: [
      { key: "label",   label: "Label",   type: "text", placeholder: "Tickets on sale in" },
      { key: "days",    label: "Days",    type: "text", placeholder: "{{days_until_onsale}}" },
      { key: "hours",   label: "Hours",   type: "text", placeholder: "{{hours_until_onsale}}" },
      { key: "minutes", label: "Minutes", type: "text", placeholder: "{{minutes_until_onsale}}" },
      { key: "subtext", label: "Sub-text", type: "text", placeholder: "Public on-sale opens {{on_sale_date}} at {{on_sale_time}}." },
    ],
  },
  {
    type: "divider",
    label: "Divider",
    description: "Horizontal rule",
    icon: "—",
    defaultProps: {
      color: "rgba(255,255,255,0.09)",
      margin_top: 8,
      margin_bottom: 8,
    },
    fields: [
      { key: "color",         label: "Color",         type: "color" },
      { key: "margin_top",    label: "Space above (px)", type: "number", min: 0, max: 80 },
      { key: "margin_bottom", label: "Space below (px)", type: "number", min: 0, max: 80 },
    ],
  },
  {
    type: "spacer",
    label: "Spacer",
    description: "Empty vertical space",
    icon: "↕",
    defaultProps: { height: 24 },
    fields: [
      { key: "height", label: "Height (px)", type: "number", min: 4, max: 120 },
    ],
  },
  {
    type: "footer",
    label: "Footer",
    description: "Unsubscribe link and venue attribution",
    icon: "📄",
    defaultProps: {
      venue_name: "{{venue_name}}",
      reason: "because you asked to hear about new shows.",
      unsubscribe_url: "{{unsubscribe_url}}",
    },
    fields: [
      { key: "venue_name",      label: "Venue name",      type: "text", placeholder: "{{venue_name}}" },
      { key: "reason",          label: "Reason for email", type: "text", placeholder: "because you asked to hear about new shows." },
      { key: "unsubscribe_url", label: "Unsubscribe URL",  type: "url",  placeholder: "{{unsubscribe_url}}" },
    ],
  },
];

export function getBlockMeta(type: BlockType): BlockMeta | undefined {
  return BLOCK_REGISTRY.find((b) => b.type === type);
}
