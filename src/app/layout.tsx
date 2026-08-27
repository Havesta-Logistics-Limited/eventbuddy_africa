import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Inter, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

// DM Serif Display only ships a regular weight — nowhere near bold enough for the
// homepage trust band's stat numbers, which need real heavy-serif weight rather
// than a browser-faked bold. Scoped to its own variable/class (.font-display-bold
// in globals.css) so it stays a deliberate exception, not a second site-wide
// display identity competing with DM Serif Display everywhere else.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "900"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const title = "eventbuddy — Never Lose a Lead";
// Keyword-bearing but factually accurate — every phrase here names something the
// product actually does (registration, ticketing, check-in, lead capture) rather
// than generic marketing filler, since that's what both Google and a reader
// scanning a search snippet actually need to see.
const description =
  "Registration, ticketing, and check-in software for education fairs, job fairs, conferences, and any other event across Africa. Free to start — only pay a transaction fee when a ticket sells.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: title, template: "%s — eventbuddy" },
  description,
  keywords: [
    "event registration software",
    "event ticketing software",
    "event check-in app",
    "event lead capture software",
    "education fair software",
    "job fair lead management",
    "conference ticketing",
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
  keywords: "event registration software, event ticketing software, event check-in app, education fair software, job fair lead management, conference ticketing, Africa",
  url: siteUrl,
  offers: { "@type": "Offer", priceCurrency: "NGN", price: "0", description: "Free to start on Self-Serve — pay only a transaction fee on tickets sold" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#C21FAF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSerif.variable} ${inter.variable} ${playfair.variable} antialiased`}>
      <body>
        {/* Static, hardcoded JSON — no user input ever flows into this, safe to inject as-is. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        {children}
        <Toaster richColors position="top-right" closeButton />
      </body>
    </html>
  );
}
