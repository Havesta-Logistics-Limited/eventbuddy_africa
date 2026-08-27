"use client";

import { useState } from "react";
import { AlertCircle, Crop, Loader2 } from "lucide-react";
import { compressImageFile } from "@/lib/utils";
import { ImageCropperModal } from "@/components/image-cropper-modal";
import type { EventWizardData } from "../types";

const fieldClass = "w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C21FAF]";
const labelClass = "block text-sm font-medium text-slate-700 mb-1.5";

export function BasicsStep({ data, onChange }: { data: EventWizardData; onChange: (patch: Partial<EventWizardData>) => void }) {
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [cropSource, setCropSource] = useState<string | null>(null);

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
                  ? "border-[#C21FAF] bg-[#C21FAF] text-white"
                  : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {format === "physical" ? "In-person" : "Virtual"}
            </button>
          ))}
        </div>
      </div>
      {!isVirtual && (
        <div>
          <label className={labelClass}>Who can attend</label>
          <div className="space-y-2">
            {(
              [
                {
                  key: "open",
                  title: "Anyone with the link",
                  body: "Attendees pre-register themselves and get a QR code to check in with.",
                },
                {
                  key: "staff_only",
                  title: "Staff-only capture",
                  body: "No public sign-up link. Staff capture every lead directly at the booth, walk-up, no QR code needed.",
                },
                {
                  key: "invite_only",
                  title: "Invite-only guest list",
                  body: "Build a guest list and send personal invites. Only people you've added can RSVP — for private or corporate events.",
                },
              ] as const
            ).map((opt) => {
              const mode = data.isInviteOnly ? "invite_only" : data.selfRegistrationEnabled === false ? "staff_only" : "open";
              const selected = mode === opt.key;
              return (
                <label
                  key={opt.key}
                  className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected ? "border-[#C21FAF] bg-[#C21FAF]/5" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    checked={selected}
                    onChange={() =>
                      onChange(
                        opt.key === "open"
                          ? { selfRegistrationEnabled: true, isInviteOnly: false }
                          : opt.key === "staff_only"
                            ? { selfRegistrationEnabled: false, isInviteOnly: false }
                            : { selfRegistrationEnabled: false, isInviteOnly: true }
                      )
                    }
                    className="mt-0.5 w-4 h-4 border-slate-300 text-[#C21FAF] focus:ring-[#C21FAF]"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-700">{opt.title}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{opt.body}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
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
            <div className="relative w-full aspect-video rounded-lg overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.coverImage} alt="Cover preview" className="w-full h-full object-contain" />
              <button
                type="button"
                onClick={() => setCropSource(data.coverImage!)}
                className="absolute bottom-2 right-2 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-black/60 text-white hover:bg-black/75 backdrop-blur-sm"
              >
                <Crop size={12} />
                Adjust crop
              </button>
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
            <label className="cursor-pointer flex-1 text-center py-2 px-3 border border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:border-[#C21FAF] transition-colors">
              {imageUploading ? (
                <span className="inline-flex items-center gap-1.5 justify-center">
                  <Loader2 size={14} className="animate-spin" />
                  Loading image…
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
                    // A generously-sized, lightly-compressed source for the cropper —
                    // the crop step below does the final resize/compression once the
                    // organizer picks the visible area, so this only needs to be big
                    // enough to crop from without looking blocky.
                    const dataUrl = await compressImageFile(file, 2000, 0.92);
                    setCropSource(dataUrl);
                  } catch (err) {
                    setImageUploadError(err instanceof Error ? err.message : "Couldn't process that image.");
                  } finally {
                    setImageUploading(false);
                  }
                }}
              />
            </label>
          </div>
          <p className="text-xs text-slate-400">Cards show this at a wide 16:9 crop — pasted URLs are shown as-is; uploads let you pick the visible area.</p>
          {imageUploadError && (
            <p className="flex items-start gap-1.5 text-xs text-rose-600">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {imageUploadError}
            </p>
          )}
          {cropSource && (
            <ImageCropperModal
              imageSrc={cropSource}
              onCancel={() => setCropSource(null)}
              onSave={(croppedDataUrl) => {
                onChange({ coverImage: croppedDataUrl });
                setCropSource(null);
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
