/** Plain data, no "use client" directive — imported by both the server page.tsx
 *  (for FAQPage structured data) and the client pricing-content.tsx (for the
 *  rendered FAQ section). A function exported from a client-marked file can't be
 *  called directly from a Server Component, so this has to live in its own module. */
/** feeLabel is the formatted live fee, e.g. "5% + ₦100" (see formatTicketFee). */
export function faqs(feeLabel: string) {
  return [
    {
      q: "How much does Self-Serve cost?",
      a: `Nothing to start. On the free Launch plan you publish as many virtual or in-person events as you like and only pay when a ticket actually sells: ${feeLabel} per paid ticket, taken automatically at checkout. Free tickets and free events cost nothing at all. Organizers who sell a lot can move to Grow or Scale for a lower fee on every ticket.`,
    },
    {
      q: "What's the difference between Self-Serve, Full-Service, and Enterprise?",
      a: "Self-Serve is do-it-yourself — you set up the event and run it from your dashboard. Full-Service means eventbuddy's own team shows up on the day and runs registration, ticketing, and check-in for you. Enterprise is Full-Service across multiple events or venues, with dedicated support and custom terms.",
    },
    {
      q: "Is there a subscription or monthly fee?",
      a: "Not unless you want one. Launch is free, with nothing to pay until a ticket sells. Grow and Scale are optional monthly plans that lower your fee on every paid ticket and remove the limit on promoters; cancel any time and you keep the plan until the end of the month you paid for. Full-Service and Enterprise are quoted per event or per program.",
    },
    {
      q: "Do I pay anything for free tickets or free events?",
      a: "No. An event with no paid tickets — virtual or in-person — costs nothing to run, ever. The transaction fee only applies to tickets that actually sell.",
    },
    {
      q: "How do I actually get paid for ticket sales?",
      a: "Every sale goes into your eventbuddy balance, minus the transaction fee, and clears the next business day. Once your event has ended (or during it, if your account is verified), request a payout from your dashboard and we send it to your bank, usually within 24 hours. Refunds simply come off your balance, so there's never anything to chase.",
    },
    {
      q: "Can I try it before paying for anything?",
      a: "Yes. Signing up, creating events, and collecting free registrations is entirely free on Self-Serve. You only pay once you sell a paid ticket.",
    },
    {
      q: "Can promoters help sell my tickets?",
      a: "Yes. Turn on the promoter program for an event and it's listed on the eventbuddy promoter marketplace, where promoters share their own link. You set the commission (at least 5% of what you net); it's only paid when a promoter's link actually sells a ticket, and it comes off your balance automatically. Launch includes up to 5 promoters per event; Grow and Scale are unlimited.",
    },
    {
      q: "Do my staff and reps need their own accounts?",
      a: "No. They check in with the access code you set for that event — no admin login, no separate signup. Unlimited staff and reps are included at no extra cost.",
    },
    {
      q: "How do I bring eventbuddy's team on-site for my event?",
      a: "Request a quote for Full-Service or Enterprise — tell us about your event and we'll follow up with pricing and next steps.",
    },
  ];
}
