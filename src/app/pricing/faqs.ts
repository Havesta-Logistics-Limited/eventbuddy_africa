/** Plain data, no "use client" directive — imported by both the server page.tsx
 *  (for FAQPage structured data) and the client pricing-content.tsx (for the
 *  rendered FAQ section). A function exported from a client-marked file can't be
 *  called directly from a Server Component, so this has to live in its own module. */
export function faqs(price: string) {
  return [
    {
      q: "What counts as \"one event\"?",
      a: `A single event — one entry on your dashboard, whatever type it is or however long it runs. A 3-day education fair across 6 destinations, or a one-day job fair, is still one event, one ${price} charge (if it's in-person).`,
    },
    {
      q: "Do I pay for virtual events?",
      a: `No — virtual events are free, always. The ${price} fee only applies when you host a physical, in-person event. Run as many virtual events as you like at no cost.`,
    },
    {
      q: "Is there a subscription or monthly fee?",
      a: "No. There's nothing to pay until you create a physical event, and nothing recurring after that — you're only ever charged when you actually host an in-person fair.",
    },
    {
      q: "What if I need to edit an event after paying?",
      a: `Editing dates, venue, destinations, or access codes on an existing event is free — the ${price} only applies to creating a new physical event.`,
    },
    {
      q: "Can I try it before paying?",
      a: "Signing up and exploring your dashboard is free, and so is hosting a virtual event. You're only charged when you create your first physical event.",
    },
    {
      q: "Do my staff and reps need their own accounts?",
      a: "No. They check in with the access code you set for that event — no admin login, no separate signup. Unlimited staff and reps are included at no extra cost.",
    },
  ];
}
