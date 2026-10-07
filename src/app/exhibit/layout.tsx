import type { Metadata } from "next";

/** A private stand payment page reached from the approval email. Kept out of search results (pre-launch SEO pass, 2026-10-07). */
export const metadata: Metadata = {
  title: "Pay for your stand",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
