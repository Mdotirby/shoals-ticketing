export type Order = {
  id: string;
  event_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  stripe_payment_intent_id?: string;
  stripe_checkout_session_id?: string;
  total_amount: number;
  status: "pending" | "paid" | "refunded" | "cancelled";
  delivery_method: "digital" | "physical";
  shipping_address?: ShippingAddress;
  created_at: string;
};

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};
