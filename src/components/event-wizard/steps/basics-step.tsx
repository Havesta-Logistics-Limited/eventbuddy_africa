"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { compressImageFile } from "@/lib/utils";
import type { EventWizardData } from "../types";

const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#610064]";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

export function BasicsStep({ data, onChange }: { data: EventWizardData; onChange: (patch: Partial<EventWizardData>) => void }) {
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");

  const isVirtual = data.eventFormat === "virtual";

  return (
    <>
      <div>
        <label className={labelClass}>Event Name</label>
        <input
          required
          value={data.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Global Careers Expo 2027 — Lagos"
          className={fieldClass}
        />
      </div>
      <div>
        <label className={labelClass}>Format</label>
        <div className="grid grid-cols-2 gap-2">
          {(["physical", "virtual"] as const).map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => onChange({ eventFormat: format })}
              className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                (data.eventFormat || "physical") === format
                  ? "border-[#610064] bg-[#610064] text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {format === "physical" ? "In-person" : "Virtual"}
            </button>
          ))}
        </div>
      </div>
      {!isVirtual && (
        <label className="flex items-start gap-2.5 p-3 rounded-lg border border-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={data.selfRegistrationEnabled ?? true}
            onChange={(e) => onChange({ selfRegistrationEnabled: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded border-slate-300 text-[#610064] focus:ring-[#610064]"
          />
          <span>
            <span className="block text-sm font-medium text-slate-700">Allow self-service registration</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              {data.selfRegistrationEnabled === false
                ? "Off — no public sign-up link. Staff capture every lead directly at the booth, walk-up, no QR code needed."
                : "On — attendees can pre-register and get a QR code to check in with."}
            </span>
          </span>
        </label>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Start Date</label>
          <input required type="date" value={data.date} onChange={(e) => onChange({ date: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>End Date</label>
          <input type="date" value={data.endDate || ""} onChange={(e) => onChange({ endDate: e.target.value })} className={fieldClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Start Time</label>
          <input type="time" value={data.startTime || ""} onChange={(e) => onChange({ startTime: e.target.value })} className={fieldClass} />
        </div>
        <div>
          <label className={labelClass}>End Time</label>
          <input type="time" value={data.endTime || ""} onChange={(e) => onChange({ endTime: e.target.value })} className={fieldClass} />
        </div>
      </div>
      {data.timezone && <p className="text-xs text-slate-400 -mt-2">Times shown in {data.timezone}</p>}
      {isVirtual ? (
        <>
          <div>
            <label className={labelClass}>Join Link</label>
            <input
              required
              type="url"
              value={data.virtualJoinUrl || ""}
              onChange={(e) => onChange({ virtualJoinUrl: e.target.value })}
              placeholder="e.g. https://zoom.us/j/1234567890"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Platform</label>
            <input
              value={data.virtualPlatform || ""}
              onChange={(e) => onChange({ virtualPlatform: e.target.value })}
              placeholder="e.g. Zoom, Google Meet, YouTube Live"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass}>Access Notes</label>
            <textarea
              rows={2}
              value={data.virtualAccessNotes || ""}
              onChange={(e) => onChange({ virtualAccessNotes: e.target.value })}
              placeholder="Meeting ID, passcode, or other joining instructions…"
              className={`${fieldClass} resize-none`}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={labelClass}>Venue</label>
            <input required value={data.venue} onChange={(e) => onChange({ venue: e.target.value })} placeholder="e.g. Eko Hotel & Suites" className={fieldClass} />
          </div>
          <div>
            <label className={labelClass}>Location (City, Country)</label>
            <input required value={data.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="e.g. Lagos, Nigeria" className={fieldClass} />
          </div>
        </>
      )}
      <div>
        <label className={labelClass}>Description</label>
        <textarea rows={2} value={data.description} onChange={(e) => onChange({ description: e.target.value })} className={`${fieldClass} resize-none`} />
      </div>
      <div>
        <label className={labelClass}>Cover Image</label>
        <div className="space-y-3">
          {data.coverImage && (
            <div className="w-full h-32 rounded-lg overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.coverImage} alt="Cover preview" className="w-full h-full object-cover" />
            </div>
          )}
          <input
            type="url"
            value={data.coverImage || ""}
            onChange={(e) => {
              setImageUploadError("");
              onChange({ coverImage: e.target.value });
            }}
            placeholder="Paste image URL..."
            className={fieldClass}
          />
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">or</span>
            <label className="cursor-pointer flex-1 text-center py-2 px-3 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-[#610064] transition-colors">
              {imageUploading ? (
                <span className="inline-flex items-center gap-1.5 justify-center">
                  <Loader2 size={14} className="animate-spin" />
                  Compressing image…
                </span>
              ) : (
                "Upload from device"
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={imageUploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setImageUploadError("");
                  setImageUploading(true);
                  try {
                    const dataUrl = await compressImageFile(file);
                    onChange({ coverImage: dataUrl });
                  } catch (err) {
                    setImageUploadError(err instanceof Error ? err.message : "Couldn't process that image.");
                  } finally {
                    setImageUploading(false);
                  }
                }}
              />
            </label>
          </div>
          {imageUploadError && (
            <p className="flex items-start gap-1.5 text-xs text-rose-600">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {imageUploadError}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
