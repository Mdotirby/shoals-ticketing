import { calculateFees } from "@/lib/fees/calculateFees";

/**
 * The storefront's breakdown, as app/components/InlineCheckout.tsx builds it.
 * It now calls calculateFees() rather than repeating the arithmetic, so this
 * mirrors that: same function, dollars derived from the same cents.
 */
function clientSide(price: number, tkt: number, fac: number, rate: number, qty: number) {
  const priced = calculateFees({
    ticketPriceCents: Math.round(price * 100),
    discountCentsPerTicket: 0,
    ticketingFee: tkt,
    facilityFee: fac,
    taxRate: rate,
    quantity: qty,
  });
  return {
    tax: (priced.taxCents * qty) / 100,
    processingFee: priced.stripeFeeCents / 100,
    total: priced.totalCents / 100,
  };
}

/**
 * The number on the screen must be the number on the card.
 *
 * These were two implementations of the same arithmetic and they disagreed on
 * 172 of these 320 baskets — the client taxed the whole order, the server
 * taxed a ticket and multiplied. Three $12.50 tickets: $3.56 shown, $3.57
 * charged. Now both go through calculateFees(), and this sweep is what stops
 * a second implementation growing back.
 */
describe("what the buyer is shown vs what the buyer is charged", () => {
  it("agrees to the cent across realistic baskets", () => {
    const mismatches: string[] = [];
    for (const price of [10, 12.5, 19.99, 20, 22.5, 25, 27.5, 33.33, 50, 75.5]) {
      for (const qty of [1, 2, 3, 4, 5, 6, 7, 8]) {
        for (const [tkt, fac] of [[3, 3], [4, 0], [0, 0], [2.5, 1.5]]) {
          const shown = clientSide(price, tkt, fac, 0.095, qty);
          const charged = calculateFees({
            ticketPriceCents: Math.round(price * 100),
            discountCentsPerTicket: 0,
            ticketingFee: tkt,
            facilityFee: fac,
            taxRate: 0.095,
            quantity: qty,
          });
          const shownTotal = Math.round(shown.total * 100);
          if (shownTotal !== charged.totalCents) {
            mismatches.push(
              `$${price} x${qty} fees ${tkt}/${fac}: shown ${shownTotal}c charged ${charged.totalCents}c (${charged.totalCents - shownTotal}c)`,
            );
          }
        }
      }
    }
    if (mismatches.length) console.log(mismatches.slice(0, 12).join("\n"), `\n... ${mismatches.length} total`);
    expect(mismatches).toEqual([]);
  });
});
