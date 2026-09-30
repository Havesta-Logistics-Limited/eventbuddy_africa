"use client";

/**
 * Client side of referral attribution: remember which partner's link brought
 * this visitor here, so the code still travels with them if they land on the
 * event, wander off, and come back to register later.
 *
 * Last click wins, within a 30-day window, scoped per event — a code captured
 * for one event must never be credited against another. Everything is
 * best-effort: attribution is bookkeeping, and a browser that blocks storage
 * should still be able to register.
 */

const PREFIX = "eventbuddy:ref:";
const CLICKED_PREFIX = "eventbuddy:refclick:";
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type Stored = { code: string; at: number };

function key(eventId: string) {
  return PREFIX + eventId;
}

/** Read ?ref= for this event, remember it, and count the click once per tab. */
export function captureRef(eventId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  let code: string | undefined;
  try {
    const raw = new URLSearchParams(window.location.search).get("ref")?.trim();
    if (raw && raw.length <= 40) {
      code = raw;
      window.localStorage.setItem(key(eventId), JSON.stringify({ code, at: Date.now() } satisfies Stored));
    }
  } catch {
    /* storage blocked — fall through to whatever is already known */
  }
  if (code) countClickOnce(eventId, code);
  return code ?? storedRef(eventId);
}

/** The code to attribute this visitor to, if any is still within the window. */
export function storedRef(eventId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key(eventId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed?.code) return undefined;
    if (Date.now() - parsed.at > WINDOW_MS) {
      window.localStorage.removeItem(key(eventId));
      return undefined;
    }
    return parsed.code;
  } catch {
    return undefined;
  }
}

/** Traffic signal only, and deliberately cheap: one count per code per tab, so
 *  a reload or a wander through the page doesn't inflate a partner's numbers.
 *  Never blocks anything and never surfaces an error. */
function countClickOnce(eventId: string, code: string) {
  const marker = `${CLICKED_PREFIX}${eventId}:${code.toLowerCase()}`;
  try {
    if (window.sessionStorage.getItem(marker)) return;
    window.sessionStorage.setItem(marker, "1");
  } catch {
    return; // no session storage: skip counting rather than count every render
  }
  import("@/lib/supabase/client")
    .then(({ createClient }) =>
      createClient().rpc("public_count_referral_click", { p_event_id: eventId, p_code: code })
    )
    .catch(() => { /* a missed click is not worth a visible failure */ });
}
