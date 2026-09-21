// Whitelist of columns that exist on artist_offers. Keep in sync with
// plans/offers-expansion-migration.sql + plans/offer-tax-columns-migration.sql.
// Unknown keys from the client are silently dropped so that future form drift
// cannot break saves.
export const ALLOWED_COLUMNS = new Set<string>([
  // Identity / linkage
  "artist_name", "venue", "venue_address", "venue_contact", "venue_phone",
  "event_date", "venue_id", "event_venue_id", "event_id",
  // Agency
  "agency", "agent_name", "agent_phone", "agent_email",
  // Show details
  "day_of_event", "num_shows", "show_length", "show_time", "billing",
  "show_lineup",
  // Deal
  "guarantee", "deal_type", "backend_percentage", "other_terms",
  "radius_distance", "radius_days_prior", "radius_days_after",
  "production_by", "deposit_pct", "deposit_amount", "deposit_due",
  "balance_due", "merch_split", "merch_seller",
  "comps", "artist_comps", "marketing_comps",
  // Scaling + expenses
  "ticket_scaling", "fixed_expenses", "variable_expenses",
  // Totals
  "total_fixed", "total_variable", "total_expenses",
  "gross_potential", "adj_gross",
  "tax_rate", "tax_amount", "tax_method",
  "net_potential", "splitpoint", "artist_backend", "pot_walkout",
  "offer_valid_days",
  // Meta
  "terms", "notes", "status", "created_by",
]);

