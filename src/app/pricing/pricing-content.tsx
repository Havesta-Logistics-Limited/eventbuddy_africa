"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, MapPin, Presentation } from "lucide-react";
import { Logo } from "@/components/logo";
import { EVENT_PRICE_USD, fetchCurrentEventPrice, formatUSD } from "@/lib/billing";
import { faqs } from "./faqs";

const INCLUDED = [
  "Templates for education fairs, job fairs, conferences — or build your own form",
  "Unlimited staff accounts (plus university reps for education fairs)",
  "Unlimited leads collected",
  "Staff and rep access codes per event",
  "Live analytics, tailored to your event's own fields",
  "CSV export and email delivery, filtered any way you like",
  "Multi-destination, multi-day education fairs",
];

export default function PricingContent() {
  const [eventPrice, setEventPrice] = useState(EVENT_PRICE_USD);
  useEffect(() => {
    fetchCurrentEventPrice().then(setEventPrice);
  }, []);
  const priceLabel = formatUSD(eventPrice);
  const [priceWhole, priceCents] = priceLabel.slice(1).split(".");
  const FAQS = faqs(priceLabel);
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="sm:hidden">
            <Logo height={32} />
          </span>
          <span className="hidden sm:block">
            <Logo height={45} />
          </span>
          <nav className="flex items-center gap-3 sm:gap-6">
            <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
            <Link href="/signup" className="px-3 sm:px-4 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 transition-colors">
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-10 pb-6 text-center">
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-600 mb-3">Pricing</p>
        <h1 className="font-display text-4xl text-slate-900 mb-3">Pay for physical. Virtual is free.</h1>
        <p className="text-slate-500 max-w-xl mx-auto">
          No subscription, no per-seat charges, no tiers to pick between. In-person events are {priceLabel}, charged
          once when you create them. Virtual events don&apos;t cost a thing — ever.
        </p>
      </section>

      <section className="max-w-2xl mx-auto px-6 py-10">
        <div className="grid sm:grid-cols-2 gap-4">
          <div
            className="relative rounded-3xl p-8 text-white text-center overflow-hidden"
            style={{ background: "radial-gradient(ellipse 90% 80% at 25% -10%, var(--color-brand-500) 0%, var(--color-brand-600) 40%, #2c0031 100%)" }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{
                backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)",
                backgroundSize: "26px 26px",
              }}
            />
            <div className="relative">
              <p className="text-sm text-fuchsia-200 font-medium mb-1 flex items-center justify-center gap-1.5">
                <MapPin size={13} />
                Physical event
              </p>
              <p className="font-display text-5xl leading-none tabular-nums">
                ${priceWhole}
                <span className="text-2xl align-top">.{priceCents}</span>
              </p>
              <p className="text-white/60 text-xs mt-3">USD · charged once, when you create the event</p>
            </div>
          </div>

          <div className="relative rounded-3xl p-8 text-center overflow-hidden border-2 border-brand-600 bg-white">
            <p className="text-sm text-brand-600 font-medium mb-1 flex items-center justify-center gap-1.5">
              <Presentation size={13} />
              Virtual event
            </p>
            <p className="font-display text-5xl leading-none text-slate-900">Free</p>
            <p className="text-slate-500 text-xs mt-3">Always — host as many as you like</p>
          </div>
        </div>

        <Link
          href="/signup"
          className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
        >
          Get Started
          <ArrowRight size={16} />
        </Link>

        <div className="mt-8 space-y-3">
          {INCLUDED.map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-sm text-slate-700">
              <Check size={16} className="text-brand-600 shrink-0 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <p className="font-mono text-xs font-semibold uppercase tracking-widest text-brand-600 mb-2">FAQ</p>
          <h2 className="font-display text-3xl text-slate-900">Questions, answered</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-7">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="pt-5 border-t border-slate-200">
              <h3 className="font-semibold text-slate-900 text-sm mb-1.5">{q}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{a}</p>
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
