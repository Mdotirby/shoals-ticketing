/**
 * Co-Promote Agreement — a contract between us (as a promoter going into
 * someone else's venue) and a third-party venue that provides the space
 * and takes a cut of ticket revenue.
 */

export type CoPromoteStatus = "draft" | "sent" | "signed" | "void";

export type CoPromoteDealStructure =
  | "rev_share_gross"          // % of gross before any deductions
  | "rev_share_after_tax"      // % of gross after sales tax, before expenses (most common)
  | "rev_share_net"            // % of net after all expenses
  | "flat_rent"                // flat rental fee, promoter keeps all upside
  | "rent_plus_rev_share";     // flat rent + % rev share

export type CoPromoteSettlementTiming = "night_of_show" | "net_7" | "net_14" | "net_30";

export type CoPromoteClause = {
  title: string;
  body: string;
};

export type CoPromoteAgreement = {
  id: string;

  // Linked entities
  event_id?: string | null;
  our_venue_id?: string | null;

  // Metadata
  agreement_number: string;
  agreement_date: string; // ISO date
  status: CoPromoteStatus;

  // Buyer (us)
  buyer_company_name: string;
  buyer_signatory_name?: string | null;
  buyer_signatory_title?: string | null;
  buyer_email?: string | null;
  buyer_phone?: string | null;
  buyer_address?: string | null;

  // Partner Venue (them)
  partner_venue_name: string;
  partner_venue_address?: string | null;
  partner_contact_name?: string | null;
  partner_contact_title?: string | null;
  partner_email?: string | null;
  partner_phone?: string | null;
  partner_tax_id?: string | null;

  // Event
  event_name?: string | null;
  event_date: string;
  event_load_in_time?: string | null;
  event_doors_time?: string | null;
  event_show_time?: string | null;
  event_curfew?: string | null;
  expected_capacity?: number | null;

  // Deal Structure
  deal_structure: CoPromoteDealStructure;
  buyer_percentage?: number | null;
  venue_percentage?: number | null;
  flat_rent_amount: number;

  include_ticketing_fees: boolean;
  include_facility_fees: boolean;
  include_comps: boolean;

  // Deposit
  deposit_amount: number;
  deposit_due_date?: string | null;
  deposit_paid: boolean;
  deposit_paid_at?: string | null;

  // Venue services
  venue_provides_staff: boolean;
  venue_provides_sound: boolean;
  venue_provides_lights: boolean;
  venue_provides_security: boolean;
  venue_provides_bar: boolean;

  venue_bar_revenue_split?: string | null;
  venue_merch_fee_pct: number;

  // Settlement
  settlement_timing: CoPromoteSettlementTiming;
  settlement_currency: string;

  // Terms
  cancellation_policy?: string | null;
  force_majeure_clause?: string | null;
  marketing_rights?: string | null;
  radius_clause?: string | null;

  custom_clauses: CoPromoteClause[];
  additional_terms?: string | null;

  // Docs
  file_url?: string | null;
  file_name?: string | null;

  // Signatures
  buyer_signed_at?: string | null;
  buyer_signed_by?: string | null;
  venue_signed_at?: string | null;
  venue_signed_by?: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
};

/** Human-readable labels for the deal structure enum */
export const DEAL_STRUCTURE_LABELS: Record<CoPromoteDealStructure, string> = {
  rev_share_gross: "Rev Share on Gross (pre-tax)",
  rev_share_after_tax: "Rev Share on Gross After Tax",
  rev_share_net: "Rev Share on Net (post-expense)",
  flat_rent: "Flat Rental Fee",
  rent_plus_rev_share: "Flat Rent + Rev Share",
};

export const SETTLEMENT_TIMING_LABELS: Record<CoPromoteSettlementTiming, string> = {
  night_of_show: "Night of Show",
  net_7: "Net 7 Days",
  net_14: "Net 14 Days",
  net_30: "Net 30 Days",
};
