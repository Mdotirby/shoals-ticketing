export type TicketType = {
  id: string;
  event_id: string;
  name: string; // e.g. 'GA', 'VIP', 'Table'
  price: number;
  quantity_available: number;
  quantity_sold: number;
  sort_order: number;
  perks?: string[]; // e.g. ["All sessions & workshops", "Meals & coffee breaks"]
};

/** A ticket tier stored in the ticket_tiers table */
export type TicketTier = {
  id: string;
  event_id: string;
  tier_name: string;
  price: number;
  capacity: number;
  sort_order: number;
  created_at: string;
};

/**
 * Shape used in the tier-builder UI before persistence.
 *
 * `capacity` is the SELLABLE cap and the only field that reaches
 * `ticket_tiers` — it is what app/api/checkout/create-intent enforces a sale
 * against, so it must stay net of anything withheld.
 *
 * `seats`, `comps` and `kills` mirror `artist_offers.ticket_scaling`, where
 * this decomposition already lives:
 *
 *   { name, seats: 750, comps: 30, kills: 0, sellable_cap: 720, price, … }
 *
 * They are UI-side inputs that DERIVE capacity, so an operator enters the room
 * and the allocation instead of doing the subtraction in their head and
 * typing the answer. Optional: a tier created before they existed, or edited
 * without them, still just carries a capacity.
 */
export type TicketTierDraft = {
  id?: string; // present for existing tiers, absent for newly added ones
  tier_name: string;
  price: string; // string for form input
  capacity: string; // string for form input — the SELLABLE cap
  seats?: string; // the room's allocation to this tier
  comps?: string; // artist + marketing + house
  kills?: string; // production kills, sightline kills
};

export type Ticket = {
  id: string;
  order_id: string;
  event_id: string;
  ticket_type_id: string;
  qr_code: string;
  customer_name: string;
  customer_email: string;
  is_scanned: boolean;
  scanned_at?: string;
  created_at: string;
};
