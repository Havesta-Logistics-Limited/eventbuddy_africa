"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, Plus, Sparkles, Users2, Building2 } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-hero";
import { OrbsObject } from "@/components/landing/event-objects";
import { LandingFooter } from "@/components/landing/landing-close";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatNaira, formatTicketFee, planTicketFee } from "@/lib/billing";
import { getOrganizerPlans } from "@/lib/store";
import type { OrganizerPlan } from "@/lib/types";
import { faqs } from "./faqs";

// Shown before the live plans load (and if they can't): the seeded values from
// migration 0104, so the cards never jump or render empty.
const FALLBACK_PLANS: OrganizerPlan[] = [
  { id: "launch", name: "Launch", priceMonthlyNaira: 0, feePercentage: null, feeFlatNaira: null, maxPromotersPerEvent: 5, purchasable: false },
  { id: "grow", name: "Grow", priceMonthlyNaira: 15000, feePercentage: 4, feeFlatNaira: 100, maxPromotersPerEvent: null, purchasable: false },
  { id: "scale", name: "Scale", priceMonthlyNaira: 45000, feePercentage: 3, feeFlatNaira: 100, maxPromotersPerEvent: null, purchasable: false },
];

const PLAN_BLURB: Record<string, string> = {
  launch: "Everything you need to sell tickets and run your event. Pay only when a ticket sells.",
  grow: "For organizers selling regularly: a lower fee on every ticket and unlimited promoters.",
  scale: "Our lowest ticket fee, for organizers with big or frequent events.",
};

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
  const [plans, setPlans] = useState<OrganizerPlan[]>(FALLBACK_PLANS);
  useEffect(() => {
    getOrganizerPlans()
      .then((p) => p.length && setPlans(p))
      .catch(() => {});
  }, []);

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
          Launch costs nothing until a ticket actually sells; Grow and Scale lower your fee as you sell more. Full-Service and
          Enterprise put eventbuddy&apos;s own team on the ground for events that need more hands than yours.
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
            <div className="text-center">
              <p className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-500">
                <Sparkles size={14} aria-hidden="true" />
                Self-Serve
              </p>
              <p className="font-display text-4xl leading-none text-fg sm:text-5xl">Free to start</p>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-fg-3">
                Run your event yourself from your dashboard. Start on Launch for free and move up when you&apos;re selling more.
              </p>
            </div>

            <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3">
              {plans.map((p) => {
                const planFee = formatTicketFee(planTicketFee({ fee_percentage: p.feePercentage, fee_flat_naira: p.feeFlatNaira }, fee));
                return (
                  <section key={p.id} className="eb-plan eb-plan--public" data-plan={p.id} aria-labelledby={`plan-${p.id}`}>
                    <h2 id={`plan-${p.id}`} className="eb-plan-name">
                      {p.id === "scale" && <Sparkles size={15} aria-hidden="true" />}
                      {p.name}
                    </h2>
                    <p className="eb-plan-price">
                      {p.priceMonthlyNaira > 0 ? formatNaira(p.priceMonthlyNaira) : "Free"}
                      {p.priceMonthlyNaira > 0 && <span>/month</span>}
                    </p>
                    <p className="eb-plan-fee">{planFee} per paid ticket</p>
                    <p className="mt-2 text-[13px] leading-relaxed text-muted">{PLAN_BLURB[p.id]}</p>
                    <ul className="eb-plan-list">
                      <li>
                        <Check size={14} aria-hidden="true" /> Free tickets and free events cost nothing
                      </li>
                      <li>
                        <Check size={14} aria-hidden="true" /> {p.maxPromotersPerEvent == null ? "Unlimited promoters" : `Up to ${p.maxPromotersPerEvent} promoters`} per event
                      </li>
                      <li>
                        <Check size={14} aria-hidden="true" /> Payouts to your bank on request
                      </li>
                    </ul>
                    <div className="mt-auto pt-5">
                      <Link href="/signup" className={`eb-btn w-full ${p.id === "launch" ? "eb-btn--primary" : "eb-btn--ghost"}`}>
                        {p.id === "launch" ? "Get started free" : `Choose ${p.name}`}
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="mt-4 text-center text-xs text-subtle">
              Every account starts on Launch; switch to Grow or Scale any time from Settings → Plan. Paid plans are billed monthly and can be cancelled any time.
            </p>

            <p className="mt-10 border-t border-line pt-8 text-sm font-semibold text-fg">Every plan includes</p>
            <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-3.5 sm:grid-cols-2">
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
