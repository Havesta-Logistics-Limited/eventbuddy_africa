"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutTemplate, Users2, KeyRound, BarChart3, ShieldCheck, Mail, ArrowRight, Settings2, Link2, Download, Presentation } from "lucide-react";
import { Logo } from "@/components/logo";
import { EVENT_PRICE_USD, fetchCurrentEventPrice, formatUSD } from "@/lib/billing";

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
  const FEATURES = getFeatures(priceLabel);

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
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
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

          {/* Offsets the hero from a pure centered-text block — a live-feeling
              snapshot of what the "captured lead" on the other end looks like. */}
          <div className="hidden lg:block relative animate-idle-float hover-bounce">
            <div className="absolute -inset-6 rounded-[2rem] bg-white/5 animate-hero-card-settle-back" />
            <div className="relative bg-white rounded-2xl shadow-2xl p-5 text-slate-900 animate-hero-card-settle-front">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lead captured</p>
              </div>
              <p className="font-semibold text-slate-900">Amaka Obi</p>
              <p className="text-sm text-slate-500">amaka.obi@example.com</p>
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
                <span className="text-slate-500">MSc · Computer Science</span>
                <span className="text-brand-600 font-medium">🇨🇦 Canada</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works — steps live inside their own panel (not loose on the
          page background), with an icon per action plus a small order badge,
          instead of a bare numbered circle. */}
      <section className="max-w-5xl mx-auto px-6 py-20">
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

      {/* Pricing teaser */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div
          className="relative overflow-hidden rounded-3xl px-6 py-16 text-center text-white"
          style={{ background: "radial-gradient(ellipse 80% 100% at 80% 0%, #9b1a9f 0%, var(--color-brand-600) 45%, #2c0031 100%)" }}
        >
          <h2 className="font-display text-3xl mb-3">Simple, honest pricing</h2>
          <p className="text-white/70 mb-8 max-w-md mx-auto">
            No subscription, no per-seat fees. {priceLabel} per physical event — virtual events are always free.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-white text-brand-600 hover:bg-white/90 transition-colors"
          >
            View pricing
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Logo variant="full" height={28} />
            <span>— Never Lose a Lead</span>
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
