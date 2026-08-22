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
const title = "eventbuddy — Desired Results On The Go";
const description = "Run any event, collect qualified leads, and share insights with your team — all in one platform.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s — eventbuddy" },
  description,
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
