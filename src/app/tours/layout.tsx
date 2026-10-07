import type { Metadata } from "next";

/** The organizer's tour dashboard, behind sign-in (the public page is /{org}/tours/{slug}). Kept out of search results (pre-launch SEO pass, 2026-10-07). */
export const metadata: Metadata = {
  title: "Tour",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
