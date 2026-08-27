import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How eventbuddy collects, uses, and protects data for organizations, staff, reps, and attendees using our event lead-capture platform.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  {
    heading: "Overview",
    body: [
      "This Privacy Policy explains what information eventbuddy (\"we\", \"us\") collects when organizations use our lead-capture and event-registration platform, how we use it, and the choices available to you.",
      "eventbuddy is used by two kinds of people: the organizations that run events on the platform (\"organizers\"), and the staff, reps, and attendees who interact with an organizer's events. This policy covers both.",
    ],
  },
  {
    heading: "Information we collect",
    body: [
      "Account information — name, email, phone, and organization details provided when an organizer signs up, plus staff and rep names used for on-site check-in.",
      "Event and lead data — details organizers configure for their events (destinations, custom questions, templates), and information collected about attendees at those events, such as name, email, and any fields the organizer's form asks for.",
      "Registration data — when someone registers for an event through a public link, we store their name, email, and any answers they provide, plus a QR code and reference ID used for check-in.",
      "Usage data — basic technical information (device, browser, pages visited) used to keep the platform reliable and secure.",
    ],
  },
  {
    heading: "How we use information",
    body: [
      "To operate the platform: authenticate accounts, run event check-in, generate analytics, and send confirmation emails (like registration QR codes).",
      "To keep the service secure and prevent abuse, including detecting unusual account or check-in activity.",
      "To communicate with organizers about their account, billing, or changes to the service.",
      "We do not sell personal data, and we do not use attendee data collected on behalf of an organizer for our own marketing.",
    ],
  },
  {
    heading: "Data isolation between organizations",
    body: [
      "Every organization's events, leads, and staff accounts are kept fully separate. Nothing collected by one organization is ever visible to, or shared with, another organization on the platform.",
    ],
  },
  {
    heading: "Sharing and disclosure",
    body: [
      "We share data with service providers who help us run the platform — for example, our database and email-delivery providers — solely to provide the service, under obligations to protect it.",
      "We may disclose information if required by law, or to protect the rights, safety, or property of eventbuddy, our users, or the public.",
    ],
  },
  {
    heading: "Data retention",
    body: [
      "Organizers control how long their event and lead data is kept, and can request deletion of their account and associated data at any time by contacting us.",
    ],
  },
  {
    heading: "Your choices",
    body: [
      "Attendees who registered for an event can contact the organizer directly, or reach us, to request access to or deletion of their registration data.",
      "Organizers can update or remove staff, rep, and event data directly from their dashboard.",
    ],
  },
  {
    heading: "Security",
    body: [
      "We use industry-standard safeguards, including encrypted connections and role-based access controls, to protect data stored on the platform. No method of transmission or storage is completely secure, so we can't guarantee absolute security.",
    ],
  },
  {
    heading: "Children's privacy",
    body: [
      "eventbuddy is not directed at children under 16, and we don't knowingly collect personal information from them.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "We may update this policy from time to time. Material changes will be reflected by updating the date below.",
    ],
  },
  {
    heading: "Contact us",
    body: [
      "Questions about this policy or your data can be sent to privacy@eventbuddy.example.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="sm:hidden">
            <Logo height={18} />
          </span>
          <span className="hidden sm:block">
            <Logo height={26} />
          </span>
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
        <h1 className="font-display text-4xl text-slate-900 mb-2">Privacy Policy</h1>
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

      <footer className="text-white" style={{ background: "#170821" }}>
        <div className="max-w-5xl mx-auto px-6 py-14 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <Logo tone="white" variant="full" height={16} />
            <p className="text-sm text-white/50 mt-4 max-w-xs leading-relaxed">
              Registration, ticketing, and check-in for any event — education fairs, job fairs, conferences, and more — never lose a lead.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Product</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/pricing" className="text-white/70 hover:text-white">
                Pricing
              </Link>
              <Link href="/login" className="text-white/70 hover:text-white">
                Sign in
              </Link>
              <Link href="/signup" className="text-white/70 hover:text-white">
                Get Started
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Legal</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/privacy" className="text-white/70 hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-white/70 hover:text-white">
                Terms &amp; Conditions
              </Link>
            </div>
          </div>
        </div>
        <div className="h-1 w-full flex">
          <div className="flex-1" style={{ background: "#C21FAF" }} />
          <div className="flex-1" style={{ background: "#6D28D9" }} />
          <div className="flex-1" style={{ background: "#E85D0A" }} />
          <div className="flex-1" style={{ background: "#B8119C" }} />
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/40">
            <p>© 2026 eventbuddy. All rights reserved.</p>
            <p>Never Lose a Lead</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
