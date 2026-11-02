import type { SupabaseClient } from "@supabase/supabase-js";
import { agentRecipients } from "@/lib/email/recipients";

/**
 * A show's contacts, from the event's Contacts tab. The agent and assistant
 * are read off the offer rather than copied, so the list can't go stale when
 * the offer changes. Someone added by hand with the same address wins.
 */

export const CONTACT_ROLES = [
  { value: "assistant", label: "Agent's assistant" },
  { value: "agent", label: "Agent" },
  { value: "tour_manager", label: "Tour manager" },
  { value: "artist_manager", label: "Artist manager" },
  { value: "production", label: "Production" },
  { value: "hospitality", label: "Hospitality" },
  { value: "other", label: "Other" },
] as const;

export type ContactRole = (typeof CONTACT_ROLES)[number]["value"];

export type ShowContact = {
  id: string;
  name: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  /** "offer" rows are read off the offer and edited there. */
  source: "contact" | "offer";
};

export type OfferContactFields = {
  agent_name?: string | null;
  agent_email?: string | null;
  agent_phone?: string | null;
  agent_assistant_email?: string | null;
};

export const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;

export function contactRoleLabel(role: string): string {
  return CONTACT_ROLES.find((r) => r.value === role)?.label ?? "Other";
}

const key = (email: string | null | undefined) => String(email || "").trim().toLowerCase();

export function mergeOfferContacts(stored: ShowContact[], offer: OfferContactFields | null | undefined): ShowContact[] {
  const fromOffer: ShowContact[] = [];
  const has = (email: string | null | undefined) => stored.some((c) => key(c.email) === key(email));
  if (offer?.agent_assistant_email?.trim() && !has(offer.agent_assistant_email)) {
    fromOffer.push({ id: "offer:assistant", name: null, role: "assistant", email: offer.agent_assistant_email.trim(), phone: null, source: "offer" });
  }
  if (offer?.agent_email?.trim() && !has(offer.agent_email) && key(offer.agent_email) !== key(offer.agent_assistant_email)) {
    fromOffer.push({ id: "offer:agent", name: offer.agent_name || null, role: "agent", email: offer.agent_email.trim(), phone: offer.agent_phone || null, source: "offer" });
  }
  return [...fromOffer, ...stored];
}

/** To is the assistant, or the agent if there's no assistant. The agent is copied. */
export function defaultRecipients(contacts: ShowContact[]): { to: string; cc: string[] } {
  const first = (role: string) => contacts.find((c) => c.role === role && c.email)?.email ?? "";
  const { to, cc } = agentRecipients(first("agent"), first("assistant"));
  return { to, cc: cc ? [cc] : [] };
}

/** The offer behind a show: the one its settlement settles, else the live one linked to it. */
async function offerForEvent(admin: SupabaseClient, eventId: string): Promise<OfferContactFields | null> {
  const FIELDS = "agent_name, agent_email, agent_phone, agent_assistant_email";
  const { data: settlement } = await admin
    .from("settlements")
    .select("offer_id")
    .eq("event_id", eventId)
    .not("offer_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (settlement?.offer_id) {
    const { data } = await admin.from("artist_offers").select(FIELDS).eq("id", settlement.offer_id).maybeSingle();
    if (data) return data as OfferContactFields;
  }
  const { data } = await admin
    .from("artist_offers")
    .select(FIELDS)
    .eq("event_id", eventId)
    .is("superseded_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OfferContactFields) ?? null;
}

/** `migrated` is false until plans/show-contacts-migration.sql has run. */
export async function loadShowContacts(
  admin: SupabaseClient,
  eventId: string,
): Promise<{ migrated: boolean; contacts: ShowContact[] }> {
  const { data, error } = await admin
    .from("show_contacts")
    .select("id, name, role, email, phone")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  const stored = ((data ?? []) as Omit<ShowContact, "source">[]).map((c) => ({ ...c, source: "contact" as const }));
  return { migrated: !error, contacts: mergeOfferContacts(stored, await offerForEvent(admin, eventId)) };
}

/** Save anyone typed into the send box who isn't on the show's list yet. */
export async function saveNewContacts(
  admin: SupabaseClient,
  eventId: string,
  emails: string[],
  senderEmail: string | null | undefined,
): Promise<void> {
  const { migrated, contacts } = await loadShowContacts(admin, eventId);
  if (!migrated) return;
  const known = new Set([...contacts.map((c) => key(c.email)), key(senderEmail)]);
  const fresh = [...new Set(emails.map(key))].filter((e) => e && !known.has(e));
  if (fresh.length > 0) {
    await admin.from("show_contacts").insert(fresh.map((email) => ({ event_id: eventId, email, role: "other" })));
  }
}
