export type SettlementStatus = "draft" | "finalized";

export type TicketAuditRow = {
  tier: string;
  capacity: number;
  sold: number;
  comps: number;
  kills: number;
  price: number;
  facility_fee: number;
  gross: number;
};

export type OtherAncillaryItem = {
  name: string;
  amount: number;
};

export type Settlement = {
  id: string;
  event_id: string;
  offer_id?: string;
  contract_id?: string;
  venue_id: string;

  // Deal terms snapshot
  artist_name?: string;
  guarantee: number;
  deal_type?: string;
  backend_percentage: number;
  bonus_structure?: Record<string, unknown>;
  radius_clause?: string;

  // Ticket audit
  ticket_audit: TicketAuditRow[];

  // Calculated financials
  total_gross: number;
  ticketing_fees: number;
  facility_fees: number;
  adj_gross: number;
  taxes: number;
  tax_rate: number;
  net_receipts: number;
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
  merch_commission: number;
  ticketing_rebate: number;
  parking_revenue: number;
  sponsorship_revenue: number;
  other_ancillary: OtherAncillaryItem[];
  venue_total_revenue: number;
  venue_net_profit: number;

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
