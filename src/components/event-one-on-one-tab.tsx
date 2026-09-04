"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, Mail, Phone } from "lucide-react";
import { EventOneOnOneRequest } from "@/lib/types";
import { PersistError, updateEvent, updateOneOnOneRequest } from "@/lib/store";

const STATUS_LABEL: Record<EventOneOnOneRequest["status"], string> = { pending: "Pending", assigned: "Assigned", done: "Done" };
const STATUS_COLOR: Record<EventOneOnOneRequest["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  assigned: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
};

function RequestRow({ request }: { request: EventOneOnOneRequest }) {
  const [assignment, setAssignment] = useState(request.assignment || "");
  const [saving, setSaving] = useState(false);

  async function saveAssignment() {
    if (assignment.trim() === (request.assignment || "")) return;
    setSaving(true);
    try {
      await updateOneOnOneRequest(request.id, { assignment: assignment.trim(), status: request.status === "pending" && assignment.trim() ? "assigned" : undefined });
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't save this assignment.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(status: EventOneOnOneRequest["status"]) {
    try {
      await updateOneOnOneRequest(request.id, { status });
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update status.");
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{request.fullName}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
            <span className="flex items-center gap-1">
              <Mail size={11} />
              {request.email}
            </span>
            {request.phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} />
                {request.phone}
              </span>
            )}
            <span>{new Date(request.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          </div>
          {request.note && <p className="text-sm text-slate-600 mt-2 italic">&quot;{request.note}&quot;</p>}
        </div>
        <select
          value={request.status}
          onChange={(e) => handleStatusChange(e.target.value as EventOneOnOneRequest["status"])}
          className={`text-xs font-medium px-2.5 py-1 rounded-full border-0 shrink-0 ${STATUS_COLOR[request.status]}`}
        >
          {(Object.keys(STATUS_LABEL) as EventOneOnOneRequest["status"][]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
        <input
          value={assignment}
          onChange={(e) => setAssignment(e.target.value)}
          onBlur={saveAssignment}
          placeholder="Assign to a booth, room, or speaker…"
          disabled={saving}
          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:opacity-60"
        />
      </div>
    </div>
  );
}

/** Manages the "Book a 1-on-1" step attendees see right after registering (see
 *  RegisterPageContent) — deliberately just an interest flag, not a speaker or
 *  time-slot picker. The organizer reviews requests here and decides the actual
 *  matching themselves, recording it as free text once they have. */
export function OneOnOneTab({ eventId, oneOnOneEnabled, requests }: { eventId: string; oneOnOneEnabled: boolean; requests: EventOneOnOneRequest[] }) {
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      await updateEvent(eventId, { oneOnOneEnabled: !oneOnOneEnabled });
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't update this setting.");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-5 p-4 rounded-xl border border-slate-200 bg-slate-50">
        <div className="flex items-center gap-2.5">
          <HeartHandshake size={16} className="text-slate-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-800">1-on-1 requests</p>
            <p className="text-xs text-slate-500">Attendees can say they&apos;re interested in a 1-on-1 right after registering — you decide who they meet.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={oneOnOneEnabled}
          onClick={handleToggle}
          disabled={toggling}
          className={`relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50 ${oneOnOneEnabled ? "bg-brand-600" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${oneOnOneEnabled ? "translate-x-4" : ""}`} />
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-16 text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
          <HeartHandshake size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">{oneOnOneEnabled ? "No requests yet." : "Turn this on to start collecting 1-on-1 requests."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} />
          ))}
        </div>
      )}
    </div>
  );
}
