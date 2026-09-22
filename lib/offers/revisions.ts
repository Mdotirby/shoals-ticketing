/**
 * Offer revisions — PHASE1-EDIT-PAGES § 2.
 *
 * A countersigned (status "accepted") offer is never edited in place. The
 * only way to change it is a revision: a new draft row with `revision_of`
 * pointing at the offer it revises. The signed version stays operative until
 * the revision is countersigned, then it's marked `superseded_at`.
 *
 * A revision does not touch the event, its tickets or its orders. The offer
 * is the deal with the artist; the event is the night that's sold.
 */

/** Fields that never count as "the deal" — they can change on a signed offer. */
const NON_TERM_FIELDS = new Set(["status", "notes", "updated_at", "created_at", "created_by"]);

/** Loose equality for form values: 5000 == "5000", null == "" == undefined. */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => {
    if (v === undefined || v === null || v === "") return "";
    if (typeof v === "object") return JSON.stringify(v);
    if (typeof v === "boolean") return String(v);
    const s = String(v).trim();
    const n = Number(s);
    return Number.isNaN(n) ? s : String(n);
  };
  return norm(a) === norm(b);
}

/**
 * Which deal terms would `updates` change on `current`? On a countersigned
 * offer any answer but [] is refused — the builder sends its whole payload
 * on every save, so compare values, not keys.
 */
export function changedTerms(current: Record<string, unknown>, updates: Record<string, unknown>): string[] {
  return Object.keys(updates).filter((k) => !NON_TERM_FIELDS.has(k) && !same(current[k], updates[k]));
}

/**
 * Which terms actually block a write to a countersigned offer.
 *
 * Same as changedTerms, minus one exception: linking the offer to the show it
 * produced. Accepting an offer is what creates that show, so event_id can only
 * ever be filled in after acceptance — refusing it would leave every
 * offer-created show permanently unlinked, and both the event workspace and
 * the edit rail's break-even look the offer up by event_id.
 *
 * The exception is deliberately one-way: it applies only while event_id is
 * still empty. Re-pointing a signed offer at a DIFFERENT show changes what the
 * settlement settles, so that is a term change and still needs a revision.
 */
export function blockingTerms(current: Record<string, unknown>, updates: Record<string, unknown>): string[] {
  const firstLink = (k: string) => k === "event_id" && !current.event_id && !!updates.event_id;
  return changedTerms(current, updates).filter((k) => !firstLink(k));
}

export type OfferVersion = {
  id: string;
  version: number;
  status: string;
  revision_of: string | null;
  superseded_at: string | null;
  created_at: string;
  updated_at: string | null;
  guarantee: number | null;
  backend_percentage: number | null;
  deal_type: string | null;
};

/**
 * The operative version: the newest countersigned one that hasn't been
 * superseded. A draft revision never is, however new.
 */
export function operativeVersion(chain: OfferVersion[]): OfferVersion | null {
  return (
    chain
      .filter((v) => v.status === "accepted" && !v.superseded_at)
      .sort((a, b) => b.version - a.version)[0] ?? null
  );
}

/** An open (unsent or unsigned) revision already in the chain, if any. */
export function openRevision(chain: OfferVersion[]): OfferVersion | null {
  return chain.find((v) => v.revision_of && v.status !== "accepted" && v.status !== "declined") ?? null;
}

/** Does this database error mean the revision columns don't exist yet? */
export function revisionsMissing(message: string | undefined): boolean {
  return !!message && /revision_of|superseded_at|column .*version|version.* does not exist/i.test(message);
}
