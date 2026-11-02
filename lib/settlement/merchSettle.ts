import type { MerchSettleMethod, Settlement } from "@/lib/types/settlement";

/**
 * How the artist pays the venue its merch money: the venue's cut, an
 * artist-paid seller fee, and any sales tax the venue remits for them.
 *
 *   guarantee: netted out of the balance due (the default and the old behaviour)
 *   cash / check: the artist pays the promoter separately, so the balance
 *     due is the full walkout and the merch money is recorded on its own
 *
 * The venue earns its merch cut either way. Only the artist's balance changes.
 */

export const MERCH_SETTLE_METHODS: { value: MerchSettleMethod; label: string }[] = [
  { value: "guarantee", label: "Deduct from guarantee" },
  { value: "cash", label: "Artist pays promoter in cash" },
  { value: "check", label: "Artist pays promoter by check" },
];

export function isMerchPaidSeparately(method: MerchSettleMethod | null | undefined): boolean {
  return method === "cash" || method === "check";
}

/** What the artist owes the venue from merch. */
export function merchOwedToVenue(s: Pick<
  Settlement,
  "merch_venue_share" | "merch_seller_fee" | "merch_seller_fee_payer" | "merch_total_tax" | "merch_tax_payer"
>): number {
  const sellerFee = s.merch_seller_fee_payer === "artist" ? Number(s.merch_seller_fee) || 0 : 0;
  const tax = s.merch_tax_payer === "venue" ? Number(s.merch_total_tax) || 0 : 0;
  return (Number(s.merch_venue_share) || 0) + sellerFee + tax;
}

/** "Paid separately by check #1042" / "Paid separately in cash". Empty when it comes out of the guarantee. */
export function merchSettleLabel(method: MerchSettleMethod | null | undefined, reference?: string | null): string {
  if (method === "check") {
    const ref = String(reference || "").trim().replace(/^#/, "");
    return `Paid separately by check${ref ? ` #${ref}` : ""}`;
  }
  if (method === "cash") return "Paid separately in cash";
  return "";
}
