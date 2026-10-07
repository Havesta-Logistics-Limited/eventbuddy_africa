import type { Metadata } from "next";

/** A private exhibitor portal (a secret link that shows their leads' contact details). Kept out of search results (pre-launch SEO pass, 2026-10-07). */
export const metadata: Metadata = {
  title: "Exhibitor portal",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
