/**
 * EmailDocument — the JSON schema stored in ee_campaign_messages.body_json.
 *
 * A document is an ordered array of typed blocks. Each block has a stable
 * UUID, a type, and a props bag specific to that type.
 *
 * All string props may contain {{variable}} placeholders — the existing
 * email-engine renderer substitutes them at dispatch time.
 */

// ── Block prop shapes ──────────────────────────────────────────────

export type HeroBlockProps = {
  image_url: string;
  kicker: string;
  title: string;
  show_meta: boolean;
  date: string;
  time: string;
  venue: string;
};

export type TextBlockProps = {
  content: string;
};

export type ButtonBlockProps = {
  label: string;
  url: string;
  bg_color: string;
  text_color: string;
  align: "left" | "center" | "right";
};

export type EventCardBlockProps = {
  title: string;
  date: string;
  venue: string;
  ticket_count: string;
  total: string;
};

export type CountdownBlockProps = {
  label: string;
  days: string;
  hours: string;
  minutes: string;
  subtext: string;
};

export type DividerBlockProps = {
  color: string;
  margin_top: number;
  margin_bottom: number;
};

export type SpacerBlockProps = {
  height: number;
};

export type FooterBlockProps = {
  venue_name: string;
  reason: string;
  unsubscribe_url: string;
};

export type InfoCardBlockProps = {
  heading: string;
  accent_color: string;
  lines: string;
};

export type ImageBlockProps = {
  src: string;
  alt: string;
  width: number;
  link_url: string;
  bg_color: string;
  align: "left" | "center" | "right";
};

export type HeadingBlockProps = {
  text: string;
  level: "h1" | "h2" | "h3";
  color: string;
  align: "left" | "center" | "right";
  size: number;
};

// ── Union discriminant ─────────────────────────────────────────────

export type Block =
  | { id: string; type: "hero";       props: HeroBlockProps }
  | { id: string; type: "image";      props: ImageBlockProps }
  | { id: string; type: "heading";    props: HeadingBlockProps }
  | { id: string; type: "text";       props: TextBlockProps }
  | { id: string; type: "button";     props: ButtonBlockProps }
  | { id: string; type: "event_card"; props: EventCardBlockProps }
  | { id: string; type: "info_card";  props: InfoCardBlockProps }
  | { id: string; type: "countdown";  props: CountdownBlockProps }
  | { id: string; type: "divider";    props: DividerBlockProps }
  | { id: string; type: "spacer";     props: SpacerBlockProps }
  | { id: string; type: "footer";     props: FooterBlockProps };

export type BlockType = Block["type"];

export type EmailDocument = {
  version: "block-v1";
  bg_color: string;
  blocks: Block[];
  /** Inbox preview/preheader snippet. May contain {{variable}} placeholders, substituted the same way block props are. Optional — omitting it renders no <Preview>. */
  preview_text?: string;
};

// ── Prop field schema (drives PropEditor UI) ───────────────────────

export type PropFieldType =
  | "text"
  | "textarea"
  | "url"
  | "color"
  | "number"
  | "checkbox"
  | "select";

export type PropField = {
  key: string;
  label: string;
  type: PropFieldType;
  placeholder?: string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
};
