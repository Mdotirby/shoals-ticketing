/**
 * What a single tier actually charges — the resolved answer, per fee.
 *
 * Before this, "which fees apply" was decided by four interacting event-level
 * booleans (facility_fee_enabled, fees_included_in_price, is_free, tax_method)
 * read at checkout. Two problems with that:
 *
 *  1. It is event-wide, so one tier cannot differ from another. A free show
 *     with one paid wristband tier is unrepresentable.
 *  2. It cannot say "waived". fees_included_in_price means the fee is still
 *     EARNED and merely comes out of the face. Nothing could say "do not
 *     charge this and do not book it" for the service fee.
 *
 * So each fee resolves to one of three modes, and the tier may override what
 * the event says:
 *
 *   added     charged on top of the face   → buyer pays face + fee
 *   included  comes out of the face        → buyer pays face, venue earns fee
 *   waived    not charged, not earned      → buyer pays face, venue earns 0
 *
 * The difference between `included` and `waived` is invisible in what the
 * buyer pays and entirely visible in what the show earns, which is exactly why
 * it needs a name rather than a boolean.
 *
 * NOT modelled here, deliberately: card processing (a real cost paid to
 * Stripe) and sales tax (statutory). Neither is ours to waive, so neither has
 * a mode. Callers add both on top of whatever this returns.
 */

export type FeeMode = "added" | "included" | "waived";

/** What the venue/event would charge before any tier override. */
export type InheritedFees = {
  /** Per-ticket service (ticketing) fee in dollars. */
  ticketingFee: number;
  /** Per-ticket facility fee in dollars. */
  facilityFee: number;
  /** events.fees_included_in_price — the old event-wide "baked in" flag. */
  feesIncludedInPrice?: boolean | null;
  /** events.facility_fee_enabled — false has always meant a true waive. */
  facilityFeeEnabled?: boolean | null;
};

/** The tier's own overrides. Null/undefined means inherit. */
export type TierFeeOverrides = {
  service_fee_mode?: FeeMode | null;
  facility_fee_mode?: FeeMode | null;
};

export type ResolvedFee = {
  mode: FeeMode;
  /** Dollars added to what the buyer pays. Zero unless mode is "added". */
  charged: number;
  /** Dollars the venue books as fee revenue. Zero when waived. */
  earned: number;
};

export type ResolvedTierFees = {
  service: ResolvedFee;
  facility: ResolvedFee;
  /** Total added on top of the face, in dollars. */
  addedToFace: number;
  /** True when either fee is waived — worth surfacing in admin and on a receipt. */
  anyWaived: boolean;
};

/**
 * What the event says, when the tier says nothing.
 *
 * The old booleans map onto modes without changing any existing behaviour:
 * facility_fee_enabled === false has always meant a genuine waive, and
 * fees_included_in_price === true has always meant "included".
 */
export function inheritedMode(fee: "service" | "facility", inherited: InheritedFees): FeeMode {
  if (fee === "facility" && inherited.facilityFeeEnabled === false) return "waived";
  if (inherited.feesIncludedInPrice === true) return "included";
  return "added";
}

/** One fee, resolved. A zero-rate fee is reported as waived — there is nothing to charge. */
function resolveOne(amount: number, mode: FeeMode): ResolvedFee {
  const value = Number(amount) || 0;
  if (value <= 0) return { mode: "waived", charged: 0, earned: 0 };
  if (mode === "waived") return { mode: "waived", charged: 0, earned: 0 };
  if (mode === "included") return { mode: "included", charged: 0, earned: value };
  return { mode: "added", charged: value, earned: value };
}

/**
 * Resolve both fees for one tier.
 *
 * `tier` may be null for callers that have no tier in hand (a legacy order, a
 * whole-event projection) — they get the inherited answer.
 */
export function resolveTierFees(
  inherited: InheritedFees,
  tier?: TierFeeOverrides | null,
): ResolvedTierFees {
  const serviceMode = tier?.service_fee_mode ?? inheritedMode("service", inherited);
  const facilityMode = tier?.facility_fee_mode ?? inheritedMode("facility", inherited);

  const service = resolveOne(inherited.ticketingFee, serviceMode);
  const facility = resolveOne(inherited.facilityFee, facilityMode);

  return {
    service,
    facility,
    addedToFace: Math.round((service.charged + facility.charged) * 100) / 100,
    anyWaived:
      (serviceMode === "waived" && Number(inherited.ticketingFee) > 0) ||
      (facilityMode === "waived" && Number(inherited.facilityFee) > 0),
  };
}

/** Admin-facing wording. The UI should never show the bare mode name. */
export function describeMode(mode: FeeMode, amount: number, face: number): string {
  const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
  if (mode === "waived") return "Waived — not charged, not earned";
  if (mode === "included") return `Included — comes out of the ${usd(face)}`;
  return `Added on top — buyer pays ${usd(amount)}`;
}

/** Normalised form for storing and comparing an unlock code. */
export function normalizeUnlockCode(code: string | null | undefined): string {
  return (code ?? "").trim().toUpperCase();
}

/** Does `entered` unlock a tier carrying `unlock_code`? Case- and space-insensitive. */
export function unlocksTier(tierCode: string | null | undefined, entered: string | null | undefined): boolean {
  const required = normalizeUnlockCode(tierCode);
  if (!required) return true; // no code on the tier — open to everyone
  return normalizeUnlockCode(entered) === required;
}
