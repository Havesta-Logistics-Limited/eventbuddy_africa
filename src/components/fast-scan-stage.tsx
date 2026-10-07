"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CalendarClock, Camera, CheckCircle2, Clock3, ScanLine, Volume2, VolumeX, X } from "lucide-react";
import { getQrDetector } from "@/lib/qr-detector";
import { isScanMuted, setScanMuted, unlockScanAudio, type ScanOutcome } from "@/lib/scan-feedback";

/** What the scan led to, shown over the camera picture. */
export type ScanFlash = {
  key: number;
  outcome: ScanOutcome;
  title: string;
  name?: string;
  message: string;
  /** A decision for staff (early check-in): the scanner stays paused until one is chosen. */
  actions?: { primary: { label: string; onClick: () => void }; secondary: { label: string; onClick: () => void } };
};

const FLASH_ICON: Record<ScanOutcome, React.ReactNode> = {
  success: <CheckCircle2 size={64} strokeWidth={2.2} />,
  already: <Clock3 size={64} strokeWidth={2.2} />,
  error: <AlertCircle size={64} strokeWidth={2.2} />,
  early: <CalendarClock size={64} strokeWidth={2.2} />,
};

/**
 * The check-in door scanner: a large live camera view that reads a ticket QR
 * the moment it's anywhere in the picture.
 *
 * It runs its own loop straight off the <video> element, one detection per
 * video frame (never queued), with the fastest detector available (see
 * qr-detector.ts), so there's no centre box to line up with and no lag from
 * copying frames around. The camera asks for HD with continuous autofocus so
 * small or distant codes resolve. After a scan it outlines the code, shows
 * the result, waits `cooldownSeconds`, then carries on by itself; the same
 * code is ignored for a few seconds so a ticket held up too long isn't
 * scanned twice.
 */
export function FastScanStage({
  onScan,
  cooldownSeconds = 2,
  label = "Scanning tickets",
  flash = null,
}: {
  onScan: (code: string) => void | Promise<void>;
  cooldownSeconds?: number;
  label?: string;
  flash?: ScanFlash | null;
}) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [outline, setOutline] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number } | null>(null);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    // read after mount: localStorage isn't available during the server render
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(isScanMuted());
  }, []);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let frameHandle = 0;
    let timer: ReturnType<typeof setInterval> | null = null;
    const video = videoRef.current!;

    /** The code's corners, from video pixels to the on-screen (object-fit: cover) picture. */
    function toOutline(points: { x: number; y: number }[]) {
      const stage = stageRef.current;
      if (!stage || !video.videoWidth) return null;
      const cw = stage.clientWidth;
      const ch = stage.clientHeight;
      const scale = Math.max(cw / video.videoWidth, ch / video.videoHeight);
      const ox = (cw - video.videoWidth * scale) / 2;
      const oy = (ch - video.videoHeight * scale) / 2;
      return points.map((p) => `${Math.round(p.x * scale + ox)},${Math.round(p.y * scale + oy)}`).join(" ");
    }

    function scheduleNext(loop: () => void) {
      if (stopped) return;
      const v = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
      // once per new camera frame where supported, otherwise per screen frame
      frameHandle = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(loop) : requestAnimationFrame(loop);
    }

    (async () => {
      try {
        const [detector, media] = await Promise.all([
          getQrDetector(),
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          }),
        ]);
        if (stopped) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = media;
        const track = media.getVideoTracks()[0];
        // keep refocusing as tickets move nearer and further (ignored where unsupported)
        track?.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        video.srcObject = media;
        await video.play().catch(() => {});

        const loop = async () => {
          if (stopped) return;
          if (!pausedRef.current && video.readyState >= 2) {
            try {
              const hits = await detector.detect(video);
              const hit = hits.find((h) => h.rawValue);
              if (hit && !stopped && !pausedRef.current) {
                const now = Date.now();
                const last = lastRef.current;
                if (!(last && last.code === hit.rawValue && now - last.at < 6000)) {
                  lastRef.current = { code: hit.rawValue, at: now };
                  pausedRef.current = true;
                  setOutline(toOutline(hit.cornerPoints));
                  setReading(true);
                  Promise.resolve(onScanRef.current(hit.rawValue)).finally(() => {
                    setReading(false);
                    if (stopped) return;
                    let remaining = cooldownSeconds;
                    setCountdown(remaining);
                    timer = setInterval(() => {
                      remaining -= 1;
                      if (remaining > 0) return setCountdown(remaining);
                      if (timer) clearInterval(timer);
                      timer = null;
                      setCountdown(null);
                      setOutline(null);
                      pausedRef.current = false;
                    }, 1000);
                  });
                }
              }
            } catch {
              /* a frame that can't be read (e.g. mid-resize): try the next one */
            }
          }
          scheduleNext(loop);
        };
        scheduleNext(loop);
      } catch (err) {
        if (stopped) return;
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        setError(
          denied
            ? "Camera access was blocked. Allow the camera for this site in your browser settings, or type the reference ID below."
            : "Couldn't start the camera. Check no other app is using it, or type the reference ID below."
        );
        setActive(false);
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      const v = video as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void };
      if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(frameHandle);
      cancelAnimationFrame(frameHandle);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      pausedRef.current = false;
      setReading(false);
      setCountdown(null);
      setOutline(null);
    };
  }, [active, cooldownSeconds]);

  return (
    <div ref={stageRef} className="eb-scanstage" data-active={active || undefined}>
      <video ref={videoRef} className="eb-scanstage-video" muted playsInline autoPlay hidden={!active} />
      {active ? (
        <>
          <div className="eb-scanstage-target" data-reading={reading || undefined} aria-hidden="true" />
          {outline && (
            <svg className="eb-scan-outline" aria-hidden="true">
              <polygon points={outline} />
            </svg>
          )}
          <div className="eb-scanstage-top">
            <span className="eb-scan-chip">
              <ScanLine size={14} aria-hidden="true" /> {label}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMuted((m) => {
                    setScanMuted(!m);
                    return !m;
                  });
                  unlockScanAudio();
                }}
                aria-pressed={!muted}
                aria-label={muted ? "Turn scan sounds on" : "Turn scan sounds off"}
                className="eb-scan-iconbtn"
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button type="button" className="eb-scan-iconbtn" aria-label="Stop camera" onClick={() => setActive(false)}>
                <X size={18} />
              </button>
            </div>
          </div>
          {!flash && !reading && countdown === null && (
            <div className="eb-scanstage-hint">
              <ScanLine size={22} aria-hidden="true" />
              <p>Hold a ticket QR code anywhere in view</p>
            </div>
          )}
          {reading && !flash && (
            <div className="eb-scanstage-hint eb-scanstage-hint--reading" role="status">
              <span className="eb-spinner" aria-hidden="true" />
              <p>QR found, checking…</p>
            </div>
          )}
          {flash && (
            <div key={flash.key} className="eb-scanflash" data-outcome={flash.outcome} role="status" aria-live="assertive">
              <div className="eb-scanflash-card">
                <span className="eb-scanflash-icon" aria-hidden="true">{FLASH_ICON[flash.outcome]}</span>
                <p className="eb-scanflash-title">{flash.title}</p>
                {flash.name && <p className="eb-scanflash-name">{flash.name}</p>}
                <p className="eb-scanflash-msg">{flash.message}</p>
                {flash.actions && (
                  <div className="eb-scanflash-actions">
                    <button type="button" className="eb-scanflash-btn" data-primary onClick={flash.actions.primary.onClick}>
                      {flash.actions.primary.label}
                    </button>
                    <button type="button" className="eb-scanflash-btn" onClick={flash.actions.secondary.onClick}>
                      {flash.actions.secondary.label}
                    </button>
                  </div>
                )}
                {countdown !== null && !flash.actions && <p className="eb-scanflash-next">Next scan in {countdown}…</p>}
              </div>
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setError("");
            unlockScanAudio();
            // warm the decoder while the camera permission prompt is up
            getQrDetector().catch(() => {});
            setActive(true);
          }}
          className="eb-scanstage-start"
        >
          <span className="eb-scanstage-start-icon">
            <Camera size={34} />
          </span>
          <span className="eb-portal-cta w-auto px-8">Start scanning</span>
          <span className="text-sm text-white/60">The camera stays on and checks in each ticket you show it.</span>
          {error && <span className="max-w-md text-sm text-rose-300">{error}</span>}
        </button>
      )}
    </div>
  );
}
