import type { Metadata } from "next";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";

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
      "Exhibitors who scan your ticket receive your name, email and phone. This happens only when you show your ticket to an exhibitor at an event to be scanned; exhibitors never see the rest of the attendee list.",
      "We use Google Analytics to understand how visitors use our marketing site (pages visited, general location, device type) — it doesn't collect the event, lead, or registration data described above.",
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
      "Questions about this policy or your data can be sent to info@eventbuddy.africa.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />

      <section className="eb-page-hero max-w-3xl mx-auto px-6 pt-12 pb-4">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-500 mb-3">Legal</p>
        <h1 className="font-display text-4xl text-fg mb-2">Privacy Policy</h1>
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
