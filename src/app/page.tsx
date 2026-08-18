"use client";

import Link from "next/link";
import { Globe2, Users2, KeyRound, BarChart3, ShieldCheck, Mail, ArrowRight } from "lucide-react";

const STEPS = [
  {
    number: "01",
    title: "Set up your fair",
    body: "Create your event — dates, venue, participating destinations — and generate a unique staff and rep access code for it.",
  },
  {
    number: "02",
    title: "Share the check-in link",
    body: "Send your team the one link for your organization. Staff and university reps check in with the access code — no admin login needed.",
  },
  {
    number: "03",
    title: "Collect, view, export",
    body: "Staff capture leads on any device. You and university reps see them live, filter by destination or school, and export or email a CSV anytime.",
  },
];

const FEATURES = [
  { icon: Users2, title: "Role-based access", body: "Admins run the show, staff capture leads locked to their destination and school, reps see only their own university's leads." },
  { icon: KeyRound, title: "Access codes per event", body: "Gate staff and rep check-in behind a code you set — or leave it open for smaller, trusted teams." },
  { icon: BarChart3, title: "Live analytics", body: "Destination breakdowns, course interest, IELTS readiness, and per-event lead counts, updated as your team collects." },
  { icon: Mail, title: "Export & email leads", body: "Download a CSV or email it straight from the app, filtered by event, destination, or university." },
  { icon: ShieldCheck, title: "Your data, isolated", body: "Every organization's events, leads, and staff are kept fully separate — nothing is ever shared across accounts." },
  { icon: Globe2, title: "Built for education fairs", body: "Multi-destination fairs, multi-day events, and delegates from as many countries as you're hosting." },
];

export default function MarketingHomePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Nav */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Globe2 size={24} className="text-[#610064]" />
            <div>
              <p className="font-display text-lg leading-tight text-slate-900">UniLink</p>
              <p className="text-[11px] text-slate-500 leading-tight">Education Fairs</p>
            </div>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 hidden sm:block">
              Pricing
            </Link>
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#610064" }}
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: "linear-gradient(145deg, #1a0533 0%, #610064 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 pt-16 pb-24 text-center">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-fuchsia-300 mb-4">
            For international education fair coordinators
          </p>
          <h1 className="font-display text-4xl sm:text-5xl leading-tight max-w-3xl mx-auto">
            Run your education fairs.
            <br />
            <em>Capture every lead.</em>
          </h1>
          <p className="mt-5 text-white/70 text-base sm:text-lg max-w-xl mx-auto">
            One platform for your whole team — set up an event, hand your staff and university reps a single
            check-in link, and watch qualified leads roll in from every destination you host.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-white text-[#610064] hover:bg-white/90 transition-colors"
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
          <p className="mt-4 text-white/50 text-xs">$49.99 per event · no subscription · pay only when you host a fair</p>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[#610064] mb-2">How it works</p>
          <h2 className="font-display text-3xl text-slate-900">From setup to signed-up students</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.number} className="bg-white rounded-2xl border border-slate-200 p-6">
              <span className="font-display text-3xl text-[#610064]/30">{s.number}</span>
              <h3 className="font-display text-lg text-slate-900 mt-3 mb-2">{s.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[#610064] mb-2">Everything included</p>
            <h2 className="font-display text-3xl text-slate-900">Built for the way fairs actually run</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "#f5edf6" }}>
                  <Icon size={18} style={{ color: "#610064" }} />
                </div>
                <h3 className="font-semibold text-slate-900 text-sm mb-1.5">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="font-display text-3xl text-slate-900 mb-3">Simple, honest pricing</h2>
        <p className="text-slate-500 mb-8">No subscription, no per-seat fees. You pay $49.99 the moment you create an event — that&apos;s it.</p>
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: "#610064" }}
        >
          View pricing
          <ArrowRight size={16} />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Globe2 size={14} />
            <span>UniLink — Education Fairs Management</span>
          </div>
          <p>© 2026 UniLink. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
