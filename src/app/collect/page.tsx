"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Lock, ScanLine } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { PersistError, addLead, useDestinations, useEvents, useUniversities } from "@/lib/store";
import { HighestEducation, IeltsStatus, LevelOfInterest, Role } from "@/lib/types";
import { getTemplate } from "@/lib/event-templates";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";
import { formatDate, formatTime } from "@/lib/utils";
import { DynamicLeadForm, type DynamicLeadFormValues } from "@/components/dynamic-lead-form";
import { QrScannerPanel } from "@/components/qr-scanner-panel";

const STAFF_ONLY: Role[] = ["staff"];

const START_YEARS = ["2026", "2027", "2028", "2029", "2030"];

type FormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredCourse: string;
  levelOfInterest: LevelOfInterest | "";
  startYear: string;
  highestEducation: HighestEducation | "";
  takenIELTS: IeltsStatus | "";
  comments: string;
};

const emptyForm: FormState = {
  firstName: "",
  middleName: "",
  lastName: "",
  email: "",
  phone: "",
  preferredCourse: "",
  levelOfInterest: "",
  startYear: "",
  highestEducation: "",
  takenIELTS: "",
  comments: "",
};

export default function LeadCollectPage() {
  const session = useRequireRole(STAFF_ONLY);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [count, setCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [, forceTick] = useState(0); // re-render so the locked screen unlocks itself, no manual refresh

  const [lookupRef, setLookupRef] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [pulledName, setPulledName] = useState("");
  const [pulledRegistrationId, setPulledRegistrationId] = useState<string | null>(null);
  const [alreadyCollected, setAlreadyCollected] = useState(false);

  const destinations = useDestinations();
  const universities = useUniversities();
  const events = useEvents();
  const dest = session?.destinationId ? destinations.find((d) => d.id === session.destinationId) : null;
  const uni = session?.universityId ? universities.find((u) => u.id === session.universityId) : null;
  const event = session?.eventId ? events.find((e) => e.id === session.eventId) : null;
  const template = getTemplate(event?.templateId);

  const captureWindow = event ? windowFromEvent(event) : null;
  const gate = captureWindow ? getCaptureGate(captureWindow, event?.timezone, event?.captureOverride) : null;

  useEffect(() => {
    if (!gate || gate.open) return;
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [gate?.open]);

  if (!session) return null;

  if (event && gate && !gate.open) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
              <Lock size={32} className="text-amber-500" />
            </div>
            <h2 className="font-display text-2xl text-slate-900 mb-2">
              {gate.reason === "not_started" ? "Not open yet" : gate.reason === "manually_closed" ? "Collection is closed" : "Collection has ended"}
            </h2>
            <p className="text-slate-500">
              {gate.reason === "manually_closed"
                ? `Lead capture for ${event.name} has been closed by the event organizer.`
                : gate.reason === "not_started"
                  ? `Lead capture for ${event.name} opens ${formatDate(captureWindow!.date)}${captureWindow!.startTime ? ` at ${formatTime(captureWindow!.startTime)}` : ""}.`
                  : `Lead capture for ${event.name} closed ${formatDate(captureWindow!.endDate || captureWindow!.date)}${captureWindow!.endTime ? ` at ${formatTime(captureWindow!.endTime)}` : ""}.`}
            </p>
            <p className="text-slate-400 text-sm mt-4">This page will unlock automatically once collection opens.</p>
          </div>
        </div>
      </Shell>
    );
  }

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function lookupRegistration(code: string) {
    if (!session?.id || !code.trim()) return;
    setLookupError("");
    setPulledName("");
    setPulledRegistrationId(null);
    setAlreadyCollected(false);
    setLookupLoading(true);
    try {
      const res = await fetch("/api/registrations/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: session.id, referenceId: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setLookupError(json.error || "Couldn't find that registration.");
        return;
      }
      if (json.alreadyCollected) {
        setAlreadyCollected(true);
        setLookupRef("");
        return;
      }
      const r = json.registration;
      setForm((f) => ({
        ...f,
        firstName: r.firstName || f.firstName,
        lastName: r.lastName || f.lastName,
        email: r.email || f.email,
        phone: r.phone || f.phone,
      }));
      setPulledName(`${r.firstName} ${r.lastName}`.trim());
      setPulledRegistrationId(r.id);
      setLookupRef("");
    } catch {
      setLookupError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLookupLoading(false);
    }
  }

  function handleLookupSubmit(e: React.FormEvent) {
    e.preventDefault();
    lookupRegistration(lookupRef);
  }

  const handleDynamicSubmit = async (values: DynamicLeadFormValues) => {
    if (!session.eventId) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      await addLead({
        eventId: session.eventId,
        staffId: session.id,
        firstName: values.firstName,
        middleName: values.middleName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        preferredCourse: "",
        levelOfInterest: "",
        startYear: "",
        highestEducation: "",
        takenIELTS: "",
        comments: values.comments,
        customAnswers: values.customAnswers,
      });
      setCount((c) => c + 1);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      setSubmitError(err instanceof PersistError ? err.message : "Couldn't save that lead. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session.destinationId || !session.universityId || !session.eventId) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      await addLead({
        eventId: session.eventId,
        destinationId: session.destinationId,
        universityId: session.universityId,
        staffId: session.id,
        registrationId: pulledRegistrationId ?? undefined,
        ...form,
        levelOfInterest: form.levelOfInterest as LevelOfInterest,
        highestEducation: form.highestEducation as HighestEducation,
        takenIELTS: form.takenIELTS as IeltsStatus,
      });
      setCount((c) => c + 1);
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setForm(emptyForm);
        setPulledName("");
        setPulledRegistrationId(null);
      }, 3000);
    } catch (err) {
      setSubmitError(err instanceof PersistError ? err.message : "Couldn't save that lead. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-staff-600 focus:border-transparent";
  const selectClass = `${fieldClass} cursor-pointer`;
  const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

  if (submitted) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-sky-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={40} className="text-sky-500" />
            </div>
            <h2 className="font-display text-2xl text-slate-900 mb-2">Lead captured!</h2>
            <p className="text-slate-500 mb-1">Record saved successfully.</p>
            <p className="text-sky-600 font-semibold text-lg">
              {count} lead{count !== 1 ? "s" : ""} collected today
            </p>
            <p className="text-slate-400 text-sm mt-3">Form resetting…</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (event && template.id !== "education-fair") {
    return (
      <Shell>
        <div className="min-h-screen bg-slate-50">
          <div className="sticky top-0 z-30 bg-[#04223d] text-white px-4 py-3">
            <div className="max-w-xl mx-auto flex items-center justify-between">
              <p className="font-semibold text-sm truncate max-w-[200px] sm:max-w-none">{event.name}</p>
              <div className="flex items-center gap-1.5 bg-amber-500/20 px-2.5 py-1 rounded-full">
                <Lock size={11} className="text-amber-300" />
                <span className="text-amber-200 text-xs font-medium">Locked</span>
              </div>
            </div>
          </div>

          <div className="max-w-xl mx-auto px-4 py-6">
            <div className="mb-5">
              <h1 className="font-display text-2xl text-slate-900">Attendee Registration</h1>
              <p className="text-slate-500 text-sm mt-1">Capture lead details for {event.name}</p>
            </div>

            <DynamicLeadForm fields={event.customFields ?? []} onSubmit={handleDynamicSubmit} submitting={submitting} submitError={submitError} />

            <p className="text-center text-xs text-slate-400 pt-4 pb-4">{count > 0 ? `${count} lead${count !== 1 ? "s" : ""} collected this session` : "No leads collected yet"}</p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-30 bg-[#04223d] text-white px-4 py-3">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            <div>
              {event && <p className="font-semibold text-sm truncate max-w-[200px] sm:max-w-none">{event.name}</p>}
              <div className="flex items-center gap-3 mt-0.5">
                {dest && (
                  <span className="text-sky-300 text-xs">
                    {dest.flag} {dest.name}
                  </span>
                )}
                {uni && <span className="text-white/50 text-xs">· {uni.shortName}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-500/20 px-2.5 py-1 rounded-full">
              <Lock size={11} className="text-amber-300" />
              <span className="text-amber-200 text-xs font-medium">Locked</span>
            </div>
          </div>
        </div>

        <div className="max-w-xl mx-auto px-4 py-6">
          <div className="mb-5">
            <h1 className="font-display text-2xl text-slate-900">Attendee Registration</h1>
            <p className="text-slate-500 text-sm mt-1">Capture lead details for {uni?.name || "your university"}</p>
          </div>

          <div className="mb-5 space-y-3">
            <QrScannerPanel
              onScan={lookupRegistration}
              label="Scan to pull attendee details"
              helperText="Scan a registered attendee's QR code to fill in their name, email, and phone — or use manual entry below."
            />
            <form onSubmit={handleLookupSubmit} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                <ScanLine size={13} className="text-slate-400" />
                Manual reference ID
              </div>
              <div className="flex gap-2">
                <input
                  value={lookupRef}
                  onChange={(e) => setLookupRef(e.target.value)}
                  placeholder="e.g. K7QX-4R2M"
                  className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-staff-600"
                />
                <button
                  type="submit"
                  disabled={lookupLoading || !lookupRef.trim()}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-staff-600 hover:bg-staff-700 disabled:opacity-60 transition-[transform,background-color] active:scale-[0.97]"
                >
                  {lookupLoading ? "Looking up…" : "Pull details"}
                </button>
              </div>
              {pulledName && <p className="text-xs text-teal-600 mt-2">Pulled details for {pulledName} — review below before submitting.</p>}
              {alreadyCollected && (
                <p className="text-xs text-amber-600 mt-2">
                  This attendee&apos;s data has already been collected for {uni?.name || "your university"}. Scan a different attendee, or ask them to visit another
                  university&apos;s booth.
                </p>
              )}
              {lookupError && <p className="text-xs text-rose-600 mt-2">{lookupError}</p>}
            </form>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Personal Information</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>First Name *</label>
                  <input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={fieldClass} placeholder="Emeka" />
                </div>
                <div>
                  <label className={labelClass}>Middle Name</label>
                  <input value={form.middleName} onChange={(e) => set("middleName", e.target.value)} className={fieldClass} placeholder="Chukwudi" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Last Name *</label>
                <input required value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={fieldClass} placeholder="Adeyemi" />
              </div>
              <div>
                <label className={labelClass}>Email Address *</label>
                <input required type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={fieldClass} placeholder="emeka@example.com" />
              </div>
              <div>
                <label className={labelClass}>Phone Number *</label>
                <input required type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={fieldClass} placeholder="+234 800 000 0000" />
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Academic Interest</h2>

              <div>
                <label className={labelClass}>Destination</label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-sky-200 bg-sky-50 text-sm text-sky-800">
                  <Lock size={13} className="text-sky-500 shrink-0" />
                  {dest ? `${dest.flag} ${dest.name}` : "—"}
                </div>
              </div>
              <div>
                <label className={labelClass}>University</label>
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-sky-200 bg-sky-50 text-sm text-sky-800">
                  <Lock size={13} className="text-sky-500 shrink-0" />
                  {uni ? uni.name : "—"}
                </div>
              </div>

              <div>
                <label className={labelClass}>Preferred Course *</label>
                <input required value={form.preferredCourse} onChange={(e) => set("preferredCourse", e.target.value)} className={fieldClass} placeholder="e.g. Computer Science" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Level of Interest *</label>
                  <select required value={form.levelOfInterest} onChange={(e) => set("levelOfInterest", e.target.value)} className={selectClass}>
                    <option value="">Select level</option>
                    <option value="BSc">BSc</option>
                    <option value="MSc">MSc</option>
                    <option value="PhD">PhD</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Desired Start Year *</label>
                  <select required value={form.startYear} onChange={(e) => set("startYear", e.target.value)} className={selectClass}>
                    <option value="">Select year</option>
                    {START_YEARS.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Qualifications</h2>
              <div>
                <label className={labelClass}>Highest Level of Education *</label>
                <select required value={form.highestEducation} onChange={(e) => set("highestEducation", e.target.value)} className={selectClass}>
                  <option value="">Select education level</option>
                  <option value="Undergraduate">Undergraduate</option>
                  <option value="BSc">BSc</option>
                  <option value="MSc">MSc</option>
                  <option value="PhD">PhD</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Taken IELTS? *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["No", "Yes", "Registered"] as const).map((val) => (
                    <label
                      key={val}
                      className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                        form.takenIELTS === val ? "border-sky-500 bg-sky-50 text-sky-800 font-medium" : "border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <input
                        type="radio"
                        name="ielts"
                        value={val}
                        checked={form.takenIELTS === val}
                        onChange={() => set("takenIELTS", val)}
                        className="sr-only"
                        required={form.takenIELTS === ""}
                      />
                      {val}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <label className={labelClass}>Additional Comments</label>
              <textarea
                rows={3}
                value={form.comments}
                onChange={(e) => set("comments", e.target.value)}
                placeholder="Any notes, questions, or special requirements…"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-staff-600 resize-none"
              />
            </div>

            {submitError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 text-rose-700 text-sm">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-semibold text-white text-base bg-staff-600 hover:bg-staff-700 disabled:opacity-60 transition-[transform,background-color] active:scale-[0.98]"
            >
              {submitting ? "Saving…" : "Save Lead"}
            </button>
            <p className="text-center text-xs text-slate-400 pb-4">{count > 0 ? `${count} lead${count !== 1 ? "s" : ""} collected this session` : "No leads collected yet"}</p>
          </form>
        </div>
      </div>
    </Shell>
  );
}
