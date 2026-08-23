import type { Metadata } from "next";
import ManagedEventsContent from "./managed-events-content";

export const metadata: Metadata = {
  title: "Managed Events",
  description:
    "Full-service, on-site event staffing for education fairs, job fairs, and conferences — our staff, devices, and check-in setup at your venue. Request a quote.",
  alternates: { canonical: "/managed-events" },
};

export default function ManagedEventsPage() {
  return <ManagedEventsContent />;
}
