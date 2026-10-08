import type { Metadata } from "next";
import { CompanyContent } from "./company-content";

const description =
  "What eventbuddy is, in plain terms: ticketing, check-in, promoters, exhibitor stands, a live event hub and safe payouts for any event, with an on-site team when you want one.";

export const metadata: Metadata = {
  title: "Company profile",
  description,
  alternates: { canonical: "/company" },
  openGraph: { title: "eventbuddy: company profile", description, url: "/company", type: "website", images: ["/company/noel-amobeda-founder.jpg"] },
  twitter: { card: "summary_large_image", title: "eventbuddy: company profile", description },
};

export default function CompanyPage() {
  return <CompanyContent />;
}
