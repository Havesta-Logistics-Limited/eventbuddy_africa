import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { EVENT_PRICE_USD, formatUSD } from "@/lib/billing";
import PricingContent from "./pricing-content";
import { faqs } from "./faqs";

const title = "Pricing";
const description =
  "Simple, pay-per-event pricing for event lead capture and check-in software. No subscription, no per-seat fees — physical events are charged once, virtual events are always free.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
};

/** Server wrapper only — PricingContent is "use client" (it live-updates the price
 *  after mount) and can't export metadata itself. Also emits FAQPage structured
 *  data from the exact same faqs() copy the page renders, fetching the live price
 *  server-side so the schema never shows a stale/wrong number to a crawler even
 *  before the client-side price fetch resolves. */
export default async function PricingPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("event_price_usd").eq("id", true).maybeSingle();
  const priceLabel = formatUSD(data ? Number(data.event_price_usd) : EVENT_PRICE_USD);

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs(priceLabel).map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <>
      {/* Static, derived only from this file's own real FAQ copy — safe to inject as-is. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }} />
      <PricingContent />
    </>
  );
}
