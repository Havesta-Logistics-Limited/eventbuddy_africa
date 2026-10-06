"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Users2, Tablet, QrCode, ClipboardCheck, CheckCircle2 } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";
import { isValidEmail, isValidPhone, sanitizePhoneInput } from "@/lib/validation";
import { BUDGET_OPTIONS } from "@/lib/managed-events";

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
  budget: string;
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
  budget: "",
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
    if (!isValidEmail(form.contactEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!isValidPhone(form.contactPhone)) {
      setError("Enter a valid phone number.");
      return;
    }
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

  const fieldClass = "eb-input";
  const labelClass = "eb-label";

  return (
    <div className="min-h-screen bg-canvas">
      <LandingNav />

      <section className="eb-page-hero max-w-3xl mx-auto px-6 pt-16 pb-4 text-center">
        <h1 className="font-display text-3xl sm:text-4xl text-fg mb-4 leading-tight">
          We run your event on-site,
          <br />
          so you don&apos;t have to.
        </h1>
        <p className="text-muted leading-relaxed max-w-xl mx-auto">
          For teams who want the physical registration and check-in handled entirely for them — our staff, our
          devices, at your venue. Tell us about your event and we&apos;ll get back to you with a quote.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-14 grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-10 items-start">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-5">
          {INCLUDED.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4 bg-surface rounded-2xl border border-line p-5 hover:border-brand-600/30 hover:shadow-sm transition-all">
              <div className="w-11 h-11 rounded-xl bg-brand-600 flex items-center justify-center shrink-0">
                <Icon size={19} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-fg text-sm mb-1">{title}</h3>
                <p className="text-sm text-muted leading-relaxed">{body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-surface rounded-3xl border border-line shadow-sm p-6 sm:p-8">
          {submitted ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={26} className="text-emerald-300" />
              </div>
              <h2 className="font-display text-xl text-fg mb-2">Request sent</h2>
              <p className="text-sm text-muted max-w-sm mx-auto">
                Thanks — we&apos;ve got your event details and will follow up at {form.contactEmail} with a quote.
              </p>
              <Link href="/" className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:underline">
                Back to eventbuddy
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="font-display text-xl text-fg mb-1">Request a quote</h2>
              <p className="text-sm text-muted mb-5">No pricing is charged here — we&apos;ll reach out with a quote based on your event.</p>

              {/* Every row is an even pair so labels and fields line up. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="q-name" className={`${labelClass} eb-req`}>Your name</label>
                  <input id="q-name" required autoComplete="name" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="q-email" className={`${labelClass} eb-req`}>Email</label>
                  <input id="q-email" required type="email" autoComplete="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={fieldClass} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="q-phone" className={`${labelClass} eb-req`}>Phone</label>
                  <input id="q-phone" required type="tel" autoComplete="tel" placeholder="0801 234 5678" value={form.contactPhone} onChange={(e) => set("contactPhone", sanitizePhoneInput(e.target.value))} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="q-org" className={`${labelClass} eb-req`}>Organization</label>
                  <input id="q-org" required autoComplete="organization" value={form.organizationName} onChange={(e) => set("organizationName", e.target.value)} className={fieldClass} />
                </div>
              </div>

              <div>
                <label htmlFor="q-event" className={`${labelClass} eb-req`}>Event name</label>
                <input id="q-event" required value={form.eventName} onChange={(e) => set("eventName", e.target.value)} className={fieldClass} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="q-date" className={`${labelClass} eb-req`}>Event date</label>
                  <input id="q-date" required type="date" min={new Date().toISOString().slice(0, 10)} value={form.eventDate} onChange={(e) => set("eventDate", e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="q-attendees" className={`${labelClass} eb-req`}>Expected attendees</label>
                  <input id="q-attendees" required inputMode="numeric" placeholder="e.g. 200–300" value={form.expectedAttendees} onChange={(e) => set("expectedAttendees", e.target.value)} className={fieldClass} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="q-city" className={`${labelClass} eb-req`}>City / venue</label>
                  <input id="q-city" required placeholder="e.g. Eko Hotel, Lagos" value={form.city} onChange={(e) => set("city", e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <label htmlFor="q-budget" className={`${labelClass} eb-req`}>Budget</label>
                  <select id="q-budget" required value={form.budget} onChange={(e) => set("budget", e.target.value)} className={`${fieldClass} cursor-pointer`}>
                    <option value="" disabled>
                      Select a range
                    </option>
                    {BUDGET_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelClass}>Anything else we should know? (optional)</label>
                <textarea rows={3} value={form.message} onChange={(e) => set("message", e.target.value)} className={`${fieldClass} resize-none`} />
              </div>

              {error && <p className="eb-alert" role="alert">{error}</p>}

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

      <LandingFooter />
    </div>
  );
}
