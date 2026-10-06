/** The main call to action for an event's public page, from its ticket prices:
 *  "Buy Ticket" when every ticket costs money, "Get Tickets" when free and paid
 *  tickets are both on sale, "Register" for a free event (or one with no ticket
 *  types). Shared by the register page and its link-preview image. */
export function ticketCtaLabel(prices: number[]): "Buy Ticket" | "Get Tickets" | "Register" {
  const paid = prices.filter((p) => p > 0).length;
  if (paid === 0) return "Register";
  return paid === prices.length ? "Buy Ticket" : "Get Tickets";
}
