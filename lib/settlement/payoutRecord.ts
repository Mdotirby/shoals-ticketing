import type { SupabaseClient } from "@supabase/supabase-js";
import type { Settlement } from "@/lib/types/settlement";

/**
 * The payment record printed under Total Due to Artist: one row per payment
 * made, or one row saying nothing's been paid. Nothing here moves money.
 */

export type SettlementPayoutLike = {
  amount: number | string | null;
  method?: string | null;
  reference?: string | null;
  paid_at?: string | null;
};

export type PayoutRecord = { label: string; amount: number | null };

function day(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
}

/** "Paid Oct 31, 2026 · Check #1042" */
function label(p: SettlementPayoutLike): string {
  const ref = String(p.reference || "").trim().replace(/^#/, "");
  const how = [p.method, ref && (p.method === "Check" ? `#${ref}` : ref)].filter(Boolean).join(" ");
  return ["Paid" + (day(p.paid_at) ? ` ${day(p.paid_at)}` : ""), how].filter(Boolean).join(" · ");
}

export function payoutRecords(
  settlement: Pick<Settlement, "payout_amount" | "payout_method" | "payout_reference" | "payout_at">,
  payouts: SettlementPayoutLike[] = [],
): PayoutRecord[] {
  // Settlements from before the payouts list kept theirs on the row itself.
  const list: SettlementPayoutLike[] = payouts.length > 0
    ? payouts
    : settlement.payout_at
      ? [{ amount: settlement.payout_amount ?? 0, method: settlement.payout_method ?? null, reference: settlement.payout_reference ?? null, paid_at: settlement.payout_at }]
      : [];
  if (list.length === 0) return [{ label: "Payment record: not paid yet", amount: null }];
  return list.map((p) => ({ label: label(p), amount: Number(p.amount) || 0 }));
}

/** A settlement's payments, oldest first. Empty if the table isn't there yet. */
export async function loadPayouts(admin: SupabaseClient, settlementId: string): Promise<SettlementPayoutLike[]> {
  const { data } = await admin
    .from("settlement_payouts")
    .select("amount, method, reference, paid_at")
    .eq("settlement_id", settlementId)
    .order("paid_at", { ascending: true });
  return (data ?? []) as SettlementPayoutLike[];
}
