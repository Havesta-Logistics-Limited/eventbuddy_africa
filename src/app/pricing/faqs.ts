/** Plain data, no "use client" directive — imported by both the server page.tsx
 *  (for FAQPage structured data) and the client pricing-content.tsx (for the
 *  rendered FAQ section). A function exported from a client-marked file can't be
 *  called directly from a Server Component, so this has to live in its own module. */
export function faqs(feePercent: string) {
  return [
    {
      q: "How much does Self-Serve cost?",
      a: `Nothing to start. Create your account and publish as many virtual or in-person events as you like, free. You only ever pay when a ticket actually sells — ${feePercent} of the ticket price, taken automatically at checkout. Free tickets and free events cost nothing at all.`,
    },
    {
      q: "What's the difference between Self-Serve, Full-Service, and Enterprise?",
      a: "Self-Serve is do-it-yourself — you set up the event and run it from your dashboard. Full-Service means eventbuddy's own team shows up on the day and runs registration, ticketing, and check-in for you. Enterprise is Full-Service across multiple events or venues, with dedicated support and custom terms.",
    },
    {
      q: "Is there a subscription or monthly fee?",
      a: "No, not on Self-Serve — there's nothing to pay until a ticket sells, and nothing recurring after that. Full-Service and Enterprise are quoted per event or per program, not billed monthly either.",
    },
    {
      q: "Do I pay anything for free tickets or free events?",
      a: "No. An event with no paid tickets — virtual or in-person — costs nothing to run, ever. The transaction fee only applies to tickets that actually sell.",
    },
    {
      q: "How do I actually get paid for ticket sales?",
      a: "Ticket revenue splits automatically the moment someone pays — your share settles straight to your own bank account. eventbuddy never holds your money; it only ever takes its transaction fee off the top.",
    },
    {
      q: "Can I try it before paying for anything?",
      a: "Yes. Signing up, creating events, and collecting free registrations is entirely free on Self-Serve. You only pay once you sell a paid ticket.",
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
