"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutTemplate,
  Users2,
  KeyRound,
  BarChart3,
  ShieldCheck,
  Mail,
  ArrowRight,
  Settings2,
  Link2,
  QrCode,
  Calendar,
  Check,
  X,
  Ticket,
  Mic2,
  Send,
  Megaphone,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { LandingHero, LandingNav } from "@/components/landing/landing-hero";
import { TrustedBy } from "@/components/landing/trusted-by";
import { LandingWays } from "@/components/landing/landing-ways";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatTicketFee } from "@/lib/billing";
import { faqs } from "@/app/pricing/faqs";

const STEPS = [
  {
    icon: Settings2,
    title: "Set up the event",
    body: "Choose a template, lock in your dates and venue, and add ticket types if you're charging for entry. Your staff access code is ready the moment you save.",
  },
  {
    icon: Link2,
    title: "Open registration",
    body: "Hand out a single link — attendees use it to register or grab a ticket, and your staff use that same one to check people in.",
  },
  {
    icon: QrCode,
    title: "Run the day",
    body: "Every attendee's QR code gets scanned at the door, and your dashboard fills in behind them — sign-ups, sales, and leads, all in real time.",
  },
];

function getFeatures(feeLabel: string) {
  return [
    { icon: Ticket, title: "Registration & ticketing, built in", body: `Free or paid tickets with QR codes, for virtual and in-person events alike. Ticket revenue splits straight to your own bank account — you only pay ${feeLabel} per ticket that actually sells.` },
    { icon: Send, title: "Invite-only guest lists & RSVPs", body: "Build a private guest list for a corporate or invite-only event, track who's accepted, maybe, or declined, let guests bring named plus-ones, and send reminder nudges automatically." },
    { icon: Mic2, title: "A live hub for every event", body: "Schedule, speakers, moderated Q&A, and live polls — every attendee gets their own hub automatically the moment they register." },
    { icon: Users2, title: "Role-based access", body: "Admins run the show, staff capture leads for their event, and — for multi-destination events — reps see only their own university's leads." },
    { icon: KeyRound, title: "Access codes per event", body: "Gate staff and rep check-in behind a code you set — or leave it open for smaller, trusted teams." },
    { icon: BarChart3, title: "Live analytics", body: "Registration, ticket sales, and check-in numbers updated live, with destination and course breakdowns for education fairs and custom-question breakdowns for everything else." },
    { icon: Mail, title: "Export & email leads", body: "Download a CSV or email it straight from the app, filtered by event, destination, or university." },
    { icon: ShieldCheck, title: "Your data, isolated", body: "Every organization's events, leads, and staff are kept fully separate — nothing is ever shared across accounts." },
    { icon: LayoutTemplate, title: "Any kind of event", body: "Start from a template — education fair, job fair, conference, trade show — or build a custom registration form from scratch." },
  ];
}

// Every capability check here is real and verifiable against the actual product —
// nothing implies a fabricated usage stat or customer count, only what the software
// and the patchwork of tools it replaces actually do or don't do. "Spreadsheet +
// forms" stands in for the real starting point: a shared sheet, a Google Form for
// sign-ups, a separate ticketing link, and a WhatsApp group for RSVPs.
const COMPARISON_ROWS = [
  { label: "Sell tickets, revenue split straight to your bank", spreadsheet: false, eventbuddy: true },
  { label: "Invite-only guest lists with RSVP tracking & plus-ones", spreadsheet: false, eventbuddy: true },
  { label: "A live hub for schedule, Q&A, and polls on the day", spreadsheet: false, eventbuddy: true },
  { label: "Self-service registration with instant QR check-in", spreadsheet: false, eventbuddy: true },
  { label: "Multiple staff capturing at once, no conflicts", spreadsheet: false, eventbuddy: true },
  { label: "One-click CSV export or email", spreadsheet: false, eventbuddy: true },
  { label: "Works from any staff member's own phone", spreadsheet: true, eventbuddy: true },
];

const HOME_FAQ_QUESTIONS = [
  "How much does Self-Serve cost?",
  "What's the difference between Self-Serve, Full-Service, and Enterprise?",
  "Do I pay anything for free tickets or free events?",
  "Can I try it before paying for anything?",
];


export default function MarketingHomePage() {
  // Every visible fee on this page mirrors platform_settings (percentage + flat
  // amount — the same values the platform admin's Billing tab edits and checkout
  // charges) rather than the fallback constants, so it can never drift out of sync
  // with a live rate change.
  const [fee, setFee] = useState(DEFAULT_TICKET_FEE);
  useEffect(() => {
    fetchCurrentTicketFee().then(setFee);
  }, []);
  const feeLabel = formatTicketFee(fee);
  const FEATURES = getFeatures(feeLabel);
  const homeFaqs = faqs(feeLabel).filter((f) => HOME_FAQ_QUESTIONS.includes(f.q));


  return (
    <div className="min-h-screen bg-slate-50">
      <LandingNav />
      <LandingHero fee={fee} />

      <TrustedBy />

      <LandingWays feeLabel={feeLabel} />

      {/* Product demo — an actual walkthrough embedded right here, so a visitor
          can see eventbuddy working before deciding whether to sign up. */}
      <section className="max-w-5xl mx-auto px-6 pb-4">
        <h2 className="font-display text-3xl text-slate-900 text-center mb-2">See it in action</h2>
        <p className="text-slate-500 text-center max-w-lg mx-auto mb-10">A real walkthrough of creating and managing an event in eventbuddy.</p>
        <div
          className="rounded-3xl overflow-hidden border border-slate-200 shadow-sm"
          style={{ position: "relative", boxSizing: "content-box", maxHeight: "80vh", width: "100%", aspectRatio: "1.6", padding: "40px 0" }}
        >
          <iframe
            src="https://app.supademo.com/embed/cmtebm42w0px8qmia3af4jrix?embed_v=2&utm_source=embed"
            loading="lazy"
            title="Create Virtual Events and Manage Attendees on EventBuddy"
            allow="clipboard-write"
            allowFullScreen
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
          />
        </div>
      </section>

      {/* How it works — a connected horizontal sequence, not three boxed cards.
          The step order carries real information (setup must happen before the link
          is shared), so the numbering earns its place here. */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display text-3xl sm:text-4xl text-slate-900 mb-4">
          Three steps between you <em className="text-brand-600">and a live event.</em>
        </h2>
        <p className="text-slate-500 max-w-lg mx-auto mb-16">
          Skip the group chats and the last-minute panic — set it up once, and the rest runs itself.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 sm:gap-6 relative">
          <div className="hidden sm:block absolute top-7 left-[16.5%] right-[16.5%] h-px bg-brand-100" />
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative">
              <div className="relative z-10 w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mx-auto mb-5">
                <s.icon size={22} className="text-brand-600" />
                <span className="absolute -top-2.5 -right-2.5 w-6 h-6 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                  {i + 1}
                </span>
              </div>
              <h3 className="font-semibold text-slate-900 text-lg mb-1.5">{s.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">{s.body}</p>
            </div>
          ))}
        </div>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 mt-14 px-6 py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
        >
          Get Started
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Event Hub — the attendee-facing continuation of "run the day," so the page's
          own journey (set up → open registration → run the day) doesn't stop the
          instant someone's scanned in. Mockup mirrors the real Hub UI's own visual
          language (the green header band, the tab bar) rather than a generic
          illustration, matching how the hero mockup mirrors the real dashboard. */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-20 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">The Event Hub</p>
            <h2 className="font-display text-3xl sm:text-4xl text-slate-900 leading-tight mb-4">
              Check-in isn&apos;t the finish line.
              <br />
              <em>Neither is your event page.</em>
            </h2>
            <p className="text-slate-500 leading-relaxed max-w-md mb-10">
              The moment someone registers, they get their own event hub — schedule, speakers, live Q&amp;A, and
              updates, all in one place. You stay in control of what goes live; they stay engaged from the first
              session to the last.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-7">
              {[
                { icon: Calendar, title: "Full schedule & speakers", body: "Every session, time, and speaker — searchable in seconds, so nobody's asking where they need to be." },
                { icon: Send, title: "Live, moderated Q&A", body: "Attendees ask questions aimed at a specific speaker or session. Nothing reaches the room until you approve it." },
                { icon: BarChart3, title: "Live polls", body: "Push a question to everyone at once and watch the results update as votes come in." },
                { icon: QrCode, title: "Access, no extra effort", body: "A link on their confirmation gets them in automatically — or scan one QR code posted at the venue." },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3">
                  <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-brand-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real Hub visual language — same green header, same tab bar, same card
              rhythm as src/app/[orgSlug]/events/[eventId]/hub/page.tsx. */}
          <div className="relative mx-auto w-full max-w-[300px] animate-idle-float hover-bounce">
            <div className="absolute -inset-5 rounded-[2.5rem] bg-brand-50 hidden lg:block" />
            <div className="relative bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200">
              <div className="pt-7 pb-9 px-5" style={{ background: "#C21FAF" }}>
                <p className="text-[10px] uppercase tracking-wider text-white/60 mb-1.5">Event Hub</p>
                <p className="font-display text-white text-base leading-tight mb-1.5">Global Career Expo</p>
                <span className="flex items-center gap-1.5 text-[11px] text-white/75">
                  <Calendar size={11} />
                  21 August · 9:00 AM
                </span>
              </div>
              <div className="relative -mt-4 mx-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                <div className="flex border-b border-slate-100">
                  {[Calendar, Mic2, Send, BarChart3, Megaphone].map((Icon, i) => (
                    <div key={i} className={`flex-1 flex justify-center py-2.5 border-b-2 ${i === 0 ? "border-brand-600" : "border-transparent"}`}>
                      <Icon size={13} className={i === 0 ? "text-brand-700" : "text-slate-300"} />
                    </div>
                  ))}
                </div>
                <div className="p-3 space-y-2">
                  <div className="border border-slate-100 rounded-lg p-2.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded-full">Keynote</span>
                    <p className="text-xs font-semibold text-slate-900 mt-1.5">Opening Remarks</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">9:00 AM · Amaka Obi</p>
                  </div>
                  <div className="border border-slate-100 rounded-lg p-2.5">
                    <span className="text-[9px] font-semibold uppercase tracking-wide text-accent-purple-600 bg-accent-purple-50 px-1.5 py-0.5 rounded-full">Panel</span>
                    <p className="text-xs font-semibold text-slate-900 mt-1.5">Careers in Tech</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">10:30 AM · 3 speakers</p>
                  </div>
                </div>
              </div>
              <div className="h-4" />
            </div>
          </div>
        </div>
      </section>

      {/* Features — one wide featured tile plus a plain editorial list beneath it,
          not a uniform grid of same-size icon+heading+text cards. */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <h2 className="font-display text-3xl text-slate-900 mb-12 max-w-md">Built for the way events actually run</h2>

          <div
            className="rounded-2xl p-8 flex flex-col sm:flex-row gap-6 sm:items-start text-white mb-10"
            style={{ background: "radial-gradient(ellipse 150% 130% at 15% -10%, #FF8AF5 0%, #C21FAF 60%, #170821 140%)" }}
          >
            <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              {(() => {
                const Icon = FEATURES[0].icon;
                return <Icon size={21} className="text-white" />;
              })()}
            </div>
            <div className="flex-1">
              <h3 className="font-display text-xl mb-2">{FEATURES[0].title}</h3>
              <p className="text-sm text-white/70 leading-relaxed max-w-xl mb-5">{FEATURES[0].body}</p>
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {[
                  { role: "Free tickets", tag: "Always ₦0" },
                  { role: "Paid tickets", tag: `${feeLabel} fee, rest is yours` },
                  { role: "Check-in", tag: "One QR code per attendee" },
                ].map(({ role, tag }) => (
                  <div key={role} className="flex items-center gap-2 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/60 shrink-0" />
                    <span className="font-medium text-white">{role}</span>
                    <span className="text-white/60">— {tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
            {FEATURES.slice(1).map(({ icon: Icon, title, body }, i) => {
              const colors = ["text-brand-600", "text-accent-purple-600", "text-accent-green-600", "text-accent-yellow-700", "text-brand-600", "text-accent-purple-600"];
              return (
                <div key={title} className="flex gap-4">
                  <Icon size={20} className={`${colors[i % colors.length]} shrink-0 mt-0.5`} />
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why eventbuddy — a real comparison table (the pattern serious competitors
          use for this claim) instead of two lists stacked in a card. eventbuddy has
          no real customers to quote, so every row here is a verifiable capability
          check, not a fabricated testimonial or usage number. */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <h2 className="font-display text-3xl text-slate-900 text-center mb-2 text-balance">Why teams move off a patchwork of tools</h2>
        <p className="text-slate-500 text-center max-w-lg mx-auto mb-12">
          A spreadsheet, a Google Form, and a separate ticketing link work fine for one small event. They stop
          working the moment yours grows.
        </p>
        <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 sm:px-6 py-4 bg-slate-50 border-b border-slate-200">
            <span />
            <span className="text-xs font-semibold text-slate-500 text-center w-16">Spreadsheet</span>
            <span className="text-xs font-semibold text-brand-600 text-center w-16">eventbuddy</span>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-[1fr_auto_auto] gap-4 items-center px-5 sm:px-6 py-4 ${i !== 0 ? "border-t border-slate-100" : ""}`}
            >
              <span className="text-sm text-slate-700">{row.label}</span>
              <span className="w-16 flex justify-center">
                {row.spreadsheet ? <Check size={17} className="text-accent-green-600" /> : <X size={17} className="text-slate-300" />}
              </span>
              <span className="w-16 flex justify-center">
                {row.eventbuddy ? <Check size={17} className="text-accent-green-600" /> : <X size={17} className="text-slate-300" />}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing — Self-Serve is the real, featured offer here (free to start, the
          path most visitors will actually take); Full-Service and Enterprise get
          their full treatment on /pricing rather than crowding this tile. */}
      <section className="max-w-3xl mx-auto px-6 py-20">
        <div
          className="relative overflow-hidden rounded-3xl px-6 sm:px-10 py-14 text-white text-center"
          style={{ background: "radial-gradient(ellipse 150% 130% at 80% -10%, #FF8AF5 0%, #C21FAF 60%, #170821 140%)" }}
        >
          <h2 className="font-display text-3xl mb-3">Simple, honest pricing</h2>
          <p className="text-white/70 max-w-md mx-auto mb-8">No subscription, no per-seat fees, no upfront cost.</p>
          <p className="font-display text-6xl leading-none mb-2">Free to start</p>
          <p className="text-white/60 text-sm mb-8">plus {feeLabel} per ticket that actually sells — free events and free tickets always cost nothing</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-white text-brand-600 hover:bg-white/90 transition-colors"
            >
              View full pricing &amp; FAQ
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <FaqAccordion homeFaqs={homeFaqs} />

      {/* Final call to action — real CTAs only (no "Book a Demo," eventbuddy has no
          demo-booking flow): straight into signup, or into pricing for anyone still
          deciding between Self-Serve and a managed tier. */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div
          className="relative overflow-hidden rounded-3xl px-6 sm:px-12 py-16 text-white text-center"
          style={{ background: "radial-gradient(ellipse 150% 130% at 20% -10%, #FF8AF5 0%, #C21FAF 60%, #170821 140%)" }}
        >
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{ backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
          />
          <div className="relative">
            <h2 className="font-display text-3xl sm:text-4xl leading-tight mb-4">
              Your next event deserves
              <br />
              <em>a better system.</em>
            </h2>
            <p className="text-white/70 max-w-lg mx-auto mb-8">
              Stop juggling spreadsheets, WhatsApp groups, and walk-up chaos. Set up registration, ticketing, and
              check-in yourself, or bring eventbuddy&apos;s own team on-site to run it for you.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-white text-brand-700 hover:bg-white/90 transition-colors"
              >
                Get Started
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                className="px-6 py-3 rounded-xl text-sm font-semibold border border-white/30 text-white hover:bg-white/10 transition-colors"
              >
                See pricing
              </Link>
            </div>
            <p className="mt-5 text-white/50 text-xs">Free to start on Self-Serve — no cost until a ticket sells.</p>
          </div>
        </div>
      </section>

      {/* Footer — brand + two real link columns, nothing invented (no blog, no
          "company" page). */}
      <footer className="text-white" style={{ background: "#170821" }}>
        <div className="max-w-5xl mx-auto px-6 py-14 grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <Logo tone="white" variant="full" height={16} />
            <p className="text-sm text-white/50 mt-4 max-w-xs leading-relaxed">
              Registration, ticketing, check-in, and a live event hub for any event — education fairs, job fairs, conferences, and more — never lose a lead.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Product</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/discover" className="text-white/70 hover:text-white">
                Discover Events
              </Link>
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
              <Link href="/contact" className="text-white/70 hover:text-white">
                Contact
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

function FaqAccordion({ homeFaqs }: { homeFaqs: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  return (
    <section className="max-w-3xl mx-auto px-6 py-20">
      <h2 className="font-display text-3xl text-slate-900 text-center mb-12">Questions, answered</h2>
      <div className="space-y-3">
        {homeFaqs.map(({ q, a }, i) => {
          const open = openIndex === i;
          return (
            <div key={q} className={`rounded-xl border overflow-hidden transition-colors ${open ? "border-brand-200 bg-brand-50" : "border-slate-200 bg-white"}`}>
              <button type="button" onClick={() => setOpenIndex(open ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                <span className="font-semibold text-slate-900 text-sm">{q}</span>
                <span
                  className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold transition-transform ${
                    open ? "bg-brand-600 text-white rotate-45" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  +
                </span>
              </button>
              <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <p className={`px-5 pb-4 text-sm text-slate-600 leading-relaxed transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>{a}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-center mt-8">
        <Link href="/pricing" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
          See all FAQs
          <ArrowRight size={14} />
        </Link>
      </div>
    </section>
  );
}
