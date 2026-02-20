// ═══════════════════════════════════════════════════════════════
// VC Auction — TypeScript Types
// ═══════════════════════════════════════════════════════════════

export type AuctionStatus = "draft" | "published" | "open" | "closed" | "settled";

export type Auction = {
  id: string;
  venue_id: string;
  event_id?: string | null;
  name: string;
  description?: string | null;
  logo_url?: string | null;
  auction_open: string;   // ISO 8601
  auction_close: string;  // ISO 8601
  status: AuctionStatus;
  anti_snipe_enabled: boolean;
  anti_snipe_minutes: number;
  host_fee_percent: number;
  created_at: string;
  // Joined fields
  venue_name?: string;
  event_title?: string;
  item_count?: number;
};

export type AuctionItem = {
  id: string;
  auction_id: string;
  name: string;
  starting_bid: number;
  min_increment: number;
  reserve_price?: number | null;
  current_bid?: number | null;
  current_winner_id?: string | null;
  qr_code: string;
  sort_order: number;
  created_at: string;
  // Joined / computed fields
  bid_count?: number;
  current_winner_name?: string;
};

export type AuctionItemDraft = {
  name: string;
  starting_bid: string;   // string for form input
  min_increment: string;   // string for form input
  reserve_price: string;   // string for form input
};

export type AuctionBidder = {
  id: string;
  auction_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  created_at: string;
};

export type AuctionBid = {
  id: string;
  item_id: string;
  bidder_id: string;
  amount: number;
  created_at: string;
  // Joined fields
  bidder_first_name?: string;
  bidder_last_name?: string;
  item_name?: string;
};

export type AuctionOrder = {
  id: string;
  auction_id: string;
  bidder_id: string;
  total_amount: number;
  processing_fee: number;
  grand_total: number;
  payment_method?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_transaction_id?: string | null;
  status: string;
  created_at: string;
  // Joined fields
  bidder_name?: string;
  items?: AuctionOrderItem[];
};

export type AuctionOrderItem = {
  id: string;
  order_id: string;
  item_id: string;
  winning_price: number;
  // Joined
  item_name?: string;
};

// ── Bidder session stored in localStorage ──
export type BidderSession = {
  bidder_id: string;
  auction_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
};

// ── Dashboard item card shape ──
export type DashboardItem = {
  item_id: string;
  item_name: string;
  starting_bid: number;
  current_bid: number;
  min_increment: number;
  my_highest_bid: number;
  is_winning: boolean;
  highest_bidder_name: string; // "Sarah H." format
  auction_close: string;
  reserve_met: boolean;
};

// ── Report types ──
export type AuctionReportType =
  | "item_report"
  | "all_bidders"
  | "winning_bidders"
  | "paid_by_cc"
  | "gross_receipts";
