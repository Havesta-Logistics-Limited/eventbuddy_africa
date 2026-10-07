import type { Metadata } from "next";

const description =
  "Build your event page, add ticket types and publish in minutes. Free to start: you only pay when a ticket sells. Concerts, conferences, festivals, meetups and more.";

export const metadata: Metadata = {
  title: "Create an event",
  description,
  alternates: { canonical: "/create" },
  openGraph: { title: "Create your event free on eventbuddy", description, url: "/create", type: "website" },
  twitter: { card: "summary_large_image", title: "Create your event free on eventbuddy", description },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
