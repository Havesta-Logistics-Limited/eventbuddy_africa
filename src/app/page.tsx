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
  Download,
  Presentation,
  Lock,
  CreditCard,
  Wallet,
  GraduationCap,
  Briefcase,
  Store,
  Sparkles,
  Calendar,
  MapPin,
  Check,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { EVENT_PRICE_USD, fetchCurrentEventPrice, formatUSD } from "@/lib/billing";
import { faqs } from "@/app/pricing/faqs";

const STEP_ICONS = [Settings2, Link2, Download];

const STEPS = [
  {
    number: "01",
    title: "Set up your event",
    body: "Pick a template — education fair, job fair, conference, or build your own form — set the dates and venue, and generate a unique staff access code for it.",
  },
  {
    number: "02",
    title: "Share the check-in link",
    body: "Send your team the one link for your organization. Staff check in with the access code — no admin login needed. Running an education fair? University reps get their own check-in link too.",
  },
  {
    number: "03",
    title: "Collect, view, export",
    body: "Staff capture leads on any device, with exactly the fields your event needs. You see them live, filter by event, and export or email a CSV anytime.",
  },
];

function getFeatures(priceLabel: string) {
  return [
    { icon: Users2, title: "Role-based access", body: "Admins run the show, staff capture leads for their event, and — for education fairs — reps see only their own university's leads." },
    { icon: KeyRound, title: "Access codes per event", body: "Gate staff and rep check-in behind a code you set — or leave it open for smaller, trusted teams." },
    { icon: BarChart3, title: "Live analytics", body: "Destination and course breakdowns for education fairs, custom-question breakdowns for everything else, plus per-event lead counts — updated as your team collects." },
    { icon: Mail, title: "Export & email leads", body: "Download a CSV or email it straight from the app, filtered by event, destination, or university." },
    { icon: ShieldCheck, title: "Your data, isolated", body: "Every organization's events, leads, and staff are kept fully separate — nothing is ever shared across accounts." },
    { icon: LayoutTemplate, title: "Any kind of event", body: "Start from a template — education fair, job fair, conference, trade show — or build a custom lead-capture form from scratch." },
    { icon: Presentation, title: "Virtual events are free", body: `Only physical, in-person events cost ${priceLabel}. Host as many virtual events as you like, always at no charge.` },
  ];
}

// Every category here is a real template a new event can be created from (see
// src/lib/event-templates.ts) — not invented marketing segments — so a visitor sees
// exactly the option they'll pick during signup, not a promise the product doesn't keep.
const USE_CASES = [
  { icon: GraduationCap, label: "Education Fairs" },
  { icon: Briefcase, label: "Job Fairs" },
  { icon: Presentation, label: "Conferences" },
  { icon: Store, label: "Trade Shows" },
  { icon: Sparkles, label: "Custom Events" },
];

const TRUST_SIGNALS = [
  { icon: Lock, text: "Your data, fully isolated per organization" },
  { icon: CreditCard, text: "Secure checkout via Paystack" },
  { icon: Wallet, text: "No subscription — pay only for physical events" },
];

const HOME_FAQ_QUESTIONS = ["Is there a subscription or monthly fee?", "Do I pay for virtual events?", "Can I try it before paying?", "What counts as \"one event\"?"];

export default function MarketingHomePage() {
  // Every visible price on this page mirrors platform_settings.event_price_usd (the
  // same value the platform admin's Billing tab edits and Paystack actually charges)
  // rather than the EVENT_PRICE_USD fallback constant, so it can never drift out of
  // sync with a live price change.
  const [eventPrice, setEventPrice] = useState(EVENT_PRICE_USD);
  useEffect(() => {
    fetchCurrentEventPrice().then(setEventPrice);
  }, []);
  const priceLabel = formatUSD(eventPrice);
  const [priceWhole, priceCents] = priceLabel.slice(1).split(".");
  const FEATURES = getFeatures(priceLabel);
  const homeFaqs = faqs(priceLabel).filter((f) => HOME_FAQ_QUESTIONS.includes(f.q));

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav — sticky + glassmorphic: translucent bg with backdrop-blur so content
          scrolling underneath stays legibly frosted rather than a flat overlay. */}
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="sm:hidden">
            <Logo height={32} />
          </span>
          <span className="hidden sm:block">
            <Logo height={45} />
          </span>
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link href="/pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
              Pricing
            </Link>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link href="/signup" className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden text-white" style={{ background: "#1a0533" }}>
        {/* Real photo (a tech-summit/exhibition-hall crowd) behind the gradient —
            source: images.unsplash.com/photo-1531058020387, Unsplash license. */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(https://images.unsplash.com/photo-1531058020387-3be344556be6?w=1600&h=900&fit=crop&q=75&auto=format)" }}
        />
        {/* Off-center radial glow, not a uniform diagonal fade — keeps the brand
            purple but avoids the flat linear-gradient-hero AI fingerprint. Semi
            transparent (not opaque, not fading to fully transparent) so the photo
            reads as a tinted backdrop rather than either hidden or unfiltered. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 20% -10%, rgba(155,26,159,0.78) 0%, rgba(97,0,100,0.85) 38%, rgba(44,0,49,0.9) 68%, rgba(26,5,51,0.94) 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative max-w-6xl mx-auto px-6 pt-16 sm:pt-20 pb-16 lg:pb-28 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fuchsia-300 mb-4">
              For teams running any kind of event
            </p>
            <h1 className="font-display text-4xl sm:text-5xl leading-tight">
              Run any event.
              <br />
              <em>Capture every lead.</em>
            </h1>
            <p className="mt-5 text-white/70 text-base sm:text-lg max-w-lg">
              One platform for your whole team — set up an event, hand your staff a single check-in link, and watch
              qualified leads roll in. An education fair, a job fair, a conference, or something entirely your own.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-white text-brand-600 hover:bg-white/90 transition-colors"
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
            <p className="mt-4 text-white/50 text-xs">{priceLabel} per physical event · virtual events are free · no subscription</p>
          </div>

          {/* Realistic dashboard mockup — the actual stat-tile and event-card visual
              language from the real app (see src/app/dashboard/page.tsx), not a
              generic illustration, so what a visitor sees here is what they get after
              signing up. Always rendered (not lg:hidden like before) so mobile
              visitors — most of them — get product proof too; it just stacks below
              the text instead of sitting beside it. */}
          <div className="relative animate-idle-float hover-bounce">
            <div className="absolute -inset-6 rounded-[2rem] bg-white/5 animate-hero-card-settle-back hidden lg:block" />
            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden text-slate-900 animate-hero-card-settle-front">
              <div className="flex items-center gap-1.5 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-300" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-300" />
                <span className="ml-2 text-xs text-slate-400 font-medium">eventbuddy dashboard</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "Total Registration", value: "13,000" },
                    { label: "Total Attendees", value: "7,000" },
                    { label: "Total Leads", value: "4,000" },
                  ].map((s) => (
                    <div key={s.label} className="rounded-lg bg-slate-50 p-3">
                      <p className="text-[11px] text-slate-500 mb-0.5 truncate">{s.label}</p>
                      <p className="text-lg font-bold text-slate-900 tabular-nums">{s.value}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-sm text-slate-900 truncate mr-2">Global Education Fair</p>
                    <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Live</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      22 Aug 2026
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin size={11} />
                      Abuja
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 p-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <p className="text-xs text-emerald-800">
                    <span className="font-semibold">Amaka Obi</span> just checked in — MSc Computer Science
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust strip — thin, honest, no invented stats. A brand-new product has no
          "trusted by 500 teams" claim to make truthfully, so this leans on the three
          things that are true today: real payment infrastructure, real data
          isolation, and a pricing model with no lock-in risk. */}
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {TRUST_SIGNALS.map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-2.5 text-sm text-slate-600">
              <Icon size={16} className="text-brand-600 shrink-0" />
              {text}
            </div>
          ))}
        </div>
      </section>

      {/* Built for — lets a visitor self-identify against a real template choice
          within a second, instead of only discovering "education fair" or "job fair"
          buried inside a paragraph. */}
      <section className="max-w-5xl mx-auto px-6 pt-14 pb-4">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-slate-400 mb-5">Built for</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {USE_CASES.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 bg-white text-sm font-medium text-slate-700">
              <Icon size={15} className="text-brand-600" />
              {label}
            </div>
          ))}
        </div>
      </section>

      {/* How it works — steps live inside their own panel (not loose on the
          page background), with an icon per action plus a small order badge,
          instead of a bare numbered circle. */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-10 max-w-md">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-600 mb-2">How it works</p>
          <h2 className="font-display text-3xl text-slate-900">From setup to captured leads</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map((s, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <div
                key={s.number}
                className="hover-bounce relative rounded-2xl p-6 text-white overflow-hidden shadow-sm hover:shadow-lg transition-shadow"
                style={{ background: "radial-gradient(ellipse 120% 100% at 15% -10%, var(--color-brand-500) 0%, var(--color-brand-600) 45%, #2c0031 100%)" }}
              >
                <div
                  className="absolute inset-0 opacity-[0.07]"
                  style={{
                    backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.5) 1px, transparent 1px)",
                    backgroundSize: "22px 22px",
                  }}
                />
                <div className="relative w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center mb-5">
                  <Icon size={20} className="text-white" />
                  <span className="absolute -top-2 -right-2 flex items-center justify-center w-5 h-5 rounded-full bg-white text-brand-600 text-[10px] font-semibold tabular-nums">
                    {i + 1}
                  </span>
                </div>
                <h3 className="relative font-display text-lg text-white mb-2">{s.title}</h3>
                <p className="relative text-sm text-white/70 leading-relaxed">{s.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features — one featured tile plus a lighter supporting list, rather
          than six identical cards in a uniform grid. */}
      <section className="bg-brand-50 border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="mb-12 max-w-md">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-600 mb-2">Everything included</p>
            <h2 className="font-display text-3xl text-slate-900">Built for the way events actually run</h2>
          </div>
          <div className="space-y-8">
            {/* Featured, full-width banner — a deliberately different shape
                than the "How it works" panel above (icon-beside-text, not
                icon-above-text in a grid), so the two sections don't read
                as the same component reused. */}
            <div className="rounded-2xl bg-white border border-slate-200 p-8 flex flex-col sm:flex-row gap-6 sm:items-start">
              <div className="w-11 h-11 rounded-xl bg-brand-100 flex items-center justify-center shrink-0 hover-bounce-sm">
                {(() => {
                  const Icon = FEATURES[0].icon;
                  return <Icon size={20} className="text-brand-600" />;
                })()}
              </div>
              <div className="flex-1">
                <h3 className="font-display text-xl text-slate-900 mb-2">{FEATURES[0].title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed max-w-xl mb-5">{FEATURES[0].body}</p>
                <div className="flex flex-wrap gap-x-8 gap-y-2">
                  {[
                    { role: "Org Admin", tag: "Runs every event" },
                    { role: "Staff", tag: "Captures leads on-site" },
                    { role: "Rep", tag: "Sees only their own leads" },
                  ].map(({ role, tag }) => (
                    <div key={role} className="flex items-center gap-2 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-600 shrink-0" />
                      <span className="font-medium text-slate-800">{role}</span>
                      <span className="text-slate-500">— {tag}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Editorial list, icon beside each item — no card chrome. */}
            <div className="grid sm:grid-cols-2 gap-x-10 gap-y-8">
              {FEATURES.slice(1).map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <div className="w-9 h-9 rounded-lg bg-brand-100 flex items-center justify-center shrink-0 hover-bounce-sm">
                    <Icon size={16} className="text-brand-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why eventbuddy — an honest mission statement in place of testimonials,
          made visual instead of a lone paragraph so it carries the same weight as
          every other section on the page. eventbuddy has no real customers to quote
          yet, so this makes a genuine, verifiable claim (the actual pricing model
          and how multi-staff capture actually behaves) rather than a fabricated
          quote attributed to a name or company that doesn't exist. */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-600 mb-2">Why eventbuddy</p>
            <h2 className="font-display text-3xl text-slate-900 mb-4 leading-snug">
              A shared spreadsheet falls apart the moment more than one person is capturing leads at once.
            </h2>
            <p className="text-slate-500 leading-relaxed max-w-md">
              eventbuddy gives your team real staff accounts, access codes, and live analytics — no subscription.
              You only pay when you host a physical event. Nothing recurring. Nothing extra.
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
            <div className="pb-5 mb-5 border-b border-slate-100">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Spreadsheet &amp; Google Form</p>
              <div className="space-y-2.5">
                {[
                  "Duplicate entries from staff editing the same sheet",
                  "No live view of how the day is going",
                  "Manually merging exports at the end of the day",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-slate-400">
                    <X size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 mb-3">eventbuddy</p>
              <div className="space-y-2.5">
                {[
                  "One source of truth — every staff device stays in sync",
                  "Live analytics update as leads come in",
                  "Export or email a CSV in one click, any time",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <Check size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing — the same two-card shape /pricing uses, so a visitor who scrolls
          this far already understands the exact price without a click-through. */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div
          className="relative overflow-hidden rounded-3xl px-6 sm:px-10 py-14 text-white"
          style={{ background: "radial-gradient(ellipse 80% 100% at 80% 0%, #9b1a9f 0%, var(--color-brand-600) 45%, #2c0031 100%)" }}
        >
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl mb-3">Simple, honest pricing</h2>
            <p className="text-white/70 max-w-md mx-auto">No subscription, no per-seat fees, no tiers to pick between.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            <div className="relative rounded-2xl p-6 text-center overflow-hidden bg-white/10 border border-white/15">
              <p className="text-xs text-fuchsia-200 font-medium mb-1 flex items-center justify-center gap-1.5">
                <MapPin size={12} />
                Physical event
              </p>
              <p className="font-display text-4xl leading-none tabular-nums">
                ${priceWhole}
                <span className="text-xl align-top">.{priceCents}</span>
              </p>
              <p className="text-white/50 text-xs mt-2">charged once, when you create it</p>
            </div>
            <div className="relative rounded-2xl p-6 text-center overflow-hidden bg-white text-slate-900">
              <p className="text-xs text-brand-600 font-medium mb-1 flex items-center justify-center gap-1.5">
                <Presentation size={12} />
                Virtual event
              </p>
              <p className="font-display text-4xl leading-none">Free</p>
              <p className="text-slate-500 text-xs mt-2">always — host as many as you like</p>
            </div>
          </div>
          <div className="mt-8 text-center">
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

      {/* FAQ — a short, honest excerpt of the real FAQ content already on /pricing
          (same faqs() source, not new copy), so answering the top objections doesn't
          require a click-through, without duplicating the full list here. */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="mb-10 max-w-md">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-600 mb-2">FAQ</p>
          <h2 className="font-display text-3xl text-slate-900">Quick answers</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-7">
          {homeFaqs.map(({ q, a }) => (
            <div key={q} className="pt-5 border-t border-slate-200">
              <h3 className="font-semibold text-slate-900 text-sm mb-1.5">{q}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
        <Link href="/pricing" className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
          See all FAQs
          <ArrowRight size={14} />
        </Link>
      </section>

      {/* Footer — brand + two real link columns, nothing invented (no blog, no
          "company" page, no fake contact address that doesn't exist yet). Dark
          background bookends the dark hero at the top of the page instead of
          fading into the same white as every other section. */}
      <footer className="text-white" style={{ background: "#1a0533" }}>
        <div className="max-w-5xl mx-auto px-6 py-14 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <Logo tone="white" variant="full" height={28} />
            <p className="text-sm text-white/50 mt-4 max-w-xs leading-relaxed">
              Event lead capture and check-in software for education fairs, job fairs, and conferences — never lose a lead.
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
