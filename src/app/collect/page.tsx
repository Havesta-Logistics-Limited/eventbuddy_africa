"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { PersistError, addLead, getDestinationById, getEventById, getUniversityById } from "@/lib/store";
import { HighestEducation, IeltsStatus, LevelOfInterest, Role } from "@/lib/types";

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

  const dest = session?.destinationId ? getDestinationById(session.destinationId) : null;
  const uni = session?.universityId ? getUniversityById(session.universityId) : null;
  const event = session?.eventId ? getEventById(session.eventId) : null;

  if (!session) return null;

  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
      }, 3000);
    } catch (err) {
      setSubmitError(err instanceof PersistError ? err.message : "Couldn't save that lead. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1098F7] focus:border-transparent";
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
                        form.takenIELTS === val ? "border-sky-500 bg-sky-50 text-sky-800 font-medium" : "border-slate-200 text-slate-600 hover:border-slate-300"
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
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1098F7] resize-none"
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
              className="w-full py-3.5 rounded-xl font-semibold text-white text-base disabled:opacity-60"
              style={{ background: "#1098F7" }}
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
