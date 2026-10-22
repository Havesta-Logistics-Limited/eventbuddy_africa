"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, QrCode } from "lucide-react";
import type { EventRecord } from "@/lib/types";
import { inviteLabel, type InviteDesign, type InviteLabelMode } from "@/lib/invite-design";
import { compressImageFile } from "@/lib/utils";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { createClient } from "@/lib/supabase/client";
import { PersistError, resolveMyOrgId, updateEvent, useSession } from "@/lib/store";
import { canEdit } from "@/lib/team-permissions";

const LABELS: { id: InviteLabelMode; label: string }[] = [
  { id: "first", label: "First name" },
  { id: "last", label: "Last name" },
  { id: "full", label: "Full name" },
  { id: "none", label: "No name" },
];

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("Couldn't read that image."));
    img.src = src;
  });
}

/**
 * Invite-only events (migration 0136): upload the designed invitation flyer
 * and place the QR box on it. Every confirmed guest then gets this flyer with
 * their own entry QR in that spot and their name under it.
 */
export function InviteFlyerDesigner({ event, sampleName, previewToken }: { event: EventRecord; sampleName: string; previewToken?: string }) {
  const [draft, setDraft] = useState<InviteDesign | null>(event.inviteDesign ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const editable = canEdit(useSession()?.permissions, "events");
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const saved = JSON.stringify(event.inviteDesign ?? null) === JSON.stringify(draft);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Choose an image (JPG or PNG).");
    setUploading(true);
    try {
      const dataUrl = await compressImageFile(file, 1600, 0.9);
      const size = await imageSize(dataUrl);
      const orgId = await resolveMyOrgId(createClient());
      if (!orgId) throw new Error("Couldn't find your organization.");
      const url = await uploadEventMedia(`${orgId}/invites/${event.id}`, dataUrl);
      setDraft((d) => ({
        url,
        width: size.width,
        height: size.height,
        qr: d?.qr ?? { x: 0.08, y: 0.72, size: 0.2 },
        label: d?.label ?? { mode: "first", color: "dark" },
      }));
      toast.success("Flyer uploaded. Drag the QR box into place, then save.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload the flyer.");
    } finally {
      setUploading(false);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!editable || !draft || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    dragRef.current = { dx: (e.clientX - rect.left) / rect.width - draft.qr.x, dy: (e.clientY - rect.top) / rect.height - draft.qr.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!draft || !dragRef.current || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    const sizeH = (draft.qr.size * rect.width) / rect.height;
    const x = Math.min(1 - draft.qr.size, Math.max(0, (e.clientX - rect.left) / rect.width - dragRef.current.dx));
    const y = Math.min(1 - sizeH, Math.max(0, (e.clientY - rect.top) / rect.height - dragRef.current.dy));
    setDraft({ ...draft, qr: { ...draft.qr, x, y } });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await updateEvent(event.id, { inviteDesign: draft });
      toast.success("Invitation flyer saved");
    } catch (err) {
      toast.error(err instanceof PersistError ? err.message : "Couldn't save the flyer.");
    } finally {
      setSaving(false);
    }
  }

  const label = draft ? inviteLabel(sampleName, draft.label.mode) : "";

  return (
    <section className="eb-card mb-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <QrCode size={16} className="text-[#e879f9]" aria-hidden="true" /> Invitation flyer
          </h3>
          <p className="mt-1 max-w-xl text-xs text-muted">
            Upload your designed invitation and place the QR box. Every confirmed guest gets this flyer with their own entry QR and name on it, by email,
            WhatsApp or download.
          </p>
        </div>
        <label data-edit className="eb-btn eb-btn--ghost cursor-pointer text-sm">
          {uploading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ImagePlus size={15} aria-hidden="true" />}
          {draft ? "Replace flyer" : "Upload flyer"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={uploading} />
        </label>
      </div>

      {draft && (
        <div className="mt-4 grid gap-5 md:grid-cols-[minmax(0,360px)_1fr]">
          <div
            ref={stageRef}
            className="relative w-full touch-none select-none overflow-hidden rounded-xl"
            style={{ aspectRatio: `${draft.width} / ${draft.height}` }}
            onPointerMove={onPointerMove}
            onPointerUp={() => (dragRef.current = null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.url} alt="Your invitation flyer" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
            <div
              role="button"
              aria-label={`QR code box, ${Math.round(draft.qr.x * 100)}% across and ${Math.round(draft.qr.y * 100)}% down. Drag it, or use the arrow keys, to move it.`}
              tabIndex={0}
              onPointerDown={onPointerDown}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.05 : 0.01;
                const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
                if (!d || !editable) return;
                e.preventDefault();
                setDraft((cur) => (cur ? { ...cur, qr: { ...cur.qr, x: Math.min(1 - cur.qr.size, Math.max(0, cur.qr.x + d[0])), y: Math.min(0.95, Math.max(0, cur.qr.y + d[1])) } } : cur));
              }}
              className="absolute flex cursor-move flex-col items-center"
              style={{ left: `${draft.qr.x * 100}%`, top: `${draft.qr.y * 100}%`, width: `${draft.qr.size * 100}%` }}
            >
              <div className="grid aspect-square w-full place-items-center rounded-md bg-white shadow-lg ring-2 ring-[#e879f9]">
                <QrCode className="h-3/4 w-3/4 text-[#14122b]" aria-hidden="true" />
              </div>
              {label && (
                <span className={`mt-1 whitespace-nowrap text-[11px] font-bold tracking-wide ${draft.label.color === "light" ? "text-white" : "text-[#111]"}`}>{label}</span>
              )}
            </div>
          </div>

          <div data-edit className="space-y-4">
            <div>
              <label htmlFor="ifd-size" className="eb-label">QR size</label>
              <input
                id="ifd-size"
                type="range"
                min={0.1}
                max={0.4}
                step={0.01}
                value={draft.qr.size}
                onChange={(e) => {
                  const size = Number(e.target.value);
                  setDraft({ ...draft, qr: { ...draft.qr, size, x: Math.min(draft.qr.x, 1 - size) } });
                }}
                className="w-full"
              />
              <p className="mt-1 text-xs text-subtle">Keep it big enough to scan from a phone screen: about a fifth of the width works well.</p>
            </div>
            <div>
              <p className="eb-label">Name under the QR</p>
              <div className="flex flex-wrap gap-2">
                {LABELS.map((l) => (
                  <button key={l.id} type="button" aria-pressed={draft.label.mode === l.id} onClick={() => setDraft({ ...draft, label: { ...draft.label, mode: l.id } })} className="eb-chip">
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="eb-label">Name colour</p>
              <div className="flex gap-2">
                {(["dark", "light"] as const).map((c) => (
                  <button key={c} type="button" aria-pressed={draft.label.color === c} onClick={() => setDraft({ ...draft, label: { ...draft.label, color: c } })} className="eb-chip">
                    {c === "dark" ? "Dark (light flyers)" : "White (dark flyers)"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={save} disabled={saving || saved} className="eb-btn eb-btn--primary">
                {saving ? "Saving…" : saved ? "Saved" : "Save flyer"}
              </button>
              {previewToken && saved && (
                <a href={`/api/invites/${previewToken}/flyer`} target="_blank" rel="noreferrer" className="eb-btn eb-btn--ghost">
                  Preview a real invitation
                </a>
              )}
            </div>
            <p className="text-xs text-subtle">Drag the QR box on the flyer to move it. The real invitation uses each guest&apos;s own scannable code.</p>
          </div>
        </div>
      )}
    </section>
  );
}
