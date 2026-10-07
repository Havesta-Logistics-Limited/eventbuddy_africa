import type { Metadata } from "next";

const description =
  "Browse upcoming events that pay promoters, see each one's commission, and get your own link to share. Earn on every ticket sold through you.";

export const metadata: Metadata = {
  title: "Promoter marketplace",
  description,
  alternates: { canonical: "/marketplace" },
  openGraph: { title: "Events looking for promoters", description, url: "/marketplace", type: "website" },
  twitter: { card: "summary_large_image", title: "Events looking for promoters", description },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
