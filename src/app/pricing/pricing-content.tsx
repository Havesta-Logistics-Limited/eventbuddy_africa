"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Plus, Sparkles, Users2, Building2 } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-hero";
import { OrbsObject } from "@/components/landing/event-objects";
import { LandingFooter } from "@/components/landing/landing-close";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatTicketFee } from "@/lib/billing";
import { faqs } from "./faqs";

const SELF_SERVE_INCLUDED = [
  "Virtual and in-person events, from templates or your own custom form",
  "Free & paid ticketing with QR codes, powered by Paystack",
  "Request payouts to your bank right from your dashboard",
  "Unlimited staff and rep accounts, unlimited leads",
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

// hand-placed so server and client render identically
const HORIZON_STARS = [[8, 12, 0], [17, 30, 1.4], [26, 8, 2.2], [34, 22, 0.6], [43, 5, 3.1], [52, 18, 1.1], [61, 9, 2.6], [70, 26, 0.3], [79, 11, 1.9], [88, 24, 2.9], [94, 7, 0.9], [12, 40, 3.4], [58, 34, 1.6], [83, 38, 2.4]];

export default function PricingContent() {
  const [fee, setFee] = useState(DEFAULT_TICKET_FEE);
  useEffect(() => {
    fetchCurrentTicketFee().then(setFee);
  }, []);
  const feeLabel = formatTicketFee(fee);
  const FAQS = faqs(feeLabel);
  const [openFaq, setOpenFaq] = useState(-1);

  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />

      <section className="eb-page-hero mx-auto max-w-3xl px-6 pb-12 text-center">
        <div className="mx-auto mb-7 w-28 lp-bob" style={{ ["--bob" as string]: "6.4s" }} aria-hidden="true">
          <OrbsObject />
        </div>
        <h1 className="font-display text-fg">
          Start free.
          <span className="block text-subtle">Bring in our team when you need to.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-fg-3">
          Self-Serve costs nothing until a ticket actually sells. Full-Service and Enterprise put eventbuddy&apos;s own
          team on the ground for events that need more hands than yours.
        </p>
      </section>

      {/* Self-Serve: a framed panel with light rising from its top edge, the way the
          landing page's product window rises out of the glow. */}
      <section className="mx-auto max-w-5xl px-5 pb-10 sm:px-6">
        <div className="eb-horizon">
          <div className="eb-horizon-stars" aria-hidden="true">
            {HORIZON_STARS.map(([x, y, d], k) => (
              <span key={k} className="lp-star" style={{ left: `${x}%`, top: `${y}%`, width: k % 4 === 0 ? 2.5 : 1.5, height: k % 4 === 0 ? 2.5 : 1.5, animationDelay: `${d}s`, animationDuration: `${3 + (k % 4)}s` }} />
            ))}
          </div>
          <div className="eb-horizon-inner">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-brand-500">
                  <Sparkles size={14} aria-hidden="true" />
                  Self-Serve
                </p>
                <p className="font-display text-5xl leading-none text-fg sm:text-6xl">Free to start</p>
                <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-fg-3">
                  Only pay <span className="font-semibold text-fg">{feeLabel}</span> per ticket that actually sells. Free
                  tickets and free events cost nothing.
                </p>
              </div>
              <Link href="/signup" className="eb-btn eb-btn--primary shrink-0 px-6">
                Get Started
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <ul className="mt-9 grid grid-cols-1 gap-x-10 gap-y-3.5 border-t border-line pt-8 sm:grid-cols-2">
              {SELF_SERVE_INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-3 text-[15px] leading-snug text-fg-2">
                  <Check size={17} className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Full-Service and Enterprise: both quote-based, equal weight. */}
        <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {[
            { icon: Users2, tier: "Full-Service", title: "Quote-based", sub: "eventbuddy\u2019s own team runs your event on-site, on the day.", items: FULL_SERVICE_INCLUDED, cta: "Request a quote" },
            { icon: Building2, tier: "Enterprise", title: "Custom", sub: "Full-Service across every event in your program.", items: ENTERPRISE_INCLUDED, cta: "Contact sales" },
          ].map(({ icon: Icon, tier, title, sub, items, cta }) => (
            <div key={tier} className="eb-tier">
              <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-brand-500">
                <Icon size={14} aria-hidden="true" />
                {tier}
              </p>
              <p className="font-display text-4xl text-fg">{title}</p>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{sub}</p>
              <ul className="mb-8 mt-7 space-y-3">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-[15px] leading-snug text-fg-2">
                    <Check size={17} className="mt-0.5 shrink-0 text-brand-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/managed-events" className="eb-btn eb-btn--primary mt-auto w-full">
                {cta}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-6 py-16">
        <h2 className="font-display text-3xl text-fg">Questions, answered</h2>
        {/* Collapsed by default so the page stays short; same accordion as the
            landing FAQ. Every answer stays in the DOM (and in the FAQPage data). */}
        <div className="lp-accordion">
          {FAQS.map(({ q, a }, i) => {
            const isOpen = i === openFaq;
            return (
              <div key={q} className="lp-acc-item" data-open={isOpen || undefined}>
                <h3>
                  <button
                    type="button"
                    id={`pr-faq-${i}`}
                    aria-expanded={isOpen}
                    aria-controls={`pr-faq-panel-${i}`}
                    onClick={() => setOpenFaq(isOpen ? -1 : i)}
                  >
                    {q}
                    <Plus size={18} aria-hidden="true" />
                  </button>
                </h3>
                <div id={`pr-faq-panel-${i}`} role="region" aria-labelledby={`pr-faq-${i}`} className="lp-acc-body">
                  <div>
                    <p>{a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
