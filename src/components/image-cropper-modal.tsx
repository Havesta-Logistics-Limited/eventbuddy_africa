"use client";

import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { X, ZoomIn } from "lucide-react";
import { getCroppedImage } from "@/lib/image-crop";

/** Lets the organizer choose exactly which part of an uploaded cover image is
 *  visible, at the one aspect ratio (16:9) every cover-image display spot in the
 *  app now shares — so the crop chosen here is exactly what shows up everywhere
 *  (dashboard card, event page, event picker), with no further automatic cropping
 *  or letterboxing happening later. */
export function ImageCropperModal({ imageSrc, onCancel, onSave }: { imageSrc: string; onCancel: () => void; onSave: (dataUrl: string) => void }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!croppedAreaPixels) return;
    setSaving(true);
    setError("");
    try {
      const dataUrl = await getCroppedImage(imageSrc, croppedAreaPixels);
      onSave(dataUrl);
    } catch {
      setError("Couldn't process that image. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Choose visible area</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="relative w-full aspect-video bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={16 / 9}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
          />
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-3">
            <ZoomIn size={15} className="text-slate-400 shrink-0" />
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-brand-600"
            />
          </div>
          <p className="text-xs text-slate-400">Drag to reposition, use the slider to zoom — the highlighted area is what attendees will see.</p>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !croppedAreaPixels}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Use this crop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
