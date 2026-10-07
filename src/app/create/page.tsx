"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarPlus, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { AuthCentered, AuthSplit } from "@/components/auth/auth-shell";
import { CheckEmailPanel } from "@/components/auth/check-email-panel";
import { EventWizard, type EventWizardData } from "@/components/event-wizard";
import { GuestTicketBuilder, ticketPlanValid, type TicketPlan } from "@/components/guest-ticket-builder";
import { PublicHeader } from "@/components/register-page-content";
import { useSession } from "@/lib/store";
import { claimGuestDraft } from "@/lib/guest-draft-claim";
import { GUEST_CLAIM_KEY, OPEN_EVENT_KEY, clearStoredDraft, readStoredDraft, storeDraft, type GuestDraft } from "@/lib/guest-draft";
import { isValidEmail, isValidPhoneStrict, sanitizePhoneInput } from "@/lib/validation";

type Stage = "loading" | "resume" | "build" | "account" | "done";

function toDraft(event: EventWizardData, plan: TicketPlan): GuestDraft {
  return {
    event: {
      name: event.name,
      date: event.date,
      endDate: event.endDate || "",
      startTime: event.startTime || "",
      endTime: event.endTime || "",
      location: event.location,
      venue: event.venue,
      description: event.description,
      coverImage: event.coverImage || undefined,
      customFields: (event.customFields ?? []) as unknown as GuestDraft["event"]["customFields"],
      timezone: event.timezone,
      eventFormat: event.eventFormat ?? "physical",
      category: event.category,
      selfRegistrationEnabled: event.selfRegistrationEnabled ?? true,
      isInviteOnly: event.isInviteOnly ?? false,
      virtualJoinUrl: event.virtualJoinUrl,
      virtualPlatform: event.virtualPlatform,
      virtualAccessNotes: event.virtualAccessNotes,
    },
    tickets: plan.paid ? plan.tickets.map((t) => ({ ...t, name: t.name.trim() })) : [],
  };
}

function fromDraft(d: GuestDraft): { event: EventWizardData; plan: TicketPlan } {
  return {
    event: {
      ...d.event,
      endDate: d.event.endDate || "",
      startTime: d.event.startTime || "",
      endTime: d.event.endTime || "",
      coverImage: d.event.coverImage || undefined,
      customFields: d.event.customFields as unknown as EventWizardData["customFields"],
      destinationIds: [],
      templateId: "custom",
      staffAccessCode: "",
      repAccessCode: "",
      allowRepAccess: true,
    },
    plan: { paid: d.tickets.length > 0, tickets: d.tickets },
  };
}

/**
 * Create an event without an account (eventbuddy's front door). The visitor
 * builds the whole event, tickets included; saving asks for a free account,
 * and the event lands in it as a draft to review and publish. Nothing reaches
 * the server until sign-up, so strangers can't fill the database with junk.
 */
export default function CreateEventPage() {
  const router = useRouter();
  const session = useSession();
  const [stage, setStage] = useState<Stage>("loading");
  const [event, setEvent] = useState<EventWizardData | undefined>(undefined);
  const [plan, setPlan] = useState<TicketPlan>({ paid: false, tickets: [] });
  const latest = useRef<EventWizardData | undefined>(undefined);
  const [submitted, setSubmitted] = useState<EventWizardData | null>(null);

  // signed in already: no need for the guest flow
  useEffect(() => {
    if (!session) return;
    if (session.role !== "admin") return void router.replace("/login");
    if (readStoredDraft()) {
      claimGuestDraft()
        .then((id) => {
          toast.success("Your event is saved as a draft");
          router.replace(id ? `/events/${id}` : "/dashboard");
        })
        .catch(() => router.replace("/dashboard"));
    } else router.replace("/dashboard?create=1");
  }, [session, router]);

  useEffect(() => {
    if (session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is only readable after mount
    setStage(readStoredDraft() ? "resume" : "build");
  }, [session]);

  const keep = useCallback(
    (d: EventWizardData) => {
      latest.current = d;
      if (d.name || d.date || d.venue) storeDraft(toDraft(d, plan));
    },
    [plan]
  );

  // tickets change outside the wizard: store them too
  useEffect(() => {
    if (latest.current) storeDraft(toDraft(latest.current, plan));
  }, [plan]);

  if (session || stage === "loading") return <div className="min-h-screen bg-canvas" />;

  if (stage === "resume") {
    const stored = readStoredDraft();
    return (
      <AuthCentered>
        <div className="text-center">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[rgb(255_138_245/0.12)] text-[#ff8af5]">
            <CalendarPlus size={22} aria-hidden="true" />
          </span>
          <h1 className="eb-auth-title">Continue your event?</h1>
          <p className="eb-auth-sub">
            You started building <strong className="text-fg">{stored?.draft.event.name || "an event"}</strong> on this device.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              className="eb-btn eb-btn--primary w-full"
              onClick={() => {
                if (stored) {
                  const r = fromDraft(stored.draft);
                  setEvent(r.event);
                  setPlan(r.plan);
                  latest.current = r.event;
                }
                setStage("build");
              }}
            >
              Continue where I left off
            </button>
            <button
              type="button"
              className="eb-btn eb-btn--ghost w-full"
              onClick={() => {
                clearStoredDraft();
                setStage("build");
              }}
            >
              Start a new event
            </button>
          </div>
        </div>
      </AuthCentered>
    );
  }

  if ((stage === "account" || stage === "done") && submitted) {
    return (
      <AccountStep
        draft={toDraft(submitted, plan)}
        onBack={() => {
          setEvent(submitted);
          setStage("build");
        }}
        onDone={() => setStage("done")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <PublicHeader />
      <section className="eb-page-hero mx-auto max-w-3xl px-4 pb-24 text-center">
        <h1 className="font-display text-white">Create your event</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">Free to build. Save it with a free account, then publish when you&apos;re ready.</p>
      </section>
      <EventWizard
        mode="guest"
        initialData={event}
        onDataChange={keep}
        extraStep={{ title: "Tickets", content: <GuestTicketBuilder plan={plan} onChange={setPlan} />, valid: ticketPlanValid(plan) }}
        onSubmit={async (d) => {
          latest.current = d;
          storeDraft(toDraft(d, plan));
          setSubmitted(d);
          setStage("account");
        }}
        onCancel={() => router.push("/")}
      />
    </div>
  );
}

function AccountStep({ draft, onBack, onDone }: { draft: GuestDraft; onBack: () => void; onDone: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: "", organizationName: "", email: "", phone: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<{ email: string; emailSent: boolean; saved: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(form.email)) return setError("Enter a valid email address.");
    if (!isValidPhoneStrict(form.phone)) return setError("Enter a valid phone number, e.g. 0801 234 5678 or +234 801 234 5678.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create your account.");
        setLoading(false);
        return;
      }
      if (data.eventId) {
        clearStoredDraft();
        try {
          localStorage.setItem(OPEN_EVENT_KEY, data.eventId);
        } catch {
          /* the event is in their dashboard either way */
        }
      }
      setSent({ email: form.email, emailSent: data.emailSent !== false, saved: !!data.eventId });
      onDone();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <AuthCentered>
        {sent.saved && (
          <p className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-200 ring-1 ring-emerald-400/30">
            <strong>{draft.event.name}</strong> is saved as a draft in your new account.
          </p>
        )}
        <CheckEmailPanel email={sent.email} emailSent={sent.emailSent} onBack={() => router.push("/login")} />
      </AuthCentered>
    );
  }

  return (
    <AuthSplit headline="Your event is ready." accent="Save it free." sub="Create your account and we'll keep it as a draft. Review it, then publish when you're ready.">
      <h1 className="eb-auth-title">Save your event</h1>
      <p className="eb-auth-sub">
        <strong className="text-fg">{draft.event.name}</strong> · {draft.tickets.length ? `${draft.tickets.length} ticket type${draft.tickets.length === 1 ? "" : "s"}` : "free registration"}
      </p>
      <form onSubmit={submit} className="eb-form-compact">
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <div>
            <label htmlFor="ca-name" className="eb-label eb-req">Full name</label>
            <input id="ca-name" autoComplete="name" required className="eb-input" placeholder="Amaka Obi" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ca-org" className="eb-label eb-req">Organization name</label>
            <input id="ca-org" autoComplete="organization" required className="eb-input" placeholder="Summit Events" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
          </div>
        </div>
        <p className="eb-hint -mt-1.5">Shown on your event links: eventbuddy.africa/your-org.</p>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <div>
            <label htmlFor="ca-email" className="eb-label eb-req">Email</label>
            <input id="ca-email" type="email" autoComplete="email" required className="eb-input" placeholder="you@company.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ca-phone" className="eb-label eb-req">Phone</label>
            <input id="ca-phone" type="tel" autoComplete="tel" required className="eb-input" placeholder="0801 234 5678" value={form.phone} onChange={(e) => setForm({ ...form, phone: sanitizePhoneInput(e.target.value) })} />
          </div>
        </div>
        <div>
          <label htmlFor="ca-pw" className="eb-label eb-req">Password</label>
          <div className="relative">
            <input id="ca-pw" type={showPw ? "text" : "password"} autoComplete="new-password" required minLength={8} className="eb-input pr-11" placeholder="At least 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted hover:text-fg" aria-label={showPw ? "Hide password" : "Show password"}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        {error && (
          <div className="eb-alert" role="alert">
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="eb-btn eb-btn--primary w-full">
          {loading ? "Saving…" : "Create account & save event"}
        </button>
      </form>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" onClick={onBack} className="eb-link">
          ← Back to my event
        </button>
        <button
          type="button"
          className="eb-link"
          onClick={() => {
            try {
              localStorage.setItem(GUEST_CLAIM_KEY, "1");
            } catch {
              /* ignore */
            }
            router.push("/login");
          }}
        >
          I have an account: log in to save it
        </button>
      </div>
    </AuthSplit>
  );
}
