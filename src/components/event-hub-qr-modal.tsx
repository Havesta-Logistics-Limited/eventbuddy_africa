"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, X } from "lucide-react";

/** A generic, per-event QR code (no personal token baked in) that any device can
 *  scan straight to the Event Hub — for posters/screens at the venue, as a
 *  fallback for attendees who forgot to check their confirmation email. Landing
 *  on the Hub without a token prompts a quick email/reference-ID lookup (see the
 *  Hub page) rather than granting access outright, so this stays safe to print
 *  and display publicly. */
export function EventHubQrModal({ eventName, hubUrl, onClose }: { eventName: string; hubUrl: string; onClose: () => void }) {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    QRCode.toDataURL(hubUrl, { width: 480, margin: 2, color: { dark: "#1e1b2e", light: "#ffffff" } })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [hubUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-semibold text-slate-900">Event Hub QR Code</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 text-center">
          <p className="text-sm text-slate-500 mb-4">Scanning this takes anyone straight to the {eventName} hub — schedule, speakers, and Q&amp;A.</p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="Event Hub QR code" className="mx-auto rounded-lg border border-slate-200" width={220} height={220} />
          ) : (
            <div className="w-[220px] h-[220px] mx-auto rounded-lg bg-slate-100 animate-pulse" />
          )}
          <p className="text-xs text-slate-400 mt-4 break-all font-mono">{hubUrl}</p>
          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`${eventName.replace(/[^a-z0-9]/gi, "_")}_hub_qr.png`}
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
