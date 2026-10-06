"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Mail, MapPin, AlertCircle } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";
import { isValidEmail } from "@/lib/validation";

const DIRECT_LINES = [
  {
    key: "whatsapp",
    href: "https://wa.me/2348109511825",
    icon: "/icons/whatsapp.png",
    label: "+234 810 951 1825",
    caption: "WhatsApp — usually a same-day reply",
  },
  {
    key: "instagram",
    href: "https://instagram.com/eventbuddy_africa",
    icon: "/icons/instagram.png",
    label: "@eventbuddy_africa",
    caption: "DMs open",
  },
  {
    key: "tiktok",
    href: "https://tiktok.com/@eventbuddy_africa",
    icon: "/icons/tiktok.svg",
    label: "@eventbuddy_africa",
    caption: "TikTok",
  },
  {
    key: "linkedin",
    href: "https://linkedin.com/company/eventbuddyafrica",
    icon: "/icons/linkedin.svg",
    label: "eventbuddyafrica",
    caption: "LinkedIn",
  },
] as const;

export default function ContactContent() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />

      <section className="eb-page-hero max-w-3xl mx-auto px-6 pt-14 pb-8 text-center">
        <h1 className="font-display text-4xl sm:text-5xl text-fg mb-3">Talk to us. A real person replies.</h1>
        <p className="text-muted max-w-xl mx-auto">
          Questions about pricing, running a Full-Service event, or something that broke — send it below, or skip the
          form entirely and reach us direct.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-6">
          {/* Form */}
          <div className="rounded-3xl border border-line bg-surface p-8 sm:p-10 animate-fade-in-up" style={{ animationDelay: "80ms" }}>
            {sent ? (
              <div className="h-full flex flex-col items-center justify-center text-center py-10">
                <div className="w-14 h-14 rounded-full bg-teal-500/10 flex items-center justify-center mb-4">
                  <CheckCircle2 size={26} className="text-teal-300" />
                </div>
                <h2 className="text-xl font-semibold text-fg mb-1.5">Message sent</h2>
                <p className="text-muted text-sm max-w-xs">
                  We&apos;ve emailed a copy to {email} — we usually reply within a few hours.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setName("");
                    setEmail("");
                    setSubject("");
                    setMessage("");
                  }}
                  className="mt-6 text-sm font-medium text-brand-500 hover:underline"
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-fg-2 mb-1.5">Name</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Amaka Obi"
                      required
                      className="w-full px-4 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-surface"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-fg-2 mb-1.5">Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full px-4 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-surface"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="What's this about?"
                    required
                    className="w-full px-4 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-surface"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-fg-2 mb-1.5">Message</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what you need help with"
                    required
                    rows={5}
                    className="w-full px-4 py-2.5 rounded-lg border border-line text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-transparent bg-surface resize-none"
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 text-rose-300 text-sm">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 transition-colors"
                >
                  {loading ? "Sending…" : "Send message"}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>
            )}
          </div>

          {/* Direct lines — vibrant panel echoing the pricing page's featured-tier
              treatment, with the flower mark's own hues bleeding softly into the
              corners instead of a generic gradient blob. */}
          <div
            className="relative rounded-3xl p-8 sm:p-10 text-white overflow-hidden animate-fade-in-up"
            style={{
              animationDelay: "160ms",
              background: "radial-gradient(ellipse 150% 130% at 80% 110%, var(--color-brand-500) 0%, var(--color-brand-600) 55%, #170821 130%)",
            }}
          >
            <div
              className="absolute inset-0 opacity-10"
              style={{ backgroundImage: "radial-gradient(circle at center, rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "26px 26px" }}
            />
            <div className="absolute -top-16 -left-16 w-56 h-56 rounded-full opacity-40 blur-3xl" style={{ background: "#FF7D2D" }} />
            <div className="absolute -bottom-20 -right-10 w-64 h-64 rounded-full opacity-30 blur-3xl" style={{ background: "#6D28D9" }} />

            <div className="relative">
              <p className="font-display text-2xl mb-1">Prefer to skip the form?</p>
              <p className="text-white/70 text-sm mb-8">Reach us directly — same team, same day.</p>

              <div className="space-y-5 mb-8">
                {DIRECT_LINES.map((line) => (
                  <a key={line.key} href={line.href} target="_blank" rel="noreferrer" className="flex items-center gap-3 group hover-bounce-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={line.icon} alt="" width={36} height={36} className="rounded-full shrink-0" />
                    <div>
                      <p className="text-sm font-semibold group-hover:underline">{line.label}</p>
                      <p className="text-xs text-white/60">{line.caption}</p>
                    </div>
                  </a>
                ))}
              </div>

              <div className="pt-6 border-t border-white/15 space-y-4">
                <a href="mailto:info@eventbuddy.africa" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-full bg-surface/10 flex items-center justify-center shrink-0">
                    <Mail size={16} />
                  </div>
                  <p className="text-sm font-medium group-hover:underline">info@eventbuddy.africa</p>
                </a>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-surface/10 flex items-center justify-center shrink-0">
                    <MapPin size={16} />
                  </div>
                  <p className="text-sm font-medium text-white/90">Lagos, Nigeria</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
