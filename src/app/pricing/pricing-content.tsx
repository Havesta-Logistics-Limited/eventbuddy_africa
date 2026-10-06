"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Sparkles, Users2, Building2 } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatTicketFee } from "@/lib/billing";
import { faqs } from "./faqs";

const SELF_SERVE_INCLUDED = [
  "Virtual and in-person events, from templates or your own custom form",
  "Free & paid ticketing with QR codes, powered by Paystack",
  "Ticket revenue splits straight to your own bank account, automatically",
  "Unlimited staff and university-rep accounts, unlimited leads",
  "Access codes per event for staff and rep check-in",
  "Live analytics, tailored to your event's own fields",
  "CSV export and email delivery, filtered any way you like",
];

const FULL_SERVICE_INCLUDED = [
  "eventbuddy's own staff running check-in, in person",
  "Check-in tablets and printers, set up before doors open",
  "QR badges printed for every attendee on arrival",
  "Registration, ticketing, and check-in handled end-to-end",
];

const ENTERPRISE_INCLUDED = [
  "Everything in Full-Service, across every event you run",
  "Multiple events, venues, or teams under one program",
  "A dedicated point of contact and custom terms",
  "Priority support on event day",
];

export default function PricingContent() {
  const [fee, setFee] = useState(DEFAULT_TICKET_FEE);
  useEffect(() => {
    fetchCurrentTicketFee().then(setFee);
  }, []);
  const feeLabel = formatTicketFee(fee);
  const FAQS = faqs(feeLabel);

  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />

      <section className="eb-page-hero max-w-3xl mx-auto px-6 pt-14 pb-8 text-center">
        <h1 className="font-display text-4xl text-fg mb-3">
          Start free.
          <br />
          Bring in our team when you need to.
        </h1>
        <p className="text-muted max-w-xl mx-auto">
          Self-Serve costs nothing until a ticket actually sells. Full-Service and Enterprise put eventbuddy&apos;s own
          team on the ground for events that need more hands than yours.
        </p>
      </section>

      <section className="max-w-4xl mx-auto px-6 pb-10">
        {/* Self-Serve — the free, do-it-yourself tier, given the featured gradient
            treatment since it's the product most visitors will actually start on. */}
        <div
          className="relative rounded-3xl p-8 sm:p-10 text-white overflow-hidden mb-6"
          style={{ background: "radial-gradient(ellipse 150% 130% at 20% -10%, var(--color-brand-500) 0%, var(--color-brand-600) 60%, #170821 140%)" }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{ backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "26px 26px" }}
          />
          <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-8 sm:items-end">
            <div>
              <p className="text-sm text-white/70 font-medium mb-2 flex items-center gap-1.5">
                <Sparkles size={14} />
                Self-Serve
              </p>
              <p className="font-display text-5xl leading-none mb-2">Free to start</p>
              <p className="text-white/70 text-sm">
                Only pay <span className="font-semibold text-white">{feeLabel}</span> per ticket that actually sells — free
                tickets and free events cost nothing.
              </p>
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold bg-surface text-brand-500 hover:bg-surface/90 transition-colors shrink-0"
            >
              Get Started
              <ArrowRight size={16} />
            </Link>
          </div>
          <div className="relative mt-8 pt-8 border-t border-white/15 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            {SELF_SERVE_INCLUDED.map((item) => (
              <div key={item} className="flex items-start gap-2.5 text-sm text-white/85">
                <Check size={16} className="text-white shrink-0 mt-0.5" />
                {item}
              </div>
            ))}
          </div>
        </div>

        {/* Full-Service and Enterprise — both quote-based and structurally similar
            (on-site team, no self-serve price to show), so equal-weight cards here
            are the honest shape, not a lazy default. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-3xl border border-line bg-surface p-8 flex flex-col">
            <p className="text-sm text-brand-500 font-medium mb-2 flex items-center gap-1.5">
              <Users2 size={14} />
              Full-Service
            </p>
            <p className="font-display text-3xl text-fg mb-1">Quote-based</p>
            <p className="text-muted text-sm mb-6">eventbuddy&apos;s own team runs your event on-site, on the day.</p>
            <div className="space-y-2.5 mb-6">
              {FULL_SERVICE_INCLUDED.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-sm text-fg-2">
                  <Check size={16} className="text-brand-500 shrink-0 mt-0.5" />
                  {item}
                </div>
              ))}
            </div>
            <Link
              href="/managed-events"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors mt-auto"
            >
              Request a quote
              <ArrowRight size={16} />
            </Link>
          </div>

          <div className="rounded-3xl border border-line bg-surface p-8 flex flex-col">
            <p className="text-sm text-brand-500 font-medium mb-2 flex items-center gap-1.5">
              <Building2 size={14} />
              Enterprise
            </p>
            <p className="font-display text-3xl text-fg mb-1">Custom</p>
            <p className="text-muted text-sm mb-6">Full-Service across every event in your program.</p>
            <div className="space-y-2.5 mb-6">
              {ENTERPRISE_INCLUDED.map((item) => (
                <div key={item} className="flex items-start gap-2.5 text-sm text-fg-2">
                  <Check size={16} className="text-brand-500 shrink-0 mt-0.5" />
                  {item}
                </div>
              ))}
            </div>
            <Link
              href="/managed-events"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 transition-colors mt-auto"
            >
              Contact sales
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display text-3xl text-fg mb-10">Questions, answered</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-7">
          {FAQS.map(({ q, a }) => (
            <div key={q} className="pt-5 border-t border-line">
              <h3 className="font-semibold text-fg text-sm mb-1.5">{q}</h3>
              <p className="text-sm text-muted leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
