"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, X } from "lucide-react";

/** A generic, per-event QR code (no personal token baked in) that any device can
 *  scan straight to a given URL — for posters/screens at the venue, or as a
 *  fallback for anyone who forgot a link. Reused for both the Event Hub QR
 *  (schedule/speakers/Q&A) and the Registration QR (the public register page). */
export function EventQrModal({
  title,
  description,
  url,
  downloadName,
  onClose,
}: {
  title: string;
  description: string;
  url: string;
  downloadName: string;
  onClose: () => void;
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: "#1e1b2e", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [url]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-slate-500 mb-4">{description}</p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt={title} className="mx-auto rounded-lg border border-slate-200" width={220} height={220} />
          ) : (
            <div className="w-[220px] h-[220px] mx-auto rounded-lg bg-slate-100 animate-pulse" />
          )}
          <p className="text-xs text-slate-400 mt-4 break-all font-mono">{url}</p>
          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={downloadName}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
            >
              <Download size={14} />
              Download QR code
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
