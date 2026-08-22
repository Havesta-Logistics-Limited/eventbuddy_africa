"use client";

import Link from "next/link";
import { Logo } from "@/components/logo";

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
      "eventbuddy is pay-per-event: you're only charged when you create an event, at the price shown at checkout. There is no subscription or recurring fee.",
      "Editing an existing event's details after creation does not incur an additional charge.",
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
      "Questions about these terms can be sent to legal@eventbuddy.example.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Logo height={32} className="sm:hidden" />
          <Logo height={45} className="hidden sm:block" />
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link href="/pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
              Pricing
            </Link>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link href="/signup" className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-12 pb-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">Legal</p>
        <h1 className="font-display text-4xl text-slate-900 mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-slate-400">Last updated August 20, 2026</p>
      </section>

      <section className="max-w-3xl mx-auto px-6 pb-20">
        <div className="space-y-10 mt-6">
          {SECTIONS.map(({ heading, body }) => (
            <div key={heading} className="pt-8 border-t border-slate-200 first:pt-0 first:border-t-0">
              <h2 className="font-display text-xl text-slate-900 mb-3">{heading}</h2>
              <div className="space-y-3">
                {body.map((p, i) => (
                  <p key={i} className="text-sm text-slate-600 leading-relaxed">
                    {p}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Logo variant="full" height={28} />
          </div>
          <nav className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-slate-600">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-slate-600">
              Terms &amp; Conditions
            </Link>
          </nav>
          <p>© 2026 eventbuddy. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
