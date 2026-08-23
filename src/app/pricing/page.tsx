import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TICKET_FEE_PERCENTAGE } from "@/lib/billing";
import PricingContent from "./pricing-content";
import { faqs } from "./faqs";

const title = "Pricing";
const description =
  "Free to start on Self-Serve — create and run registration, ticketing, and check-in yourself, and only pay a transaction fee on tickets you sell. Or bring eventbuddy's team on-site with Full-Service and Enterprise.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/pricing" },
};

/** Server wrapper only — PricingContent is "use client" (it live-updates the fee
 *  percentage after mount) and can't export metadata itself. Also emits FAQPage
 *  structured data from the exact same faqs() copy the page renders, fetching the
 *  live fee percentage server-side so the schema never shows a stale/wrong number
 *  to a crawler even before the client-side fetch resolves. */
export default async function PricingPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("ticket_fee_percentage").eq("id", true).maybeSingle();
  const feeLabel = `${data ? Number(data.ticket_fee_percentage) : TICKET_FEE_PERCENTAGE}%`;

  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs(feeLabel).map(({ q, a }) => ({
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
