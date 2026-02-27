export type DealType = "VS" | "FLAT" | "PLUS" | "BONUS";

export type ShowLineupItem = {
  time: string;
  artist: string;
  set_length: string;
};

export type TicketScalingRow = {
  name: string;
  seats: number;
  comps: number;
  kills: number;
  sellable_cap: number;
  price: number;
  net_price: number;
  facility_fee: number;
};

export type ExpenseItem = {
  name: string;
  amount: number;
};

export type VariableExpenseItem = {
  name: string;
  rate: number; // decimal (e.g., 0.008 for ASCAP, 0.03 for credit card)
  amount: number; // calculated from rate * gross
};

export type ArtistOffer = {
  id: string;
  artist_name: string;
  venue?: string;
  venue_address?: string;
  venue_contact?: string;
  venue_phone?: string;
  event_date?: string;
  venue_id?: string;

  // Agency
  agency?: string;
  agent_name?: string;
  agent_phone?: string;
  agent_email?: string;

  // Show details
  day_of_event?: string;
  num_shows?: number;
  show_length?: string;
  show_time?: string;
  billing?: string;
  show_lineup?: ShowLineupItem[];

  // Deal
  guarantee?: number;
  deal_type?: DealType;
  backend_percentage?: string;
  other_terms?: string;
  radius_distance?: string;
  radius_days_prior?: number;
  radius_days_after?: number;
  production_by?: string;
  deposit_pct?: number;
  deposit_amount?: number;
  deposit_due?: string;
  balance_due?: string;
  merch_split?: string;
  merch_seller?: string;
  comps?: number;
  artist_comps?: number;
  marketing_comps?: number;

  // Ticket scaling
  ticket_scaling?: TicketScalingRow[];

  // Expenses
  fixed_expenses?: ExpenseItem[];
  variable_expenses?: VariableExpenseItem[];

  // Calculated totals
  total_fixed?: number;
  total_variable?: number;
  total_expenses?: number;
  gross_potential?: number;
  adj_gross?: number;
  tax_rate?: number;
  net_potential?: number;
  splitpoint?: number;
  artist_backend?: number;
  pot_walkout?: number;
  offer_valid_days?: number;

  // Status
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  terms?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};
