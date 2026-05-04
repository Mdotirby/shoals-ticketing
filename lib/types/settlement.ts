export type SettlementStatus = "draft" | "finalized";

/**
 * Tax method:
 *   • multiplier — face price is pre-tax; tax = price × rate (added on top)
 *   • divisor    — face price is tax-inclusive; pre-tax = price / (1 + rate)
 */
export type TaxMethod = "multiplier" | "divisor";

export type TicketAuditRow = {
  tier: string;
  capacity: number;
  sold: number;          // paying tickets only (status='paid', source != 'comp')
  comps: number;         // comp tickets (NOT included in gross)
  kills: number;
  price: number;         // face price per ticket
  ticketing_fee: number; // ticketing service fee per ticket (from venue config)
  facility_fee: number;  // facility fee per ticket on this tier
  /** Sum of subtotal (face value) collected from paying tickets in this tier. */
  gross: number;
};

export type OtherAncillaryItem = {
  name: string;
  amount: number;
};

/** A row in the merch settlement: one SKU / item line. */
export type MerchItem = {
  name: string;
  units_sold: number;
  unit_price: number;
  gross: number; // units_sold × unit_price (or manually overridden)
};

/** Who eats the merch seller's per-night fee. */
export type MerchSellerFeePayer = "venue" | "artist";

/**
 * Who remits merch sales tax to the government:
 *   • artist — artist keeps the tax money (default; their tax to file)
 *   • venue  — venue pays the tax. Amount is deducted from the artist's merch
 *              balance due (artist effectively reimburses the venue).
 */
export type MerchTaxPayer = "artist" | "venue";

export type Settlement = {
  id: string;
  event_id?: string | null;
  offer_id?: string;
  contract_id?: string;
  venue_id: string;

  // 'venuecore' = audit-based from real orders (default)
  // 'external'  = all figures entered manually; no order data
  source?: "venuecore" | "external";

  // Manual entry fields — only used when source = 'external'
  manual_gross?: number | null;
  manual_tickets_sold?: number | null;
  manual_ticket_price?: number | null;
  manual_ticketing_fee?: number | null;
  manual_facility_fee?: number | null;
  manual_tax_rate?: number | null;
  manual_tax_method?: TaxMethod | null;
  manual_processing_fee?: number | null;

  // Event snapshot (for PDF labeling)
  event_title?: string;
  event_date?: string;

  // Deal terms snapshot
  artist_name?: string;
  guarantee: number;
  deal_type?: string;
  backend_percentage: number;
  bonus_structure?: Record<string, unknown>;
  radius_clause?: string;

  // Ticket audit
  ticket_audit: TicketAuditRow[];
  /** Total paying tickets (sum of audit.sold). Stored for quick reads. */
  tickets_sold_count: number;
  /** Total comp tickets (sum of audit.comps). Excluded from gross. */
  comp_count: number;
  /** Face-value of comps (informational — what the comps would have cost). */
  comp_face_value: number;

  // Calculated financials — all from actual order data when refreshed
  total_gross: number;          // Σ subtotal collected (face value, paying only)
  ticketing_fees: number;       // Σ ticketing service fees collected
  facility_fees: number;        // Σ facility fees collected
  cc_fees: number;              // Σ Stripe / processing fees collected
  ticketing_fee_per_ticket: number; // snapshot of per-ticket rate
  facility_fee_per_ticket: number;  // snapshot of per-ticket rate
  adj_gross: number;            // total_gross − ticketing_fees − facility_fees
  taxes: number;                // actual tax collected (Σ tax_cents)
  tax_rate: number;             // venue tax rate snapshot (e.g. 0.095)
  tax_method: TaxMethod;        // 'multiplier' (add on top) | 'divisor' (back out of total)
  net_receipts: number;         // adj_gross − taxes
  total_expenses: number;
  splitpoint: number;
  artist_backend: number;
  artist_total: number;

  // Deposits & advances
  deposit_paid: number;
  cash_advance: number;
  balance_due: number;

  // Ancillary revenue
  bar_revenue: number;
  concessions_revenue: number;
  merch_commission: number;       // legacy — superseded by merch_venue_share below
  ticketing_rebate: number;
  parking_revenue: number;
  sponsorship_revenue: number;
  other_ancillary: OtherAncillaryItem[];
  venue_total_revenue: number;
  venue_net_profit: number;

  // ── Merch Settlement ──────────────────────────────────────────────
  merch_items: MerchItem[];
  merch_discounts: number;             // free merch given out (band giveaways, comps)
  merch_split_venue_pct: number;       // 0–1, e.g. 0.20 = venue keeps 20% of net merch
  merch_tax_rate: number;              // 0–1, e.g. 0.095
  merch_tax_method: TaxMethod;         // 'multiplier' | 'divisor'
  merch_tax_payer: MerchTaxPayer;      // who remits the tax
  merch_seller_fee: number;            // cost to hire someone to run merch
  merch_seller_fee_payer: MerchSellerFeePayer;
  // Computed snapshots
  merch_total_gross: number;           // Σ items.gross
  merch_total_tax: number;             // tax on (gross − discounts)
  merch_total_net: number;             // (gross − discounts) − tax
  merch_venue_share: number;           // net × split%
  merch_artist_share: number;          // net − venue_share

  // Status
  status: SettlementStatus;
  finalized_at?: string;
  finalized_by?: string;

  created_at: string;
  updated_at: string;
};

export type SettlementExpense = {
  id: string;
  settlement_id: string;
  name: string;
  category: "fixed" | "variable";
  estimated_amount: number;
  actual_amount: number;
  rate: number;
  receipt_url?: string;
  notes?: string;
  sort_order: number;
};

export type SettlementDeposit = {
  id: string;
  settlement_id: string;
  type: "deposit" | "cash_advance" | "other";
  amount: number;
  date?: string;
  notes?: string;
  receipt_url?: string;
};
