"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, QrCode } from "lucide-react";

/** Collapses the two per-event QR actions (registration, hub) behind one
 *  button — keeping the event header's action row from growing every time a
 *  new QR link is added. */
export function QrCodesMenu({ onRegistrationQr, onHubQr }: { onRegistrationQr: () => void; onHubQr: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
      >
        <QrCode size={14} />
        QR Codes
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-48 bg-white rounded-lg border border-slate-200 shadow-lg py-1">
          <button
            onClick={() => {
              onRegistrationQr();
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Registration QR
          </button>
          <button
            onClick={() => {
              onHubQr();
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Event Hub QR
          </button>
        </div>
      )}
    </div>
  );
}
