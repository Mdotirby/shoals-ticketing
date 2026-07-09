// Revenue attribution for a single broadcast send — mirrors the old
// email-engine's proven UTM + conversion-window approach (7 days), reading
// orders.utm_campaign written at checkout (see app/api/webhooks/stripe/route.ts,
// app/api/checkout/free/route.ts). Computed live on read rather than via a
// cron rollup — send volume here is low enough that this is cheap, and no
// new automation/cron infrastructure is being reintroduced in this system.
import { createAdminClient } from "@/lib/supabase-server";

const CONVERSION_WINDOW_DAYS = 7;

export async function computeSendRevenue(emailSendId: string): Promise<number> {
  const admin = createAdminClient();

  const { data: send } = await admin
    .from("email_sends")
    .select("sent_at")
    .eq("id", emailSendId)
    .single();

  if (!send?.sent_at) return 0;

  const windowEnd = new Date(
    new Date(send.sent_at).getTime() + CONVERSION_WINDOW_DAYS * 86_400_000,
  ).toISOString();

  const { data: orders } = await admin
    .from("orders")
    .select("total_amount")
    .eq("utm_campaign", `broadcast:${emailSendId}`)
    .eq("status", "paid")
    .gte("created_at", send.sent_at)
    .lte("created_at", windowEnd);

  return (orders ?? []).reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
}
