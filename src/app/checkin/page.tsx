"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Lock, ScanLine, Users, CalendarClock } from "lucide-react";
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

  // Early check-in: before the event's start time the server holds the scan
  // and asks. Staff can check that person in anyway, skip, or stop being asked
  // for the rest of this session (the event's times never change).
  const [earlyPrompt, setEarlyPrompt] = useState<{ code: string; name: string; opensAt: string } | null>(null);
  const [skipEarlyAsk, setSkipEarlyAsk] = useState(false);
  const skipEarlyAskRef = useRef(false);
  const earlyDoneRef = useRef<(() => void) | null>(null);

  function finishEarly() {
    setEarlyPrompt(null);
    setFlash(null);
    earlyDoneRef.current?.();
    earlyDoneRef.current = null;
  }

  async function confirmEarly(code: string) {
    finishEarly();
    await checkIn(code, true);
  }

  function askEarly(code: string, name: string, opensAt: string): Promise<void> {
    playScanFeedback("early");
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    const opens = new Date(opensAt).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    setEarlyPrompt({ code, name, opensAt });
    setFlash({
      key: Date.now(),
      outcome: "early",
      title: "Event hasn't started",
      name,
      message: `The event starts ${opens}.`,
      actions: {
        primary: { label: "Check in anyway", onClick: () => void confirmEarly(code) },
        secondary: { label: "Not yet", onClick: finishEarly },
      },
    });
    // the camera stays paused until staff decide
    return new Promise((resolve) => {
      earlyDoneRef.current = resolve;
    });
  }

  async function checkIn(code: string, allowEarly = false): Promise<void> {
    if (!session || submittingRef.current || !code.trim()) return;
    submittingRef.current = true;
    setSubmitting(true);
    setResult(null);
    let early: { name: string; opensAt: string } | null = null;
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId: session.id, referenceId: code.trim(), allowEarly: allowEarly || skipEarlyAskRef.current }),
      });
      const json = await res.json();
      if (json.early) {
        // handled after the request settles (below), so the prompt can wait for staff
        early = { name: json.registration.fullName, opensAt: json.opensAt };
      } else if (!res.ok) {
        announce({ kind: "error", message: json.error || "Couldn't check this attendee in." });
      } else if (json.alreadyCheckedIn) {
        announce({
          kind: "already",
          name: json.registration.fullName,
          message: `Already checked in at ${new Date(json.registration.checkedInAt).toLocaleTimeString()}`,
        });
      } else {
        announce({ kind: "success", name: json.registration.fullName, message: allowEarly || skipEarlyAskRef.current ? "Checked in early" : "Checked in successfully" });
        setSessionCount((c) => c + 1);
      }
      // keep a mistyped code in the box so it can be corrected
      if (res.ok) setReferenceId("");
    } catch {
      announce({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
    if (early) {
      setReferenceId("");
      await askEarly(code.trim(), early.name, early.opensAt);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    unlockScanAudio();
    checkIn(referenceId);
  }

  if (!session) return <AuthLoading />;

  // Before the start the page stays usable (early check-in, see above); only a
  // finished or organizer-closed check-in locks it.
  if (event && gate && !gate.open && gate.reason !== "not_started") {
    return (
      <Shell>
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-full bg-amber-500/15 flex items-center justify-center mx-auto mb-5">
              <Lock size={32} className="text-amber-400" />
            </div>
            <h2 className="font-display text-2xl text-fg mb-2">
              {gate.reason === "manually_closed" ? "Check-in is closed" : "Check-in has ended"}
            </h2>
            <p className="text-muted">
              {gate.reason === "manually_closed"
                ? `Check-in for ${event.name} has been closed by the event organizer.`
                : `Check-in for ${event.name} closed ${formatDate(captureWindow!.endDate || captureWindow!.date)}${captureWindow!.endTime ? ` at ${formatTime(captureWindow!.endTime)}` : ""}.`}
            </p>
            {gate.reason === "manually_closed" && <p className="text-subtle text-sm mt-4">This page unlocks automatically if the organizer reopens it.</p>}
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

        {event && gate && !gate.open && gate.reason === "not_started" && (
          <div className="eb-early-note" role="note">
            <CalendarClock size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold text-white">
                {event.name} hasn&apos;t started yet. It starts {formatDate(captureWindow!.date)}
                {captureWindow!.startTime ? ` at ${formatTime(captureWindow!.startTime)}` : ""}.
              </p>
              <p className="mt-0.5">Check-in is open for early arrivals: each scan asks you to confirm.</p>
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-white">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={skipEarlyAsk}
                  onChange={(e) => {
                    setSkipEarlyAsk(e.target.checked);
                    skipEarlyAskRef.current = e.target.checked;
                  }}
                />
                Check everyone in early without asking (this session only)
              </label>
            </div>
          </div>
        )}

        <div className="mb-4">
          <FastScanStage onScan={checkIn} flash={flash} />
        </div>

        {earlyPrompt && (
          <div className="eb-scan-result" data-kind="early" role="alertdialog" aria-label="Event hasn't started">
            <span className="eb-scan-result-icon" aria-hidden="true">
              <CalendarClock size={34} strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eb-scan-result-title">Event hasn&apos;t started</p>
              <p className="eb-scan-result-name">{earlyPrompt.name}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="eb-scanflash-btn" data-primary onClick={() => void confirmEarly(earlyPrompt.code)}>
                  Check in anyway
                </button>
                <button type="button" className="eb-scanflash-btn" onClick={finishEarly}>
                  Not yet
                </button>
              </div>
            </div>
          </div>
        )}

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
