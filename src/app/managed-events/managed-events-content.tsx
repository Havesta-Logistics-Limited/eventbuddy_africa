"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Users2, Tablet, QrCode, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/logo";

const INCLUDED = [
  { icon: Users2, title: "On-site staff", body: "Our team runs your check-in desk in person — you don't need to train or bring your own staff." },
  { icon: Tablet, title: "Devices, provided", body: "Check-in tablets and printers, set up and running before doors open." },
  { icon: QrCode, title: "QR badges, printed on arrival", body: "Every attendee gets a scannable badge printed at registration for fast, reliable entry." },
  { icon: ClipboardCheck, title: "Full on-site management", body: "Registration, check-in, and lead capture handled end-to-end at your venue." },
];

type FormState = {
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  organizationName: string;
  eventName: string;
  eventDate: string;
  expectedAttendees: string;
  city: string;
  message: string;
};

const EMPTY_FORM: FormState = {
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  organizationName: "",
  eventName: "",
  eventDate: "",
  expectedAttendees: "",
  city: "",
  message: "",
};

export default function ManagedEventsContent() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/managed-event-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't submit your request. Please try again.");
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600";
  const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-md border-b border-slate-200/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="sm:hidden">
            <Logo height={18} />
          </span>
          <span className="hidden sm:block">
            <Logo height={26} />
          </span>
          <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
            <ArrowLeft size={15} />
            Back home
          </Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-16 pb-4 text-center">
        <h1 className="font-display text-3xl sm:text-4xl text-slate-900 mb-4 leading-tight">
          We run your event on-site,
          <br />
          so you don&apos;t have to.
        </h1>
        <p className="text-slate-500 leading-relaxed max-w-xl mx-auto">
          For teams who want the physical registration and check-in handled entirely for them — our staff, our
          devices, at your venue. Tell us about your event and we&apos;ll get back to you with a quote.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-14 grid lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
        <div className="grid sm:grid-cols-2 lg:grid-cols-1 gap-5">
          {INCLUDED.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4 bg-white rounded-2xl border border-slate-200 p-5 hover:border-brand-600/30 hover:shadow-sm transition-all">
              <div className="w-11 h-11 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
                <Icon size={19} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          {submitted ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={26} className="text-emerald-600" />
              </div>
              <h2 className="font-display text-xl text-slate-900 mb-2">Request sent</h2>
              <p className="text-sm text-slate-500 max-w-sm mx-auto">
                Thanks — we&apos;ve got your event details and will follow up at {form.contactEmail} with a quote.
              </p>
              <Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline">
                Back to eventbuddy
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="font-display text-xl text-slate-900 mb-1">Request a quote</h2>
              <p className="text-sm text-slate-500 mb-5">No pricing is charged here — we&apos;ll reach out with a quote based on your event.</p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Your name</label>
                  <input required value={form.contactName} onChange={(e) => set("contactName", e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input required type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={fieldClass} />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Phone (optional)</label>
                  <input value={form.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Organization (optional)</label>
                  <input value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} className={fieldClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>Event name</label>
                <input required value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={fieldClass} />
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Event date (optional)</label>
                  <input type="date" value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Expected attendees</label>
                  <input placeholder="e.g. 200-300" value={form.expectedAttendees} onChange={(e) => set("expectedAttendees", e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>City / venue</label>
                  <input required value={form.city} onChange={(e) => set("city", e.target.value)} className={fieldClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>Anything else we should know? (optional)</label>
                <textarea rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} className={`${fieldClass} resize-none`} />
              </div>

              {error && <p className="text-sm text-rose-600">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60 transition-colors"
              >
                {submitting ? "Sending…" : "Request a quote"}
                {!submitting && <ArrowRight size={16} />}
              </button>
            </form>
          )}
        </div>
      </section>

      <footer className="text-white" style={{ background: "#170821" }}>
        <div className="max-w-5xl mx-auto px-6 py-14 grid sm:grid-cols-[1.4fr_1fr_1fr] gap-10">
          <div>
            <Logo tone="white" variant="full" height={16} />
            <p className="text-sm text-white/50 mt-4 max-w-xs leading-relaxed">
              Registration, ticketing, and check-in for any event — education fairs, job fairs, conferences, and more — never lose a lead.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Product</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/pricing" className="text-white/70 hover:text-white">
                Pricing
              </Link>
              <Link href="/login" className="text-white/70 hover:text-white">
                Sign in
              </Link>
              <Link href="/signup" className="text-white/70 hover:text-white">
                Get Started
              </Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-3">Legal</p>
            <div className="flex flex-col gap-2.5 text-sm">
              <Link href="/privacy" className="text-white/70 hover:text-white">
                Privacy Policy
              </Link>
              <Link href="/terms" className="text-white/70 hover:text-white">
                Terms &amp; Conditions
              </Link>
            </div>
          </div>
        </div>
        <div className="h-1 w-full flex">
          <div className="flex-1" style={{ background: "#C21FAF" }} />
          <div className="flex-1" style={{ background: "#6D28D9" }} />
          <div className="flex-1" style={{ background: "#E85D0A" }} />
          <div className="flex-1" style={{ background: "#B8119C" }} />
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/40">
            <p>© 2026 eventbuddy. All rights reserved.</p>
            <p>Never Lose a Lead</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
