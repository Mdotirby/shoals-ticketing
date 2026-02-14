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
