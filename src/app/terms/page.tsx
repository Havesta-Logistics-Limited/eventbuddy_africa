import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description: "The terms governing use of eventbuddy's event lead-capture and check-in platform for organizations, staff, reps, and attendees.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  {
    heading: "Acceptance of terms",
    body: [
      "By creating an account or using eventbuddy, you agree to these Terms & Conditions. If you're signing up on behalf of an organization, you're confirming you have authority to bind that organization to these terms.",
    ],
  },
  {
    heading: "Description of service",
    body: [
      "eventbuddy is a multi-tenant platform for running events, capturing leads at those events, and managing self-service attendee registration and check-in. Features and templates may change or expand over time.",
    ],
  },
  {
    heading: "Accounts and access",
    body: [
      "Organization admins are responsible for the security of their login credentials and for any activity under their account, including staff and rep access codes they issue for their events.",
      "You're responsible for the accuracy of the information you or your staff enter into the platform, including event details and any leads or registrations you collect.",
    ],
  },
  {
    heading: "Pricing and payment",
    body: [
      "Creating and publishing an event on eventbuddy is free, whether it's virtual or physical, and there is no charge for creating or editing an event.",
      "The Launch plan has no subscription or recurring fee. Grow and Scale are optional monthly subscriptions, billed in advance through Paystack, that lower the commission on paid tickets and remove the limit on promoters. You can cancel a subscription at any time; it stays active until the end of the period already paid for and is not refunded for the remainder.",
      "If you sell paid tickets through the platform, eventbuddy takes a commission on each paid ticket sold, made up of a percentage of the ticket price paid plus a fixed amount per ticket, at the rate for your plan as shown on the pricing page. This commission may be waived for specific organizations at eventbuddy's discretion.",
      "eventbuddy collects ticket payments on your behalf and credits them, less this commission, to your eventbuddy balance. You may request a payout of available funds to your verified bank account. Payouts are reviewed by eventbuddy and are subject to a minimum amount and a processing fee shown in your dashboard, and funds from an event may remain unavailable until a few days after it ends. Refunds and chargebacks are deducted from your balance.",
    ],
  },
  {
    heading: "Promoters",
    body: [
      "Anyone can register as a promoter on eventbuddy, free of charge. A promoter shares links to events whose organizers have chosen to pay promoters, and earns a commission on paid tickets bought through those links.",
      "The commission for each event is set by its organizer, as a percentage of the amount the organizer receives after eventbuddy's commission, and may be capped per ticket. It is shown on the promoter marketplace before you promote the event. Organizers can change these terms or pause a promoter at any time; a change applies only to tickets sold afterwards.",
      "Commission is earned only on paid tickets genuinely bought by other people through your link. Tickets you buy for yourself, or for a group that includes you, do not earn commission. If a ticket is refunded or its payment is disputed, the commission on it is reversed.",
      "Your earnings are credited to your eventbuddy balance and become available a few days after each event ends. You may request a payout to your verified bank account, subject to the same review, minimum amount and processing fee as organizer payouts. Changes to your bank details after they are first saved require eventbuddy's approval.",
      "Badges reflect your real, attributed sales and refund rate and are recalculated automatically; they cannot be applied for. Organizers may limit an event to promoters with a particular badge.",
      "You must promote events honestly and lawfully: no spam, no misleading claims about an event, and no buying tickets through your own link to earn commission. eventbuddy may suspend a promoter account and withhold or reverse commission earned in breach of these terms.",
    ],
  },
  {
    heading: "Exhibitors",
    body: [
      "Organizers may take applications from businesses that want a stand at their event. An application is not a booking: the organizer decides whether to accept it, and an accepted exhibitor confirms their stand by paying for it through eventbuddy. Stand payments are handled like ticket payments, including eventbuddy's commission, and refunds are at the organizer's discretion.",
      "A paid exhibitor gets a private portal link for naming their staff passes and collecting leads. Anyone with the link can use it, so exhibitors must share it only with their own team.",
      "Exhibitors who scan your ticket receive your name, email and phone. By showing your ticket to an exhibitor to be scanned, you agree to them receiving these details. Exhibitors must use them only to follow up about what they showed you at the event, in line with applicable data-protection law, and must not sell or share them.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "You agree not to use eventbuddy to collect data unlawfully, to spam or harass attendees, or to attempt to access another organization's data or bypass the platform's access controls.",
      "We may suspend or terminate accounts that violate these terms or misuse the platform.",
    ],
  },
  {
    heading: "Ownership of your data",
    body: [
      "Organizers own the event, lead, and registration data they collect through the platform. We process it on your behalf to provide the service, as described in our Privacy Policy.",
    ],
  },
  {
    heading: "Intellectual property",
    body: [
      "The eventbuddy name, logo, and platform software are our property. Nothing in these terms grants you rights to our brand or code beyond using the hosted service.",
    ],
  },
  {
    heading: "Termination",
    body: [
      "You may stop using eventbuddy and close your account at any time. We may suspend or terminate accounts for violation of these terms, non-payment, or to protect the platform and its users.",
    ],
  },
  {
    heading: "Disclaimers and limitation of liability",
    body: [
      "eventbuddy is provided \"as is\", without warranties of any kind. To the extent permitted by law, we aren't liable for indirect, incidental, or consequential damages arising from use of the platform.",
    ],
  },
  {
    heading: "Changes to these terms",
    body: [
      "We may update these terms from time to time. Continued use of eventbuddy after a change means you accept the updated terms.",
    ],
  },
  {
    heading: "Contact us",
    body: [
      "Questions about these terms can be sent to info@eventbuddy.africa.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />

      <section className="eb-page-hero max-w-3xl mx-auto px-6 pt-12 pb-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-500 mb-3">Legal</p>
        <h1 className="font-display text-4xl text-fg mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-subtle">Last updated October 7, 2026</p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="space-y-10 mt-6">
          {SECTIONS.map(({ heading, body }) => (
            <div key={heading} className="pt-8 border-t border-line first:pt-0 first:border-t-0">
              <h2 className="font-display text-xl text-fg mb-3">{heading}</h2>
              <div className="space-y-3">
                {body.map((p, i) => (
                  <p key={i} className="text-sm text-fg-3 leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
