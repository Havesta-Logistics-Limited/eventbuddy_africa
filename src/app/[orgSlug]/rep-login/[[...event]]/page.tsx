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
      <DarkAuroraShell tone="rep">
        <div className="min-h-screen flex items-center justify-center">
          <MapPinCheckInside size={26} className="text-white/40 animate-pulse" />
        </div>
      </DarkAuroraShell>
    );
  }

  if (loadError) {
    return (
      <DarkAuroraShell tone="rep">
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
      <DarkAuroraShell tone="rep">
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
    <DarkAuroraShell tone="rep">
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
        <div className="eb-portal-card">
        <div className="space-y-8">
          {codeRequired && (
            <section>
              <h2 className="eb-portal-step">
                <KeyRound size={16} className="text-white/60" aria-hidden="true" />
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
                className="eb-input"
              />
            </section>
          )}
          <section>
            <h2 className="eb-portal-step"><b>1</b> Which destination?</h2>
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
                    type="button"
                    aria-pressed={selectedDestId === d.id}
                    className="eb-chip"
                  >
                    {d.name}
                  </button>
                ))}
            </div>
          </section>

          <section>
            <h2 className="eb-portal-step"><b>2</b> Which school?</h2>
            <select
              value={selectedUniId || ""}
              onChange={(e) => {
                setSelectedUniId(e.target.value);
                setError("");
              }}
              disabled={!selectedDestId}
              className="eb-input disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="eb-alert mb-4" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={!isFormValid || submitting}
            className="eb-portal-cta"
          >
            {submitting ? "Checking in…" : "View my leads"}
          </button>
        </div>
        </div>
      </div>
      </div>
    </div>
    </DarkAuroraShell>
  );
}
