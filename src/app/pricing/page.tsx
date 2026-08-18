"use client";

import Link from "next/link";
import { Globe2, Check, ArrowRight } from "lucide-react";

const INCLUDED = [
  "Unlimited staff and university rep accounts",
  "Unlimited leads collected",
  "Staff and rep access codes per event",
  "Live analytics — destinations, courses, IELTS readiness",
  "CSV export and email delivery, filtered any way you like",
  "Multi-destination, multi-day events",
];

const FAQS = [
  {
    q: "What counts as \"one event\"?",
    a: "A single fair — one entry on your dashboard, whatever destinations, dates, or duration it covers. A 3-day fair across 6 destinations is still one event, one $49.99 charge.",
  },
  {
    q: "Is there a subscription or monthly fee?",
    a: "No. There's nothing to pay until you create an event, and nothing recurring after that — you're only ever charged when you actually host a fair.",
  },
  {
    q: "What if I need to edit an event after paying?",
    a: "Editing dates, venue, destinations, or access codes on an existing event is free — the $49.99 only applies to creating a new one.",
  },
  {
    q: "Can I try it before paying?",
    a: "Signing up and exploring your dashboard is free. You're only charged when you create your first event.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Globe2 size={24} className="text-[#610064]" />
          <div>
            <p className="font-display text-lg leading-tight text-slate-900">UniLink</p>
            <p className="text-[11px] text-slate-500 leading-tight">Education Fairs</p>
          </div>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Sign in
          </Link>
          <Link href="/signup" className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: "#610064" }}>
            Get Started
          </Link>
        </nav>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-10 pb-6 text-center">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-[#610064] mb-3">Pricing</p>
        <h1 className="font-display text-4xl text-slate-900 mb-3">One price. Every fair.</h1>
        <p className="text-slate-500 max-w-xl mx-auto">
          No subscription, no per-seat charges, no tiers to pick between. You pay once, when you create an event —
          nothing before, nothing after.
        </p>
      </section>

      <section className="max-w-md mx-auto px-6 py-10">
        <div className="relative rounded-3xl p-8 text-white text-center overflow-hidden" style={{ background: "linear-gradient(145deg, #1a0533 0%, #610064 100%)" }}>
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)",
              backgroundSize: "26px 26px",
            }}
          />
          <div className="relative">
            <p className="text-sm text-fuchsia-200 font-medium mb-1">Per event</p>
            <p className="font-display text-6xl leading-none">
              $49<span className="text-3xl align-top">.99</span>
            </p>
            <p className="text-white/60 text-sm mt-3">USD · charged once, when you create the event</p>
            <Link
              href="/signup"
              className="mt-6 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold bg-white text-[#610064] hover:bg-white/90 transition-colors"
            >
              Get Started
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          {INCLUDED.map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
              <Check size={16} className="text-[#610064] shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-16">
        <h2 className="font-display text-2xl text-slate-900 mb-6 text-center">Questions</h2>
        <div className="space-y-5">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900 text-sm mb-1.5">{q}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

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
