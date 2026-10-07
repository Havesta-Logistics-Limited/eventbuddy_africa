import type { Metadata } from "next";

const description =
  "Sign up free as an eventbuddy promoter, share your own links to events you love, and earn commission on every ticket sold through them. Paid out to your bank.";

export const metadata: Metadata = {
  title: "Become a promoter",
  description,
  alternates: { canonical: "/promote" },
  openGraph: { title: "Earn by promoting events on eventbuddy", description, url: "/promote", type: "website" },
  twitter: { card: "summary_large_image", title: "Earn by promoting events on eventbuddy", description },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
