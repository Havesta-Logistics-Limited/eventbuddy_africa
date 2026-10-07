/** Check-in scan feedback (2026-10-07): a distinct sound and vibration for a
 *  successful check-in, a duplicate, and an invalid code. Sounds are made with
 *  the Web Audio API, so there are no files to load and it works offline at a
 *  venue. Browsers only allow audio after a tap, so call unlockScanAudio() from
 *  the "Start camera" / "Check in" press. */
export type ScanOutcome = "success" | "already" | "error" | "early";

let ctx: AudioContext | null = null;
const MUTE_KEY = "eventbuddy:scan-muted";

export function isScanMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setScanMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* storage blocked: the toggle still works for this page */
  }
}

export function unlockScanAudio() {
  if (typeof window === "undefined") return;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

/** One note: frequency (Hz), start offset and length (s), waveform, peak gain. */
function tone(freq: number, at: number, dur: number, type: OscillatorType, peak: number, slideTo?: number) {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const VIBRATE: Record<ScanOutcome, number[]> = {
  success: [60],
  already: [70, 80, 70],
  error: [220],
  early: [40, 60, 40],
};

export function playScanFeedback(outcome: ScanOutcome, muted = isScanMuted()) {
  if (typeof window === "undefined") return;
  try {
    navigator.vibrate?.(VIBRATE[outcome]);
  } catch {
    /* not supported */
  }
  if (muted) return;
  unlockScanAudio();
  if (!ctx) return;
  if (outcome === "success") {
    // bright rising chime: C6, E6, G6
    tone(1046.5, 0, 0.16, "sine", 0.35);
    tone(1318.5, 0.08, 0.16, "sine", 0.32);
    tone(1568, 0.16, 0.32, "sine", 0.3);
  } else if (outcome === "already") {
    // two even mid beeps: "seen this one"
    tone(740, 0, 0.13, "triangle", 0.35);
    tone(740, 0.2, 0.13, "triangle", 0.35);
  } else if (outcome === "early") {
    // a gentle "heads up": two soft rising notes, quieter than the others
    tone(659.3, 0, 0.18, "sine", 0.26);
    tone(880, 0.15, 0.3, "sine", 0.24);
  } else {
    // soft falling "uh-oh": D5 then a bent A4, rounded with a quiet
    // octave-down layer so it reads as "no" without a harsh buzz
    tone(587.3, 0, 0.17, "sine", 0.38);
    tone(293.7, 0, 0.17, "triangle", 0.12);
    tone(440, 0.19, 0.36, "sine", 0.38, 392);
    tone(220, 0.19, 0.36, "triangle", 0.12, 196);
  }
}
