"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Lock, ScanLine, Users } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { useEvents } from "@/lib/store";
import { Role } from "@/lib/types";
import { getCaptureGate, windowFromEvent } from "@/lib/capture-window";
import { formatDate, formatTime } from "@/lib/utils";
import { QrScannerPanel } from "@/components/qr-scanner-panel";

const STAFF_ONLY: Role[] = ["staff"];

type Result = { kind: "success" | "already" | "error"; name?: string; message: string };

const resultStyles: Record<Result["kind"], { ring: string; bg: string; icon: React.ReactNode }> = {
  success: { ring: "ring-teal-100", bg: "bg-teal-100 text-teal-700", icon: <CheckCircle2 size={26} /> },
  already: { ring: "ring-amber-100", bg: "bg-amber-100 text-amber-700", icon: <Clock3 size={26} /> },
  error: { ring: "ring-rose-100", bg: "bg-rose-100 text-rose-700", icon: <AlertCircle size={26} /> },
};

export default function CheckinPage() {
  const session = useRequireRole(STAFF_ONLY);
  const [referenceId, setReferenceId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
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
        setResult({ kind: "error", message: json.error || "Couldn't check this attendee in." });
        return;
      }
      if (json.alreadyCheckedIn) {
        setResult({
          kind: "already",
          name: json.registration.fullName,
          message: `Already checked in at ${new Date(json.registration.checkedInAt).toLocaleTimeString()}`,
        });
      } else {
        setResult({ kind: "success", name: json.registration.fullName, message: "Checked in successfully" });
        setSessionCount((c) => c + 1);
      }
      setReferenceId("");
    } catch {
      setResult({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    checkIn(referenceId);
  }

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
              {gate.reason === "not_started" ? "Not open yet" : gate.reason === "manually_closed" ? "Check-in is closed" : "Check-in has ended"}
            </h2>
            <p className="text-slate-500">
              {gate.reason === "manually_closed"
                ? `Check-in for ${event.name} has been closed by the event organizer.`
                : gate.reason === "not_started"
                  ? `Check-in for ${event.name} opens ${formatDate(captureWindow!.date)}${captureWindow!.startTime ? ` at ${formatTime(captureWindow!.startTime)}` : ""}.`
                  : `Check-in for ${event.name} closed ${formatDate(captureWindow!.endDate || captureWindow!.date)}${captureWindow!.endTime ? ` at ${formatTime(captureWindow!.endTime)}` : ""}.`}
            </p>
            <p className="text-slate-400 text-sm mt-4">This page will unlock automatically once check-in opens.</p>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="p-6 max-w-md mx-auto">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="font-display text-2xl text-slate-900 flex items-center gap-2">
              <ScanLine size={22} className="text-[#1098F7]" />
              Check-In
            </h1>
            <p className="text-slate-500 text-sm mt-1">Scan an attendee&apos;s QR code, or enter their reference ID.</p>
          </div>
          {sessionCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-xs font-semibold shrink-0">
              <Users size={13} />
              {sessionCount}
            </div>
          )}
        </div>

        {result && (
          <div className={`flex items-center gap-4 p-4 mb-4 rounded-2xl border border-slate-200 bg-white ring-4 ${resultStyles[result.kind].ring}`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${resultStyles[result.kind].bg}`}>{resultStyles[result.kind].icon}</div>
            <div className="min-w-0">
              {result.name && <p className="text-base font-semibold text-slate-900 truncate">{result.name}</p>}
              <p className="text-sm text-slate-500">{result.message}</p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <QrScannerPanel onScan={checkIn} label="Camera scan" />
        </div>

        <form onSubmit={handleManualSubmit} className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Or enter code manually</h2>
          <div className="flex gap-2">
            <input
              value={referenceId}
              onChange={(e) => setReferenceId(e.target.value)}
              placeholder="e.g. K7QX-4R2M"
              className="flex-1 px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-[#1098F7]"
            />
            <button
              type="submit"
              disabled={submitting || !referenceId.trim()}
              className="px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-60 shrink-0"
              style={{ background: "#1098F7" }}
            >
              {submitting ? "Checking…" : "Check In"}
            </button>
          </div>
        </form>
      </div>
    </Shell>
  );
}
