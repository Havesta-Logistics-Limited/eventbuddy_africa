"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CalendarDays, CheckCircle2, MapPin } from "lucide-react";
import { PublicHeader } from "@/components/register-page-content";
import { LandingFooter } from "@/components/landing/landing-close";
import { formatNaira } from "@/lib/billing";
import { formatTime } from "@/lib/utils";
import { isValidEmail, isValidPhoneStrict, sanitizePhoneInput } from "@/lib/validation";

type Info =
  | { enabled: false }
  | {
      enabled: true;
      closed: boolean;
      event: { id: string; slug: string; name: string; date: string; startTime: string | null; venue: string; location: string; coverImage: string | null; intro: string | null; deadline: string | null };
      organizer: string;
      stands: { id: string; name: string; description: string | null; priceNaira: number; left: number | null }[];
    };

/** eventbuddy.africa/<event-slug>/exhibit: companies apply for a stand
 *  (migration 0112). The organizer approves, then emails a payment link. */
export default function ExhibitPage() {
  const { orgSlug: slug } = useParams<{ orgSlug: string }>();
  const [info, setInfo] = useState<Info | null>(null);
  const [form, setForm] = useState({ standTypeId: "", companyName: "", contactName: "", email: "", phone: "", website: "", category: "", description: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetch(`/api/exhibit/info?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d: Info) => {
        setInfo(d);
        if (d.enabled) {
          const first = d.stands.find((s) => s.left !== 0);
          if (first) setForm((f) => ({ ...f, standTypeId: first.id }));
        }
      })
      .catch(() => setInfo({ enabled: false }));
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!info?.enabled) return;
    if (!form.standTypeId) return setError("Pick a stand type.");
    if (!form.companyName.trim() || !form.contactName.trim()) return setError("Enter your company and the contact person's name.");
    if (!isValidEmail(form.email)) return setError("Enter a valid email address.");
    if (!isValidPhoneStrict(form.phone)) return setError("Enter a valid phone number, e.g. 0801 234 5678.");
    let website = form.website.trim();
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/exhibit/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website: website || undefined, category: form.category || undefined, description: form.description || undefined, eventId: info.event.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Couldn't send your application.");
      setSent(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send your application.");
    } finally {
      setSending(false);
    }
  }

  if (!info) return <div className="min-h-screen bg-canvas" />;

  if (!info.enabled) {
    return (
      <div className="min-h-screen bg-canvas">
        <PublicHeader />
        <div className="mx-auto max-w-sm py-32 text-center text-white/60">
          <p className="font-medium text-white">This event isn&apos;t taking exhibitors.</p>
          <p className="mt-1 text-sm">Check the link with the organizer.</p>
        </div>
      </div>
    );
  }

  const { event, stands } = info;
  const d = new Date(`${event.date}T00:00:00`);

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <PublicHeader />
      <main>
        <section className="eb-page-hero mx-auto max-w-3xl px-4 pb-8 text-center sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ff8af5]">Exhibit at</p>
          <h1 className="mt-3 font-display text-white">{event.name}</h1>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} aria-hidden="true" />
              {d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}
              {event.startTime ? ` · ${formatTime(event.startTime)}` : ""}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={14} aria-hidden="true" />
              {[event.venue, event.location].filter(Boolean).join(", ")}
            </span>
          </p>
          {event.intro && <p className="mx-auto mt-4 max-w-xl whitespace-pre-line text-fg-3">{event.intro}</p>}
        </section>

        <section className="mx-auto max-w-2xl px-4 pb-24 sm:px-6">
          {sent ? (
            <div className="eb-ov-card text-center">
              <CheckCircle2 size={40} className="mx-auto text-emerald-300" aria-hidden="true" />
              <h2 className="mt-3 text-xl font-semibold text-white">Application sent</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                {info.organizer || "The organizer"} will review it. You&apos;ll get an email at <strong className="text-fg">{form.email}</strong> when they decide
                {stands.find((s) => s.id === form.standTypeId)?.priceNaira === 0 ? ", with your exhibitor portal if you're approved." : ", with a link to pay for your stand if you're approved."}
              </p>
              <Link href={`/${event.slug}`} className="eb-btn eb-btn--ghost mt-6">
                Back to the event
              </Link>
            </div>
          ) : info.closed ? (
            <p className="eb-ov-card text-center text-sm text-muted">Exhibitor applications for this event have closed.</p>
          ) : (
            <form onSubmit={submit} className="space-y-5" noValidate>
              <fieldset>
                <legend className="mb-3 text-sm font-semibold uppercase tracking-wider text-subtle">Choose a stand</legend>
                <div className="space-y-2">
                  {stands.map((s) => {
                    const full = s.left === 0;
                    return (
                      <label key={s.id} className="eb-stand-opt" data-selected={form.standTypeId === s.id || undefined} data-full={full || undefined}>
                        <input type="radio" name="stand" className="sr-only" disabled={full} checked={form.standTypeId === s.id} onChange={() => setForm({ ...form, standTypeId: s.id })} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-white">{s.name}</span>
                          {s.description && <span className="mt-0.5 block text-sm text-muted">{s.description}</span>}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-semibold tabular-nums text-white">{s.priceNaira === 0 ? "Free" : formatNaira(s.priceNaira)}</span>
                          <span className="block text-xs text-subtle">{full ? "Fully booked" : s.left != null ? `${s.left} left` : "Available"}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset className="eb-ov-card space-y-3">
                <legend className="sr-only">Your company</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ex-co" className="eb-label eb-req">Company name</label>
                    <input id="ex-co" className="eb-input" autoComplete="organization" maxLength={160} value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="ex-cat" className="eb-label">What you do</label>
                    <input id="ex-cat" className="eb-input" maxLength={80} placeholder="Food & drinks, fashion, tech…" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="ex-name" className="eb-label eb-req">Contact person</label>
                    <input id="ex-name" className="eb-input" autoComplete="name" maxLength={120} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="ex-phone" className="eb-label eb-req">Phone</label>
                    <input id="ex-phone" type="tel" className="eb-input" autoComplete="tel" placeholder="0801 234 5678" value={form.phone} onChange={(e) => setForm({ ...form, phone: sanitizePhoneInput(e.target.value) })} />
                  </div>
                  <div>
                    <label htmlFor="ex-email" className="eb-label eb-req">Email</label>
                    <input id="ex-email" type="email" className="eb-input" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div>
                    <label htmlFor="ex-web" className="eb-label">Website or social page</label>
                    <input id="ex-web" className="eb-input" inputMode="url" placeholder="instagram.com/yourbrand" maxLength={300} value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label htmlFor="ex-desc" className="eb-label">What you&apos;ll show or sell</label>
                  <textarea id="ex-desc" rows={3} className="eb-input" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
              </fieldset>

              {error && (
                <p className="eb-alert" role="alert">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
                </p>
              )}
              <button type="submit" disabled={sending} className="eb-btn eb-btn--primary w-full">
                {sending ? "Sending…" : "Apply for a stand"}
              </button>
              <p className="text-center text-xs text-subtle">
                {stands.find((s) => s.id === form.standTypeId)?.priceNaira === 0
                  ? `Free stand. If ${info.organizer || "the organizer"} approves you, you're confirmed straight away and we'll email you your exhibitor portal.`
                  : `Nothing to pay now. If ${info.organizer || "the organizer"} approves you, we'll email you a link to pay.`}
              </p>
            </form>
          )}
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
