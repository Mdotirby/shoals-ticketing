import { SupabaseClient } from "@supabase/supabase-js";

// Stripe charges 2.7% + $0.30 per transaction
export const STRIPE_PERCENT_FEE = 0.027;
export const STRIPE_FLAT_FEE_CENTS = 30;

// ── Types ────────────────────────────────────────────────────────────────────

export interface VenueFees {
  ticketingFee: number;   // dollars per ticket
  facilityFee: number;    // dollars per ticket
  venueRebate: number;    // dollars
  taxRate: number;         // decimal (e.g. 0.095)
  taxMethod: "multiplier" | "divisor"; // multiplier = tax added on top; divisor = baked into face price
  /** True when the ticket price already has ticketing fee + facility fee baked in —
   *  checkout must not add them again on top. Independent of taxMethod. */
  feesIncludedInPrice: boolean;
}

export interface PromoResult {
  promoCodeId: string;
  promoCodeStr: string;
  discountCentsPerTicket: number;
}

export interface FeeBreakdown {
  /** Base ticket price in cents (before discount) */
  ticketPriceCents: number;
  /** Discounted ticket price in cents (after promo) */
  discountedTicketPriceCents: number;
  /** Ticketing fee per ticket in cents */
  ticketingFeeCents: number;
  /** Facility fee per ticket in cents */
  facilityFeeCents: number;
  /** Tax per ticket in cents */
  taxCents: number;
  /** Effective quantity (may differ from requested qty for assigned seating) */
  effectiveQuantity: number;
  /** Subtotal before Stripe fee in cents */
  subtotalBeforeStripeFee: number;
  /** Stripe processing fee in cents */
  stripeFeeCents: number;
  /** Grand total in cents */
  totalCents: number;
  /** Discount per ticket in cents */
  discountCentsPerTicket: number;
  /** True when ticketingFeeCents/facilityFeeCents are already baked into
   *  ticketPriceCents and were NOT added again into totalCents. Callers building
   *  line-item UIs (Stripe line items, order summaries) should label these as
   *  "included" rather than adding them as separate charges. */
  feesIncludedInPrice: boolean;
}

// ── Fee Resolution ───────────────────────────────────────────────────────────

/**
 * Resolve venue-level fees for an event.
 * Priority: event_venues → venues → defaults.
 */
export async function resolveVenueFees(
  admin: SupabaseClient,
  event: { venue_id?: string | null; event_venue_id?: string | null; facility_fee_enabled?: boolean | null; tax_method?: string | null; fees_included_in_price?: boolean | null }
): Promise<VenueFees> {
  let ticketingFee = 3.0;
  let facilityFee = 0;
  let venueRebate = 0;
  let taxRate = 0.095;
  let taxMethod: "multiplier" | "divisor" = "multiplier";
  let feesResolved = false;
  // Deal-specific, event-only setting — no venue-level inheritance.
  const feesIncludedInPrice = event.fees_included_in_price === true;

  // 1. Try event_venues first (per physical venue)
  if (event.event_venue_id) {
    const { data: evData } = await admin
      .from("event_venues")
      .select("ticketing_fee, facility_fee, tax_rate, tax_method")
      .eq("id", event.event_venue_id)
      .single();
    if (evData) {
      if (evData.ticketing_fee != null) { ticketingFee = evData.ticketing_fee; feesResolved = true; }
      if (evData.facility_fee != null && event.facility_fee_enabled !== false) { facilityFee = evData.facility_fee; }
      if (evData.tax_rate != null) { taxRate = evData.tax_rate; feesResolved = true; }
      if (evData.tax_method === "divisor") taxMethod = "divisor";
    }
  }

  // 2. Fall back to venues table if event_venues didn't resolve fees
  if (!feesResolved && event.venue_id) {
    const { data: venueData } = await admin
      .from("venues")
      .select("ticketing_fee, facility_fee, venue_rebate, tax_rate, tax_method")
      .eq("id", event.venue_id)
      .single();

    if (venueData) {
      ticketingFee = venueData.ticketing_fee ?? 3.0;
      facilityFee = venueData.facility_fee ?? 0;
      venueRebate = venueData.venue_rebate ?? 0;
      taxRate = venueData.tax_rate ?? 0.095;
      if (venueData.tax_method === "divisor") taxMethod = "divisor";
    }
  }

  // 3. If facility_fee_enabled is false, force facilityFee = 0
  if (event.facility_fee_enabled === false) {
    facilityFee = 0;
  }

  // 4. Event-level tax_method overrides the venue default — this is the deal-specific setting.
  if (event.tax_method === "divisor" || event.tax_method === "multiplier") {
    taxMethod = event.tax_method;
  }

  return { ticketingFee, facilityFee, venueRebate, taxRate, taxMethod, feesIncludedInPrice };
}

// ── Promo Code Validation ────────────────────────────────────────────────────

/**
 * Validate a promo code for an event and return discount info.
 * Returns null if the promo code is invalid, expired, or exhausted.
 */
export async function validatePromoCode(
  admin: SupabaseClient,
  eventId: string,
  promoCode: string,
  ticketPriceDollars: number
): Promise<PromoResult | null> {
  const { data: promo } = await admin
    .from("promo_codes")
    .select("*")
    .eq("event_id", eventId)
    .eq("code", promoCode.toUpperCase().trim())
    .eq("active", true)
    .single();

  if (!promo) return null;

  // Check expiry
  const notExpired = !promo.expires_at || new Date(promo.expires_at) >= new Date();
  // Check max uses
  const hasUsesLeft = promo.max_uses === null || promo.current_uses < promo.max_uses;

  if (!notExpired || !hasUsesLeft) return null;

  let discountCentsPerTicket = 0;
  if (promo.discount_type === "fixed") {
    discountCentsPerTicket = Math.round(parseFloat(promo.discount_value) * 100);
  } else if (promo.discount_type === "percentage") {
    discountCentsPerTicket = Math.round(ticketPriceDollars * 100 * (parseFloat(promo.discount_value) / 100));
  }

  return {
    promoCodeId: promo.id,
    promoCodeStr: promo.code,
    discountCentsPerTicket,
  };
}

// ── Presale Code Validation ──────────────────────────────────────────────────

/**
 * Check whether a presale code unlocks early checkout for an event.
 * Mirrors the validation logic in /api/events/[id]/presale/validate — must be
 * re-checked server-side here since the client's "unlocked" state can't be trusted.
 */
export async function validatePresaleCode(
  admin: SupabaseClient,
  eventId: string,
  presaleCode: string
): Promise<boolean> {
  const code = presaleCode.trim().toUpperCase();
  if (!code) return false;

  const { data } = await admin
    .from("event_presales")
    .select("code, enabled, starts_at, ends_at")
    .eq("event_id", eventId)
    .eq("enabled", true);

  if (!data) return false;

  const now = new Date();
  return data.some((row) => {
    if (!row.code || row.code.toUpperCase() !== code) return false;
    if (row.starts_at && new Date(row.starts_at) > now) return false;
    if (row.ends_at && new Date(row.ends_at) < now) return false;
    return true;
  });
}

/**
 * Increment the `current_uses` counter on a promo code after successful validation.
 */
export async function incrementPromoCodeUses(
  admin: SupabaseClient,
  promoCodeId: string
): Promise<void> {
  // Try RPC first, fall back to manual increment
  const { error: rpcErr } = await admin.rpc("increment_promo_uses", { p_id: promoCodeId });
  if (rpcErr) {
    // Fallback: read-then-write if RPC doesn't exist
    const { data } = await admin
      .from("promo_codes")
      .select("current_uses")
      .eq("id", promoCodeId)
      .single();
    if (data) {
      await admin
        .from("promo_codes")
        .update({ current_uses: (data.current_uses || 0) + 1 })
        .eq("id", promoCodeId);
    }
  }
}

// ── Seating requirement ──────────────────────────────────────────────────────

/**
 * True when the event has an enabled seating layout — i.e. a seat MUST be
 * selected to buy. Used as an authoritative server-side guard so a checkout
 * can never create a seatless order for a reserved event (the failure mode
 * that stranded 14 orders when the seat map didn't load client-side).
 */
export async function eventRequiresSeating(
  admin: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .maybeSingle();
  return !!data?.layout_id;
}

export interface EventSeatInventory {
  capacity: number;
  sold: number;
  available: number;
}

/**
 * Ids of objects flagged `metadata.hidden` — real, sellable inventory that is
 * deliberately kept off the customer-facing chart AND out of capacity
 * reporting (e.g. a table added on the night that isn't part of the printed
 * floor plan). Seats belonging to these objects still function normally on the
 * ticket and at the door; they simply don't move the venue's published totals.
 */
async function getHiddenObjectIds(
  admin: SupabaseClient,
  sectionIds: string[]
): Promise<Set<string>> {
  if (sectionIds.length === 0) return new Set();
  const { data } = await admin
    .from("objects")
    .select("id, metadata")
    .in("section_id", sectionIds);
  const hidden = new Set<string>();
  for (const o of data || []) {
    if ((o.metadata as { hidden?: boolean } | null)?.hidden) hidden.add(o.id);
  }
  return hidden;
}

/**
 * Real sold/available/capacity for a reserved-seating event, counted directly
 * from the seats table — not from ticket_tiers.capacity (a static number an
 * admin typed once, e.g. "10 tables" instead of the 80 real seats those
 * tables contain) or from orders.quantity/tickets.ticket_type_id (which
 * drift once an order spans multiple sections, or a refunded order keeps its
 * seats intentionally reserved). Returns null for events with no enabled
 * seating layout — callers should fall back to tier-based capacity for
 * those (there's no seat-level ground truth to check instead).
 */
export async function getEventSeatInventory(
  admin: SupabaseClient,
  eventId: string
): Promise<EventSeatInventory | null> {
  const { data: map } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .maybeSingle();
  if (!map?.layout_id) return null;

  const { data: sections } = await admin
    .from("sections")
    .select("id")
    .eq("layout_id", map.layout_id);
  const sectionIds = (sections || []).map((s: { id: string }) => s.id);
  if (sectionIds.length === 0) return { capacity: 0, sold: 0, available: 0 };

  const hidden = await getHiddenObjectIds(admin, sectionIds);
  const { data: seatRows } = await admin
    .from("seats")
    .select("status, object_id")
    .in("section_id", sectionIds);

  const seats = (seatRows || []).filter(
    (s: { object_id: string | null }) => !(s.object_id && hidden.has(s.object_id))
  );
  const capacity = seats.length;
  const sold = seats.filter((s: { status: string }) => s.status === "sold").length;
  return { capacity, sold, available: Math.max(0, capacity - sold) };
}

export interface SectionSeatInventory extends EventSeatInventory {
  sectionId: string;
  name: string;
  priceCents: number;
  sellsAsTable: boolean;
}

/**
 * Same seat-level truth as getEventSeatInventory, but broken out per section —
 * so a caller can answer "is THIS tier sold out" instead of only "is the event
 * sold out". Sections with no seats (e.g. the STAGE marker) are omitted.
 * Returns null when the event has no enabled seating layout.
 */
export async function getEventSeatInventoryBySection(
  admin: SupabaseClient,
  eventId: string
): Promise<SectionSeatInventory[] | null> {
  const { data: map } = await admin
    .from("event_layout_maps")
    .select("layout_id")
    .eq("event_id", eventId)
    .eq("enabled", true)
    .maybeSingle();
  if (!map?.layout_id) return null;

  const { data: sections } = await admin
    .from("sections")
    .select("id, name, price_cents, sells_as_table, type")
    .eq("layout_id", map.layout_id);
  const sectionRows = sections || [];
  if (sectionRows.length === 0) return [];

  const sectionIds = sectionRows.map((s: { id: string }) => s.id);
  const hidden = await getHiddenObjectIds(admin, sectionIds);
  const { data: seatRows } = await admin
    .from("seats")
    .select("section_id, status, object_id")
    .in("section_id", sectionIds);
  const seats = (seatRows || []).filter(
    (s: { object_id: string | null }) => !(s.object_id && hidden.has(s.object_id))
  );

  const out: SectionSeatInventory[] = [];
  for (const sec of sectionRows) {
    const secSeats = seats.filter(
      (s: { section_id: string }) => s.section_id === sec.id
    );
    if (secSeats.length === 0) continue;
    const capacity = secSeats.length;
    const sold = secSeats.filter((s: { status: string }) => s.status === "sold").length;
    out.push({
      sectionId: sec.id,
      name: sec.name,
      priceCents: sec.price_cents ?? 0,
      sellsAsTable: !!sec.sells_as_table || sec.type === "table",
      capacity,
      sold,
      available: Math.max(0, capacity - sold),
    });
  }
  return out;
}

// ── Seat Validation ──────────────────────────────────────────────────────────

export interface SeatValidationResult {
  reservedSeatIds: string[];
  seatLabels: string[];
  seatSectionNames: string[];
  /** Total price in cents — one billing unit per table (sells_as_table) or per seat */
  seatTotalCents: number;
  /** Number of billing units — 1 per table object or 1 per individual seat */
  billingUnitCount: number;
}

/**
 * Validate that seats are available and temporarily hold them.
 * Returns seat details for pricing and labelling.
 */
export async function validateAndHoldSeats(
  admin: SupabaseClient,
  seatIds: string[],
  eventPrice: number,
  sessionId?: string
): Promise<{ error?: string; unavailable?: string[]; result?: SeatValidationResult }> {
  // Release stale holds from this same session's earlier / abandoned attempts
  // — but only ones NOT part of the current request. Without this, a buyer
  // who re-picked seats in the same browser session leaves multiple sets of
  // seats held under one session, and the webhook's session-based
  // finalization sweeps them ALL in — the pay-for-2-get-4 over-allocation bug.
  // Scoping the release to seats outside the current seatIds (rather than
  // wiping everything under the session unconditionally) means a retry or
  // duplicate submission for the SAME seats — e.g. a Payment Element remount,
  // a double-tapped Pay button, a resumed checkout tab — can never release
  // seats that a still-in-flight Stripe charge for those same seats depends
  // on right before its webhook finalizes them (the cause of orders shipping
  // with zero seats assigned).
  if (sessionId) {
    const { data: sessionHeld } = await admin
      .from("seats")
      .select("id")
      .eq("held_session", sessionId)
      .eq("status", "held");
    const requested = new Set(seatIds);
    const staleIds = (sessionHeld || [])
      .map((s: { id: string }) => s.id)
      .filter((id: string) => !requested.has(id));
    if (staleIds.length > 0) {
      await admin
        .from("seats")
        .update({ status: "available", held_until: null, held_session: null })
        .in("id", staleIds);
    }
  }

  // Verify seats are still available (or already held by this same session —
  // a retry/refresh re-confirming its own in-progress hold).
  const { data: seatCheck } = await admin
    .from("seats")
    .select("id, status, held_session")
    .in("id", seatIds);

  const unavailable = (seatCheck || []).filter(
    (s: { status: string; held_session: string | null }) =>
      s.status !== "available" && !(s.status === "held" && s.held_session === sessionId)
  );
  if (unavailable.length > 0) {
    return {
      error: "Some seats are no longer available. Please re-select.",
      unavailable: unavailable.map((s: { id: string }) => s.id),
    };
  }

  // Temporarily hold seats (4 min) so no one else grabs them during checkout.
  //
  // This MUST be an atomic conditional update, not a blind write. The
  // availability check above is a read, so two buyers hitting the last seat at
  // the same moment can both pass it; a blind update would then let the second
  // silently overwrite the first's hold. Both would go on to pay, and at
  // webhook time only one of them matches `held_session` — the other is issued
  // tickets with no seat at all. That is exactly how seatless paid orders have
  // been produced before.
  //
  // Updating only rows still `available` and comparing the affected-row count
  // to what we asked for makes the database the arbiter: the loser of the race
  // gets a clean 409 and can re-pick, instead of paying for nothing.
  const heldUntil = new Date(Date.now() + 4 * 60 * 1000).toISOString();

  const alreadyMineIds = (seatCheck || [])
    .filter((s: { status: string; held_session: string | null }) =>
      s.status === "held" && s.held_session === sessionId)
    .map((s: { id: string }) => s.id);
  const needToGrabIds = seatIds.filter((id) => !alreadyMineIds.includes(id));

  if (needToGrabIds.length > 0) {
    const { data: grabbed } = await admin
      .from("seats")
      .update({ status: "held", held_until: heldUntil, held_session: sessionId || null })
      .in("id", needToGrabIds)
      .eq("status", "available")
      .select("id");

    const grabbedIds = (grabbed || []).map((s: { id: string }) => s.id);
    if (grabbedIds.length < needToGrabIds.length) {
      // Lost the race on at least one seat — release whatever we did grab so we
      // don't strand seats that nobody is buying, then reject the whole request.
      if (grabbedIds.length > 0 && sessionId) {
        await admin
          .from("seats")
          .update({ status: "available", held_until: null, held_session: null })
          .in("id", grabbedIds)
          .eq("held_session", sessionId);
      }
      return {
        error: "Some seats are no longer available. Please re-select.",
        unavailable: needToGrabIds.filter((id) => !grabbedIds.includes(id)),
      };
    }
  }

  // Seats this session already holds: just extend the window.
  if (alreadyMineIds.length > 0 && sessionId) {
    await admin
      .from("seats")
      .update({ held_until: heldUntil })
      .in("id", alreadyMineIds)
      .eq("held_session", sessionId);
  }

  // Look up seat details + section prices (including sells_as_table and object_id)
  const { data: seatDetails } = await admin
    .from("seats")
    .select("id, row_label, seat_number, section_id, object_id")
    .in("id", seatIds);

  const sectionIds = [...new Set((seatDetails || []).map((s: { section_id: string }) => s.section_id))];
  const { data: sectionDetails } = sectionIds.length
    ? await admin.from("sections").select("id, name, price_cents, sells_as_table, type").in("id", sectionIds)
    : { data: [] };

  const sectionMap = new Map<string, { name: string; price_cents: number; sells_as_table: boolean }>();
  for (const sec of sectionDetails || []) {
    const isTable = !!sec.sells_as_table || sec.type === "table";
    sectionMap.set(sec.id, { name: sec.name, price_cents: sec.price_cents, sells_as_table: isTable });
  }

  const seatLabels: string[] = [];
  const seatSectionNames: string[] = [];
  let seatTotalCents = 0;
  let billingUnitCount = 0;
  const seenTableObjects = new Set<string>();

  for (const seat of seatDetails || []) {
    const sec = sectionMap.get(seat.section_id);
    const priceCents = sec?.price_cents || Math.round(eventPrice * 100);
    const label = `${sec?.name || "Section"} | ${seat.row_label} | Seat ${seat.seat_number}`;
    seatLabels.push(label);
    seatSectionNames.push(sec?.name || "Section");

    if (sec?.sells_as_table && seat.object_id) {
      // Price the whole table once — not each seat individually
      if (!seenTableObjects.has(seat.object_id)) {
        seenTableObjects.add(seat.object_id);
        seatTotalCents += priceCents;
        billingUnitCount++;
      }
    } else {
      seatTotalCents += priceCents;
      billingUnitCount++;
    }
  }

  return {
    result: { reservedSeatIds: seatIds, seatLabels, seatSectionNames, seatTotalCents, billingUnitCount },
  };
}

// ── Fee Calculation ──────────────────────────────────────────────────────────

/**
 * Compute the full fee breakdown for a checkout.
 *
 * This is the SINGLE SOURCE OF TRUTH for fee math used by both
 * the Checkout Session route and the PaymentIntent route.
 */
export function calculateFees(opts: {
  ticketPriceCents: number;
  discountCentsPerTicket: number;
  ticketingFee: number;
  facilityFee: number;
  taxRate: number;
  quantity: number;
  /** True when ticketPriceCents already has ticketingFee + facilityFee baked
   *  in — don't add them again on top of the charge. */
  feesIncludedInPrice?: boolean;
}): FeeBreakdown {
  const { ticketPriceCents, discountCentsPerTicket, ticketingFee, facilityFee, taxRate, quantity, feesIncludedInPrice = false } = opts;

  const discountedTicketPriceCents = Math.max(0, ticketPriceCents - discountCentsPerTicket);
  // Nominal per-ticket amounts — always returned for display/reporting, even
  // when baked into the price and not separately charged.
  const ticketingFeeCents = Math.round(ticketingFee * 100);
  const facilityFeeCents = Math.round(facilityFee * 100);

  // Tax on discounted ticket price
  const taxCents = Math.round(discountedTicketPriceCents * taxRate);

  // Subtotal before Stripe fee — skip re-adding fees already baked into the price.
  const subtotalBeforeStripeFee = feesIncludedInPrice
    ? (discountedTicketPriceCents + taxCents) * quantity
    : (discountedTicketPriceCents + ticketingFeeCents + facilityFeeCents + taxCents) * quantity;

  // Stripe processing fee — informational even when absorbed (see below).
  const stripeFeeCents = Math.round(
    subtotalBeforeStripeFee * STRIPE_PERCENT_FEE + STRIPE_FLAT_FEE_CENTS
  );

  // When fees are baked into the price, the venue absorbs the card
  // processing fee too — the customer is charged exactly the sticker
  // price (+ tax, if additive), full stop, never subtotal + surcharge.
  const totalCents = feesIncludedInPrice
    ? subtotalBeforeStripeFee
    : subtotalBeforeStripeFee + stripeFeeCents;

  return {
    ticketPriceCents,
    discountedTicketPriceCents,
    ticketingFeeCents,
    facilityFeeCents,
    taxCents,
    effectiveQuantity: quantity,
    subtotalBeforeStripeFee,
    stripeFeeCents,
    totalCents,
    discountCentsPerTicket,
    feesIncludedInPrice,
  };
}
