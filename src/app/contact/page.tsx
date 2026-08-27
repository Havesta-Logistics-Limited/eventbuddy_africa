import type { Metadata } from "next";
import ContactContent from "./contact-content";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Questions about pricing, running a Full-Service event, or something that broke? Reach eventbuddy by form, WhatsApp, Instagram, or email — we usually reply within a few hours.",
  alternates: { canonical: "/contact" },
};

/** Server wrapper only — ContactContent is "use client" (the form has real
 *  submit/loading/success state) and can't export metadata itself. */
export default function ContactPage() {
  return <ContactContent />;
}
