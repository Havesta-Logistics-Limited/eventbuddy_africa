"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, KeyRound, MapPinCheckInside } from "lucide-react";
import { loginAsRep } from "@/lib/store";
import { Destination, EventRecord, University } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { EventPicker } from "@/components/event-picker";
import { EventSignInHero } from "@/components/event-signin-hero";
import { DarkAuroraShell } from "@/components/dark-aurora-shell";

type CheckinEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };

export default function RepLoginPage() {
  const params = useParams<{ orgSlug: string; event?: string[] }>();
  const orgSlug = params.orgSlug;
  const router = useRouter();
  // A per-event share link (/rep-login/<rep-checkin-slug-or-id>, or the short
  // root-level /<rep-checkin-slug> form once one's set — see [orgSlug]/page.tsx)
  // locks the flow to that one event and skips the "which event are you
  // viewing?" picker entirely — see CheckinLinksCard, which prefers the
  // event's own repCheckinSlug when it has one.
  const pinnedEvent = params.event?.[0] ?? null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [events, setEvents] = useState<CheckinEvent[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedDestId, setSelectedDestId] = useState<string | null>(null);
  const [selectedUniId, setSelectedUniId] = useState<string | null>(null);
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events`)
      .then((res) => res.json())
      .then(async (data) => {
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        setOrgName(data.organization.name);
        setEvents(data.events);
        setDestinations(data.destinations);
        setUniversities(data.universities);
        const events: CheckinEvent[] = data.events;
        const pinnedMatch =
          pinnedEvent &&
          events.find(
            (e) => (e.id === pinnedEvent || e.repCheckinSlug === pinnedEvent || e.slug === pinnedEvent) && getTemplate(e.templateId).usesDestinations && e.allowRepAccess !== false
          );
        if (pinnedMatch) {
          setSelectedEventId(pinnedMatch.id);
          return;
        }
        // The pinned event isn't in the org's normal (published-only) list —
        // still let a draft event's own rep link work, same fallback the
        // register page uses, so an organizer can set up/test it before
        // publishing.
        if (pinnedEvent) {
          const previewData = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(pinnedEvent)}/preview`).then((res) => res.json());
          const draftEvent = previewData.event as CheckinEvent | undefined;
          if (draftEvent && getTemplate(draftEvent.templateId).usesDestinations && draftEvent.allowRepAccess !== false) {
            setEvents((prev) => [...prev, draftEvent]);
            setSelectedEventId(draftEvent.id);
          }
        }
      })
      .catch(() => setLoadError("Couldn't load this page. Check your connection and try again."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const availableUnis = selectedDestId ? universities.filter((u) => u.destinationId === selectedDestId) : [];
  const codeRequired = !!selectedEvent?.hasRepCode;

  const handleStart = async () => {
    if (!selectedEventId || !selectedDestId || !selectedUniId) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await loginAsRep(orgSlug, selectedEventId, selectedDestId, selectedUniId, accessCode);
      if (result.success) {
        router.push("/leads");
      } else {
        setError(result.message || "Failed to login.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DarkAuroraShell>
        <div className="min-h-screen flex items-center justify-center">
          <MapPinCheckInside size={26} className="text-white/40 animate-pulse" />
        </div>
      </DarkAuroraShell>
    );
  }

  if (loadError) {
    return (
      <DarkAuroraShell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center text-white/60">
            <p className="font-medium text-white/90">{loadError}</p>
            <p className="text-sm mt-1">Check the link your coordinator gave you and try again.</p>
          </div>
        </div>
      </DarkAuroraShell>
    );
  }

  // Reps are scoped to a destination + university, which only the Education Fair
  // template has — other event types have no rep flow, so they're not selectable here.
  const repEligibleEvents = events.filter((e) => getTemplate(e.templateId).usesDestinations && e.allowRepAccess !== false);

  if (pinnedEvent && !selectedEventId) {
    return (
      <DarkAuroraShell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center text-white/60">
            <p className="font-medium text-white/90">This event&apos;s check-in link isn&apos;t valid anymore.</p>
            <p className="text-sm mt-1">Ask your event coordinator for the current rep check-in link.</p>
          </div>
        </div>
      </DarkAuroraShell>
    );
  }

  if (!selectedEventId) {
    return (
      <EventPicker
        eyebrow="Rep sign-in"
        title="Which event are you viewing?"
        subtitle={`Pick the fair to view the leads collected for your university — ${orgName}.`}
        events={repEligibleEvents}
        destinations={destinations}
        onSelect={setSelectedEventId}
        secondaryAction={{ label: "Back to Login", onClick: () => router.push("/login") }}
        variant="rep"
      />
    );
  }

  const isFormValid = selectedEventId && selectedDestId && selectedUniId && (!codeRequired || accessCode.trim().length > 0);

  if (!selectedEvent) return null;

  return (
    <DarkAuroraShell>
    <div className="min-h-screen pb-10">
      <div className="max-w-xl mx-auto px-6">
      <EventSignInHero
        eyebrow="Rep sign-in"
        event={selectedEvent}
        instruction="Select your destination and university to view the leads collected for your school."
        secondaryAction={
          pinnedEvent
            ? undefined
            : {
                label: "Back to events",
                onClick: () => {
                  setSelectedEventId(null);
                  setError("");
                },
              }
        }
        variant="rep"
      />
      <div className="relative -mt-8">
        <div className="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl shadow-xl p-6">
        <div className="space-y-8">
          {codeRequired && (
            <section>
              <h2 className="flex items-center gap-2 text-base font-bold text-white mb-3">
                <KeyRound size={16} className="text-white/40" />
                Event access code
              </h2>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => {
                  setAccessCode(e.target.value);
                  setError("");
                }}
                placeholder="Enter the code provided by your event coordinator"
                className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]"
              />
            </section>
          )}
          <section>
            <h2 className="text-base font-bold text-white mb-3">1. Which destination?</h2>
            <div className="flex flex-wrap gap-2.5">
              {destinations
                .filter((d) => selectedEvent.destinationIds.includes(d.id))
                .map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelectedDestId(d.id);
                      setSelectedUniId(null);
                      setError("");
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-colors ${
                      selectedDestId === d.id
                        ? "border-[#C21FAF] bg-[#C21FAF] text-white"
                        : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-white mb-3">2. Which school?</h2>
            <select
              value={selectedUniId || ""}
              onChange={(e) => {
                setSelectedUniId(e.target.value);
                setError("");
              }}
              disabled={!selectedDestId}
              className={`w-full px-4 py-3.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF] ${
                !selectedDestId ? "border-white/10 border-dashed bg-white/5 text-white/30 cursor-not-allowed" : "border-white/20 bg-white/5 text-white"
              }`}
            >
              <option value="" disabled>
                Select a destination first.
              </option>
              {availableUnis.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </section>
        </div>

        <div className="mt-8 pt-4">
          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-400/10 text-rose-200 text-sm">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={!isFormValid || submitting}
            className={`w-full py-4 rounded-xl font-medium text-base transition-colors ${
              isFormValid && !submitting ? "bg-[#C21FAF] text-white hover:bg-[#93147D]" : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            {submitting ? "Checking in…" : "Check-In"}
          </button>
        </div>
        </div>
      </div>
      </div>
    </div>
    </DarkAuroraShell>
  );
}
