"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Lock, ScanLine, Users } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { useEvents } from "@/lib/store";
import { Role } from "@/lib/types";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";
import { formatDate, formatTime } from "@/lib/utils";
import { FastScanStage, type ScanFlash } from "@/components/fast-scan-stage";
import { playScanFeedback, unlockScanAudio } from "@/lib/scan-feedback";
import { AuthLoading } from "@/components/auth-loading";

const STAFF_ONLY: Role[] = ["staff"];

type Result = { kind: "success" | "already" | "error"; name?: string; message: string };

// Big, solid result states: read at arm's length at a bright venue door.
const RESULT: Record<Result["kind"], { icon: React.ReactNode; title: string }> = {
  success: { icon: <CheckCircle2 size={34} strokeWidth={2.4} />, title: "Checked in" },
  already: { icon: <Clock3 size={34} strokeWidth={2.4} />, title: "Already checked in" },
  error: { icon: <AlertCircle size={34} strokeWidth={2.4} />, title: "Can't check in" },
};

export default function CheckinPage() {
  const session = useRequireRole(STAFF_ONLY);
  const [referenceId, setReferenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [flash, setFlash] = useState<ScanFlash | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every outcome gets its own sound, vibration and full-frame colour over the
  // camera (green / amber / red), as well as the banner above it.
  function announce(r: Result) {
    setResult(r);
    playScanFeedback(r.kind);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlash({ key: Date.now(), outcome: r.kind, title: RESULT[r.kind].title, name: r.name, message: r.message });
    flashTimerRef.current = setTimeout(() => setFlash(null), 2600);
  }
  const submittingRef = useRef(false);
  const [, forceTick] = useState(0); // re-render so the locked screen unlocks itself, no manual refresh

  const events = useEvents();
  const event = session?.eventId ? events.find((e) => e.id === session.eventId) : null;
  const captureWindow = event ? windowFromEvent(event) : null;
  const gate = captureWindow ? getCaptureGate(captureWindow, event?.timezone, event?.captureOverride) : null;

  useEffect(() => {
    if (!gate || gate.open) return;
    const id = setInterval(() => forceTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [gate?.open]);

  async function checkIn(code: string) {
    if (!session || submittingRef.current || !code.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: session.id, referenceId: code.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        announce({ kind: "error", message: json.error || "Couldn't check this attendee in." });
        return;
      }
      if (json.alreadyCheckedIn) {
        announce({
          kind: "already",
          name: json.registration.fullName,
          message: `Already checked in at ${new Date(json.registration.checkedInAt).toLocaleTimeString()}`,
        });
      } else {
        announce({ kind: "success", name: json.registration.fullName, message: "Checked in successfully" });
        setSessionCount((c) => c + 1);
      }
      setReferenceId("");
    } catch {
      announce({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    unlockScanAudio();
    checkIn(referenceId);
  }

  if (!session) return <AuthLoading />;

  if (event && gate && !gate.open) {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-5">
              <Lock size={32} className="text-amber-400" />
            </div>
            <h2 className="font-display text-2xl text-fg mb-2">
              {gate.reason === "not_started" ? "Not open yet" : gate.reason === "manually_closed" ? "Check-in is closed" : "Check-in has ended"}
            </h2>
            <p className="text-muted">
              {gate.reason === "manually_closed"
                ? `Check-in for ${event.name} has been closed by the event organizer.`
                : gate.reason === "not_started"
                  ? `Check-in for ${event.name} opens ${formatDate(captureWindow!.date)}${captureWindow!.startTime ? ` at ${formatTime(captureWindow!.startTime)}` : ""}.`
                  : `Check-in for ${event.name} closed ${formatDate(captureWindow!.endDate || captureWindow!.date)}${captureWindow!.endTime ? ` at ${formatTime(captureWindow!.endTime)}` : ""}.`}
            </p>
            <p className="text-subtle text-sm mt-4">This page will unlock automatically once check-in opens.</p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="eb-staff p-4 sm:p-8 max-w-6xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="eb-app-title flex items-center gap-2.5">
              <ScanLine size={26} className="text-[var(--pt-a)]" aria-hidden="true" />
              Check-In
            </h1>
            <p className="eb-app-sub">Scan an attendee&apos;s QR code, or type their reference ID.</p>
          </div>
          <div className="eb-staff-count" aria-live="polite">
            <Users size={15} aria-hidden="true" />
            <span>
              <b>{sessionCount}</b> checked in
            </span>
          </div>
        </div>

        <div className="mb-4">
          <FastScanStage onScan={checkIn} flash={flash} />
        </div>

        {/* last result, under the camera so the picture never jumps */}
        {result && (
          // key re-mounts it so the pop plays again for every scan
          <div key={`${result.kind}-${result.name}-${sessionCount}-${result.message}`} className="eb-scan-result" data-kind={result.kind} role="status" aria-live="assertive">
            <span className="eb-scan-result-icon" aria-hidden="true">{RESULT[result.kind].icon}</span>
            <div className="min-w-0">
              <p className="eb-scan-result-title">{RESULT[result.kind].title}</p>
              {result.name && <p className="eb-scan-result-name">{result.name}</p>}
              <p className="eb-scan-result-msg">{result.message}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleManualSubmit} className="eb-card p-5 max-w-2xl">
          <label htmlFor="ck-ref" className="eb-label">Or enter the reference ID</label>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <input
              id="ck-ref"
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="e.g. K7QX-4R2M"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="eb-input eb-ref-input"
            />
            <button type="submit" disabled={submitting || !referenceId.trim()} className="eb-portal-cta sm:w-auto sm:px-7">
              {submitting ? "Checking…" : "Check in"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
