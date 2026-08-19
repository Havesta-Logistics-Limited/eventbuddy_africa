"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, KeyRound, MapPinCheckInside, Plus, UserRound } from "lucide-react";
import { loginAsStaff } from "@/lib/store";
import { Destination, EventRecord, University } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { EventPicker } from "@/components/event-picker";
import { EventSignInHero } from "@/components/event-signin-hero";

type CheckinEvent = EventRecord & { hasStaffCode: boolean; hasRepCode: boolean };

export default function StaffSetupPage() {
  const params = useParams<{ orgSlug: string }>();
  const orgSlug = params.orgSlug;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [events, setEvents] = useState<CheckinEvent[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [universities, setUniversities] = useState<University[]>([]);
  const [staffMembers, setStaffMembers] = useState<{ id: string; name: string }[]>([]);

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
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
      .then((data) => {
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        setOrgName(data.organization.name);
        setEvents(data.events);
        setDestinations(data.destinations);
        setUniversities(data.universities);
        setStaffMembers(data.staff);
      })
      .catch(() => setLoadError("Couldn't load this page. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const template = selectedEvent ? getTemplate(selectedEvent.templateId) : undefined;
  const usesDestinations = template?.usesDestinations ?? true;
  const availableUnis = selectedDestId ? universities.filter((u) => u.destinationId === selectedDestId) : [];
  const codeRequired = !!selectedEvent?.hasStaffCode;

  const handleStart = async () => {
    if (!selectedEventId) return;
    if (usesDestinations && (!selectedDestId || !selectedUniId)) return;
    if (!isNewStaff && !selectedStaffId) return;
    if (isNewStaff && !newStaffName.trim()) return;
    setError("");
    setSubmitting(true);
    try {
      const result = await loginAsStaff(orgSlug, {
        id: isNewStaff ? undefined : selectedStaffId!,
        name: isNewStaff ? newStaffName.trim() : staffMembers.find((s) => s.id === selectedStaffId)?.name || "",
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
    (isNewStaff ? newStaffName.trim().length > 0 : selectedStaffId) &&
    (!codeRequired || accessCode.trim().length > 0);

  if (!selectedEvent) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      <EventSignInHero
        eyebrow="Staff sign-in"
        event={selectedEvent}
        instruction="Pick your name, then the destination and school you're collecting for. It stays locked for every lead you add until you end the session."
        secondaryAction={{ label: "Back to events", onClick: () => setSelectedEventId(null) }}
        variant="staff"
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
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1098F7]"
              />
            </section>
          )}
          <section>
            <h2 className="text-base font-bold text-slate-900 mb-3">1. Who are you?</h2>
            <div className="flex flex-wrap gap-2.5">
              {staffMembers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setIsNewStaff(false);
                    setSelectedStaffId(s.id);
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-colors ${
                    !isNewStaff && selectedStaffId === s.id
                      ? "border-[#1098F7] bg-[#1098F7] text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <UserRound size={14} className={!isNewStaff && selectedStaffId === s.id ? "text-white/70" : "text-slate-400"} />
                  {s.name}
                </button>
              ))}
              <button
                onClick={() => {
                  setIsNewStaff(true);
                  setSelectedStaffId(null);
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full border border-dashed text-sm font-medium transition-colors ${
                  isNewStaff
                    ? "border-[#1098F7] bg-[#1098F7] text-white border-solid"
                    : "border-slate-300 bg-transparent text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Plus size={14} className={isNewStaff ? "text-white/70" : "text-slate-400"} />
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
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1098F7]"
                  autoFocus
                />
              </div>
            )}
          </section>

          {usesDestinations && (
            <>
              <section>
                <h2 className="text-base font-bold text-slate-900 mb-3">2. Which destination?</h2>
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
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                        }`}
                      >
                        <span className="text-base leading-none">{d.flag}</span>
                        {d.name}
                      </button>
                    ))}
                </div>
              </section>

              <section>
                <h2 className="text-base font-bold text-slate-900 mb-3">3. Which school?</h2>
                <select
                  value={selectedUniId || ""}
                  onChange={(e) => setSelectedUniId(e.target.value)}
                  disabled={!selectedDestId}
                  className={`w-full px-4 py-3.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#1098F7] bg-white ${
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
            </>
          )}
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
              isFormValid && !submitting ? "bg-[#1098F7] text-white hover:bg-[#0b7dd1]" : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {submitting ? "Checking in…" : "Start collecting leads"}
          </button>
          <p className="text-center text-xs text-slate-500 mt-4 px-4 leading-relaxed">
            This locks the form so every lead you add is tagged correctly — no password needed on this device.
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}
