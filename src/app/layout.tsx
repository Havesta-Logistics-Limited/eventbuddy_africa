import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { EVENT_PRICE_USD } from "@/lib/billing";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const title = "eventbuddy — Never Lose a Lead";
// Keyword-bearing but factually accurate — every phrase here names something the
// product actually does (lead capture, staff check-in, education/job fair support)
// rather than generic marketing filler, since that's what both Google and a reader
// scanning a search snippet actually need to see.
const description =
  "Event lead capture and check-in software for education fairs, job fairs, and conferences across Africa. Collect qualified leads, run staff check-in, and export data instantly — pay per event, no subscription.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s — eventbuddy" },
  description,
  keywords: [
    "event lead capture software",
    "event check-in app",
    "education fair software",
    "job fair lead management",
    "conference lead capture",
    "event management software Africa",
    "event management software Nigeria",
  ],
  openGraph: {
    title,
    description,
    url: siteUrl,
    siteName: "eventbuddy",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: { index: true, follow: true },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "eventbuddy",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description,
  keywords: "event lead capture software, event check-in app, education fair software, job fair lead management, conference lead capture, Africa",
  url: siteUrl,
  offers: { "@type": "Offer", priceCurrency: "USD", price: String(EVENT_PRICE_USD), description: "Pay-per-event pricing, no subscription" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#610064",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${inter.variable} antialiased`}>
      <body>
        {/* Static, hardcoded JSON — no user input ever flows into this, safe to inject as-is. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
