// Extensible on purpose: adding a future trigger (e.g. ticket delivery,
// portal welcome) is a one-line addition here plus a new template file —
// no migration, no schema change. See standalone-emails/README notes in
// project memory for why trigger_type is plain TEXT, not a DB enum.

export const TRIGGERS = {
  NEW_EVENT_ANNOUNCEMENT: "new_event_announcement",
  SPONSOR_HIGHLIGHT: "sponsor_highlight", // reserved — dedicated design, not built yet
  KNOW_BEFORE_YOU_GO: "know_before_you_go", // reserved — lineup-forward design, not built yet
  TICKET_DELIVERY: "ticket_delivery", // reserved — not wired yet
  PORTAL_WELCOME: "portal_welcome", // reserved — not wired yet
} as const;

export type TriggerType = (typeof TRIGGERS)[keyof typeof TRIGGERS];

/**
 * Whether a trigger fans out to a chosen list (Resend Broadcast) or fires
 * once per individual (Resend transactional send with template variables).
 * Announcements/sponsor highlights/KBYG are list sends; ticket delivery /
 * portal welcome are inherently 1:1 per order / per signup.
 */
export const TRIGGER_SEND_MODE: Record<TriggerType, "broadcast" | "transactional"> = {
  [TRIGGERS.NEW_EVENT_ANNOUNCEMENT]: "broadcast",
  [TRIGGERS.SPONSOR_HIGHLIGHT]: "broadcast",
  [TRIGGERS.KNOW_BEFORE_YOU_GO]: "broadcast",
  [TRIGGERS.TICKET_DELIVERY]: "transactional",
  [TRIGGERS.PORTAL_WELCOME]: "transactional",
};

/** Resend template `alias` used to look the template up — one per trigger. */
export const TRIGGER_TEMPLATE_ALIAS: Record<TriggerType, string> = {
  [TRIGGERS.NEW_EVENT_ANNOUNCEMENT]: "new-event-announcement",
  [TRIGGERS.SPONSOR_HIGHLIGHT]: "sponsor-highlight",
  [TRIGGERS.KNOW_BEFORE_YOU_GO]: "know-before-you-go",
  [TRIGGERS.TICKET_DELIVERY]: "ticket-delivery",
  [TRIGGERS.PORTAL_WELCOME]: "portal-welcome",
};
