"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Camera, ScanLine, X } from "lucide-react";

const CORNER_BASE = "absolute w-7 h-7 border-white/90";

/**
 * Shared camera-QR-scan UI: goes straight to the device camera on "Start camera" (no
 * file-upload chooser step), and on every decode pauses the feed, hands the code to
 * `onScan`, then runs a full-frame countdown before closing the camera entirely — the
 * next attendee is a deliberate new "Start camera" tap, not a silent auto-resume, so a
 * badge held up a moment too long can't trigger a second unwanted scan. Used by both
 * /checkin (attendance) and /collect (pulling a registration's details into a lead).
 */
export function QrScannerPanel(props: {
  onScan: (code: string) => void | Promise<void>;
  cooldownSeconds?: number;
  label?: string;
  helperText?: string;
}) {
  const { onScan, cooldownSeconds = 3, label = "Camera scan", helperText = "Camera access isn't available on every device — manual entry always works too." } = props;

  const elementId = `qr-reader-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const scannerRef = useRef<import("html5-qrcode").Html5Qrcode | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearCountdown() {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = null;
    setCountdown(null);
  }

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    import("html5-qrcode").then(async ({ Html5Qrcode }) => {
      if (cancelled) return;
      const qr = new Html5Qrcode(elementId);
      scannerRef.current = qr;
      try {
        // facingMode over enumerating cameras: goes straight to the back camera and
        // triggers the browser's permission prompt immediately, no device picker step.
        await qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 220 },
          (decodedText) => {
            qr.pause(true);
            Promise.resolve(onScan(decodedText)).finally(() => {
              if (cancelled) return;
              clearCountdown();
              let remaining = cooldownSeconds;
              setCountdown(remaining);
              countdownIntervalRef.current = setInterval(() => {
                remaining -= 1;
                if (remaining <= 0) {
                  clearCountdown();
                  setActive(false);
                } else {
                  setCountdown(remaining);
                }
              }, 1000);
            });
          },
          () => {
            // Per-frame "no code found" callback — expected on almost every frame, not an error.
          }
        );
      } catch {
        if (!cancelled) {
          setError("Couldn't access the camera — check your browser's camera permission, or use manual entry below.");
          setActive(false);
        }
      }
    });

    return () => {
      cancelled = true;
      clearCountdown();
      const qr = scannerRef.current;
      scannerRef.current = null;
      if (qr)
        qr
          .stop()
          .then(() => qr.clear())
          .catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <ScanLine size={13} className="text-slate-400" />
          {label}
        </h2>
        {active && (
          <button
            type="button"
            onClick={() => {
              setError("");
              setActive(false);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <X size={12} />
            Stop
          </button>
        )}
      </div>

      {active ? (
        <div className="relative aspect-square bg-slate-900 [&_video]:w-full [&_video]:h-full [&_video]:object-cover">
          <div id={elementId} className="w-full h-full" />

          {/* Purely decorative scan-target frame — html5-qrcode's own qrbox outline is
              a thin 1px line that's easy to miss at a glance from across a booth table. */}
          <div className="pointer-events-none absolute inset-10">
            <span className={`${CORNER_BASE} top-0 left-0 border-t-4 border-l-4 rounded-tl-lg`} />
            <span className={`${CORNER_BASE} top-0 right-0 border-t-4 border-r-4 rounded-tr-lg`} />
            <span className={`${CORNER_BASE} bottom-0 left-0 border-b-4 border-l-4 rounded-bl-lg`} />
            <span className={`${CORNER_BASE} bottom-0 right-0 border-b-4 border-r-4 rounded-br-lg`} />
          </div>

          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900/85 backdrop-blur-sm">
              <div className="text-center text-white">
                <p className="text-6xl font-bold tabular-nums leading-none">{countdown}</p>
                <p className="text-xs text-white/70 mt-3 uppercase tracking-wider">Ready for next scan…</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError("");
            setActive(true);
          }}
          className="w-full flex flex-col items-center justify-center gap-3 px-5 py-10 border-t border-dashed border-slate-200 hover:bg-slate-50/80 transition-colors"
        >
          <span className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "#1098F71A" }}>
            <Camera size={24} style={{ color: "#1098F7" }} />
          </span>
          <span className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ background: "#1098F7" }}>
            Start Camera
          </span>
        </button>
      )}

      <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
        {error ? <p className="text-xs text-rose-600">{error}</p> : <p className="text-xs text-slate-400">{helperText}</p>}
      </div>
    </div>
  );
}
