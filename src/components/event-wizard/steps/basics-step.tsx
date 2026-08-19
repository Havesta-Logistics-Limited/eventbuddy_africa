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
      <div>
        <label className={labelClass}>Venue</label>
        <input required value={data.venue} onChange={(e) => onChange({ venue: e.target.value })} placeholder="e.g. Eko Hotel & Suites" className={fieldClass} />
      </div>
      <div>
        <label className={labelClass}>Location (City, Country)</label>
        <input required value={data.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="e.g. Lagos, Nigeria" className={fieldClass} />
      </div>
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
