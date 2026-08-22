"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, KeyRound, MapPinCheckInside } from "lucide-react";
import { loginAsRep } from "@/lib/store";
import { Destination, EventRecord, University } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { EventPicker } from "@/components/event-picker";
import { EventSignInHero } from "@/components/event-signin-hero";

type CheckinEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };

export default function RepLoginPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const router = useRouter();
  const searchParams = useSearchParams();
  // A per-event share link (?event=<id>) locks the flow to that one event and skips
  // the "which event are you viewing?" picker entirely — see CheckinLinksCard.
  const pinnedEventId = searchParams.get("event");

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
      .then((data) => {
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        setOrgName(data.organization.name);
        setEvents(data.events);
        setDestinations(data.destinations);
        setUniversities(data.universities);
        const events: CheckinEvent[] = data.events;
        if (pinnedEventId && events.some((e) => e.id === pinnedEventId && getTemplate(e.templateId).usesDestinations && e.allowRepAccess !== false)) {
          setSelectedEventId(pinnedEventId);
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <MapPinCheckInside size={26} className="text-[#610064]/40 animate-pulse" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500">
          <p className="font-medium text-slate-700">{loadError}</p>
          <p className="text-sm mt-1">Check the link your coordinator gave you and try again.</p>
        </div>
      </div>
    );
  }

  // Reps are scoped to a destination + university, which only the Education Fair
  // template has — other event types have no rep flow, so they're not selectable here.
  const repEligibleEvents = events.filter((e) => getTemplate(e.templateId).usesDestinations && e.allowRepAccess !== false);

  if (pinnedEventId && !selectedEventId) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center text-slate-500">
          <p className="font-medium text-slate-700">This event&apos;s check-in link isn&apos;t valid anymore.</p>
          <p className="text-sm mt-1">Ask your event coordinator for the current rep check-in link.</p>
        </div>
      </div>
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
    <div className="min-h-screen bg-slate-50 pb-10">
      <EventSignInHero
        eyebrow="Rep sign-in"
        event={selectedEvent}
        instruction="Select your destination and university to view the leads collected for your school."
        secondaryAction={
          pinnedEventId
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
      <div className="relative max-w-xl mx-auto px-4 -mt-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="space-y-8">
          {codeRequired && (
            <section>
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 mb-3">
                <KeyRound size={16} className="text-slate-400" />
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
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]"
              />
            </section>
          )}
          <section>
            <h2 className="text-base font-bold text-slate-900 mb-3">1. Which destination?</h2>
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
                        ? "border-[#610064] bg-[#610064] text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {d.name}
                  </button>
                ))}
            </div>
          </section>

          <section>
            <h2 className="text-base font-bold text-slate-900 mb-3">2. Which school?</h2>
            <select
              value={selectedUniId || ""}
              onChange={(e) => {
                setSelectedUniId(e.target.value);
                setError("");
              }}
              disabled={!selectedDestId}
              className={`w-full px-4 py-3.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#610064] bg-white ${
                !selectedDestId ? "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed border-dashed" : "border-slate-200 text-slate-800"
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
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-50 text-rose-700 text-sm">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleStart}
            disabled={!isFormValid || submitting}
            className={`w-full py-4 rounded-xl font-medium text-base transition-colors ${
              isFormValid && !submitting ? "bg-[#610064] text-white hover:bg-[#4c0050]" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {submitting ? "Checking in…" : "Check-In"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
