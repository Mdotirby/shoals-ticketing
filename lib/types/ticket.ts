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

/** Shape used in the tier-builder UI before persistence */
export type TicketTierDraft = {
  id?: string; // present for existing tiers, absent for newly added ones
  tier_name: string;
  price: string; // string for form input
  capacity: string; // string for form input
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
