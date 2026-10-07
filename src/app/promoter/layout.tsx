import type { Metadata } from "next";

/** The promoter's dashboard and payouts, behind sign-in. Kept out of search
 *  results (pre-launch SEO pass, 2026-10-07). */
export const metadata: Metadata = {
  title: "Promoter dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
