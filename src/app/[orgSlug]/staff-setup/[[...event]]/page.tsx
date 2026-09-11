"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, KeyRound, MapPinCheckInside, Plus, UserRound } from "lucide-react";
import { loginAsStaff } from "@/lib/store";
import { Destination, EventRecord, University } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { EventPicker } from "@/components/event-picker";
import { EventSignInHero } from "@/components/event-signin-hero";
import { DarkAuroraShell } from "@/components/dark-aurora-shell";

type CheckinEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };

export default function StaffSetupPage() {
  const params = useParams<{ orgSlug: string; event?: string[] }>();
  const orgSlug = params.orgSlug;
  const router = useRouter();
  // A per-event share link (/staff-setup/<staff-checkin-slug-or-id>, or the short
  // root-level /<staff-checkin-slug> form once one's set — see [orgSlug]/page.tsx)
  // locks the flow to that one event and skips the "which event are you at?"
  // picker entirely — see CheckinLinksCard, which prefers the event's own
  // staffCheckinSlug (shorter, readable) when it has one, falling back to the
  // raw id otherwise.
  const pinnedEvent = params.event?.[0] ?? null;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [events, setEvents] = useState<CheckinEvent[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  // Names only — never the staff row's real id. That id is a bearer credential (see
  // store.ts's session model), so the public "who are you?" picker must never expose
  // it pre-auth; check-in resolves name -> row server-side, access-code gated.
  const [staffMembers, setStaffMembers] = useState<{ name: string }[]>([]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedStaffName, setSelectedStaffName] = useState<string | null>(null);
  const [newStaffName, setNewStaffName] = useState("");
  const [isNewStaff, setIsNewStaff] = useState(false);

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
        setStaffMembers(data.staff);
        const pinnedMatch = pinnedEvent && data.events.find((e: CheckinEvent) => e.id === pinnedEvent || e.staffCheckinSlug === pinnedEvent || e.slug === pinnedEvent);
        if (pinnedMatch) {
          setSelectedEventId(pinnedMatch.id);
          return;
        }
        // The pinned event isn't in the org's normal (published-only) list —
        // still let a draft event's own check-in link work, same fallback the
        // register page uses, so an organizer can set up/test check-in before
        // publishing.
        if (pinnedEvent) {
          const previewData = await fetch(`/api/orgs/${encodeURIComponent(orgSlug)}/events/${encodeURIComponent(pinnedEvent)}/preview`).then((res) => res.json());
          if (!previewData.error) {
            const draftEvent = previewData.event as CheckinEvent;
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
  const template = selectedEvent ? getTemplate(selectedEvent.templateId) : undefined;
  const usesDestinations = template?.usesDestinations ?? true;
  const availableUnis = selectedDestId ? universities.filter((u) => u.destinationId === selectedDestId) : [];
  const codeRequired = !!selectedEvent?.hasStaffCode;

  const handleStart = async () => {
    if (!selectedEventId) return;
    if (usesDestinations && (!selectedDestId || !selectedUniId)) return;
    if (!isNewStaff && !selectedStaffName) return;
    if (isNewStaff && !newStaffName.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      // Always by name, never by id — the server resolves an existing row (or
      // creates one) by name match, gated behind the event's access code either way.
      const result = await loginAsStaff(orgSlug, {
        name: isNewStaff ? newStaffName.trim() : selectedStaffName || "",
        eventId: selectedEventId,
        destinationId: usesDestinations ? selectedDestId! : undefined,
        universityId: usesDestinations ? selectedUniId! : undefined,
        code: accessCode,
      });
      if (!result.success) {
        setError(result.error || "Couldn't check you in.");
        return;
      }
      router.push("/collect");
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

  if (pinnedEvent && !selectedEventId) {
    return (
      <DarkAuroraShell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center text-white/60">
            <p className="font-medium text-white/90">This event&apos;s check-in link isn&apos;t valid anymore.</p>
            <p className="text-sm mt-1">Ask your event coordinator for the current staff check-in link.</p>
          </div>
        </div>
      </DarkAuroraShell>
    );
  }

  if (!selectedEventId) {
    return (
      <EventPicker
        eyebrow="Staff sign-in"
        title="Which event are you at?"
        subtitle={`Pick the fair you're collecting leads for to get started — ${orgName}.`}
        events={events}
        destinations={destinations}
        onSelect={setSelectedEventId}
        secondaryAction={{ label: "Admin Login", onClick: () => router.push("/login") }}
        variant="staff"
      />
    );
  }

  const isFormValid =
    selectedEventId &&
    (!usesDestinations || (selectedDestId && selectedUniId)) &&
    (isNewStaff ? newStaffName.trim().length > 0 : selectedStaffName) &&
    (!codeRequired || accessCode.trim().length > 0);

  if (!selectedEvent) return null;

  return (
    <DarkAuroraShell>
    <div className="min-h-screen pb-10">
      <div className="max-w-xl mx-auto px-6">
      <EventSignInHero
        eyebrow="Staff sign-in"
        event={selectedEvent}
        instruction="Pick your name, then the destination and school you're collecting for. It stays locked for every lead you add until you end the session."
        secondaryAction={pinnedEvent ? undefined : { label: "Back to events", onClick: () => setSelectedEventId(null) }}
        variant="staff"
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
                className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#1098F7]"
              />
            </section>
          )}
          <section>
            <h2 className="text-base font-bold text-white mb-3">1. Who are you?</h2>
            <div className="flex flex-wrap gap-2.5">
              {staffMembers.map((s) => (
                <button
                  key={s.name}
                  onClick={() => {
                    setIsNewStaff(false);
                    setSelectedStaffName(s.name);
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-colors ${
                    !isNewStaff && selectedStaffName === s.name
                      ? "border-[#1098F7] bg-[#1098F7] text-white"
                      : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  <UserRound size={14} className={!isNewStaff && selectedStaffName === s.name ? "text-white/70" : "text-white/40"} />
                  {s.name}
                </button>
              ))}
              <button
                onClick={() => {
                  setIsNewStaff(true);
                  setSelectedStaffName(null);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border border-dashed text-sm font-medium transition-colors ${
                  isNewStaff
                    ? "border-[#1098F7] bg-[#1098F7] text-white border-solid"
                    : "border-white/25 bg-transparent text-white/70 hover:bg-white/5"
                }`}
              >
                <Plus size={14} className={isNewStaff ? "text-white/70" : "text-white/40"} />
                New staff member
              </button>
            </div>

            {isNewStaff && (
              <div className="mt-4">
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-white/20 bg-white/5 text-white placeholder:text-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#1098F7]"
                  autoFocus
                />
              </div>
            )}
          </section>

          {usesDestinations && (
            <>
              <section>
                <h2 className="text-base font-bold text-white mb-3">2. Which destination?</h2>
                <div className="flex flex-wrap gap-2.5">
                  {destinations
                    .filter((d) => selectedEvent.destinationIds.includes(d.id))
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={() => {
                          setSelectedDestId(d.id);
                          setSelectedUniId(null);
                        }}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-colors ${
                          selectedDestId === d.id
                            ? "border-[#1098F7] bg-[#1098F7] text-white"
                            : "border-white/20 bg-white/5 text-white/80 hover:bg-white/10"
                        }`}
                      >
                        <span className="text-base leading-none">{d.flag}</span>
                        {d.name}
                      </button>
                    ))}
                </div>
              </section>

              <section>
                <h2 className="text-base font-bold text-white mb-3">3. Which school?</h2>
                <select
                  value={selectedUniId || ""}
                  onChange={(e) => setSelectedUniId(e.target.value)}
                  disabled={!selectedDestId}
                  className={`w-full px-4 py-3.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#1098F7] ${
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
            </>
          )}
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
              isFormValid && !submitting ? "bg-[#1098F7] text-white hover:bg-[#0b7dd1]" : "bg-white/10 text-white/30 cursor-not-allowed"
            }`}
          >
            {submitting ? "Checking in…" : "Start collecting leads"}
          </button>
          <p className="text-center text-xs text-white/50 mt-4 px-4 leading-relaxed">
            This locks the form so every lead you add is tagged correctly — no password needed on this device.
          </p>
        </div>
        </div>
      </div>
      </div>
    </div>
    </DarkAuroraShell>
  );
}
