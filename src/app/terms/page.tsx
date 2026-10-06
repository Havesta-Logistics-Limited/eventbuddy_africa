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
      "Creating and publishing an event on eventbuddy is free, whether it's virtual or physical. There is no subscription, recurring fee, or charge for creating an event.",
      "Editing an existing event's details after creation does not incur any charge.",
      "If you sell paid tickets through the platform, eventbuddy takes a commission on each paid ticket sold, made up of a percentage of the ticket price paid plus a fixed amount per ticket, as shown on the pricing page and deducted automatically from the payment before it reaches your connected bank account. This commission may be waived for specific organizations at eventbuddy's discretion.",
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
        <p className="text-sm text-subtle">Last updated October 6, 2026</p>
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
