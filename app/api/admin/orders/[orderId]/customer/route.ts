import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// PATCH /api/admin/orders/[orderId]/customer
// Updates customer_name and customer_email on BOTH the order and all its tickets atomically.
// This is the safe way to fix a typo in a buyer's email — no deleting orders needed.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ orderId: string }> }
) {
  const { orderId } = await params;

  let body: { customer_name?: string; customer_email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { customer_name, customer_email } = body;

  if (!customer_name && !customer_email) {
    return NextResponse.json(
      { error: "Provide at least customer_name or customer_email" },
      { status: 400 }
    );
  }

  if (customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer_email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the order exists
  const { data: existing, error: findError } = await admin
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .single();

  if (findError || !existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Build the update payload — only include fields that were provided
  const orderUpdate: Record<string, string> = {};
  const ticketUpdate: Record<string, string> = {};
  if (customer_name) {
    orderUpdate.customer_name = customer_name;
    ticketUpdate.customer_name = customer_name;
  }
  if (customer_email) {
    orderUpdate.customer_email = customer_email;
    ticketUpdate.customer_email = customer_email;
  }

  // Update the order row
  const { data: updatedOrder, error: orderError } = await admin
    .from("orders")
    .update(orderUpdate)
    .eq("id", orderId)
    .select()
    .single();

  if (orderError) {
    return NextResponse.json({ error: orderError.message }, { status: 500 });
  }

  // Update all tickets belonging to this order
  const { error: ticketsError } = await admin
    .from("tickets")
    .update(ticketUpdate)
    .eq("order_id", orderId);

  if (ticketsError) {
    // Order was updated but tickets failed — log it but still return partial success
    console.error("Ticket customer update failed:", ticketsError.message);
    return NextResponse.json(
      {
        order: updatedOrder,
        warning: "Order updated but ticket records could not be updated: " + ticketsError.message,
      },
      { status: 207 }
    );
  }

  return NextResponse.json({ order: updatedOrder, success: true });
}
