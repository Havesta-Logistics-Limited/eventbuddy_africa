"use client";

import { useEffect, useState } from "react";
import { LandingHero, LandingNav } from "@/components/landing/landing-hero";
import { TrustedBy } from "@/components/landing/trusted-by";
import { LandingWays } from "@/components/landing/landing-ways";
import { LandingHub } from "@/components/landing/landing-hub";
import { LandingClose, LandingFaq, LandingFooter } from "@/components/landing/landing-close";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatTicketFee } from "@/lib/billing";
import { faqs } from "@/app/pricing/faqs";

const HOME_FAQ_QUESTIONS = [
  "How much does Self-Serve cost?",
  "What's the difference between Self-Serve, Full-Service, and Enterprise?",
  "Do I pay anything for free tickets or free events?",
  "How do I actually get paid for ticket sales?",
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
  const homeFaqs = faqs(feeLabel).filter((f) => HOME_FAQ_QUESTIONS.includes(f.q));

  return (
    <div className="min-h-screen bg-[#07030c]">
      <LandingNav />
      <LandingHero fee={fee} />

      <TrustedBy />

      <LandingWays feeLabel={feeLabel} />

      <LandingHub />

      <LandingFaq items={homeFaqs} />

      <LandingClose feeLabel={feeLabel} />

      <LandingFooter />
    </div>
  );
}
