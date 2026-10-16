/**
 * Marketing attribution (migration 0132): which link brought a visitor to an
 * event page, and where they came from before it.
 *
 *   link:   promoter (?ref=CODE) > private (/p/CODE) > public; a ?src= tag
 *           (added automatically by the page's share buttons) only sets the source
 *   source: a tag (?src= or utm_source) > the app's in-app browser (Instagram,
 *           Facebook, TikTok, …, which often hide the referrer) > the referring
 *           site > "direct" (typed, bookmarked, or an app that sends nothing,
 *           like WhatsApp; tagged links are how those get credited)
 *
 * The pure helpers below are shared by the browser (capture) and the server
 * (cleaning what the browser sends); the capture functions are browser-only.
 */

export type LinkKind = "public" | "private" | "promoter" | "tagged";
export type Attribution = { kind: LinkKind; code: string | null; source: string; detail: string | null; campaign: string | null };

/** Known sources, in the order the report lists them, with display names. */
export const SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  x: "X (Twitter)",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  telegram: "Telegram",
  youtube: "YouTube",
  google: "Google",
  bing: "Bing",
  email: "Email",
  sms: "SMS",
  qr: "QR code / flyer",
  eventbuddy: "eventbuddy (Discover, profiles)",
  shared: "Shared by visitors (other apps)",
  website: "Other websites",
  direct: "Direct / unknown",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** A tag or utm_source typed any common way, to one name ("IG" → instagram). */
export function normalizeSource(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!s) return null;
  const aliases: Record<string, string> = {
    ig: "instagram", insta: "instagram", "instagram-bio": "instagram", "instagram-story": "instagram",
    fb: "facebook", meta: "facebook",
    wa: "whatsapp", "whatsapp-status": "whatsapp", "whats-app": "whatsapp",
    twitter: "x", tw: "x",
    tt: "tiktok", "tik-tok": "tiktok",
    li: "linkedin",
    snap: "snapchat", tg: "telegram", yt: "youtube",
    mail: "email", newsletter: "email", "e-mail": "email",
    text: "sms", flyer: "qr", "qr-code": "qr", poster: "qr",
    // the event page's own Copy link / share sheet: shared by a visitor, app unknown
    link: "shared", share: "shared",
  };
  return aliases[s] ?? s;
}

/** The app whose in-app browser this is, from its user-agent string. */
export function inAppSource(ua: string): string | null {
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS|\[FB/i.test(ua)) return "facebook";
  if (/musical_ly|BytedanceWebview|TikTok|ByteLocale/i.test(ua)) return "tiktok";
  if (/LinkedInApp/i.test(ua)) return "linkedin";
  if (/Snapchat/i.test(ua)) return "snapchat";
  if (/Twitter/i.test(ua)) return "x";
  if (/Telegram/i.test(ua)) return "telegram";
  if (/WhatsApp/i.test(ua)) return "whatsapp";
  return null;
}

/** The source a referring site stands for. */
export function referrerSource(host: string, ownHost?: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (ownHost && (h === ownHost.toLowerCase().replace(/^www\./, "") || h.endsWith(".eventbuddy.africa") || h === "eventbuddy.africa")) return "eventbuddy";
  if (/(^|\.)instagram\.com$/.test(h)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(h)) return "facebook";
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(h)) return "whatsapp";
  if (/(^|\.)(twitter\.com|x\.com|t\.co)$/.test(h)) return "x";
  if (/(^|\.)tiktok\.com$/.test(h)) return "tiktok";
  if (/(^|\.)(linkedin\.com|lnkd\.in)$/.test(h)) return "linkedin";
  if (/(^|\.)snapchat\.com$/.test(h)) return "snapchat";
  if (/(^|\.)(t\.me|telegram\.org)$/.test(h)) return "telegram";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return "youtube";
  if (/(^|\.)mail\.(google|yahoo)\.com$|outlook\.(live|office)\.com$/.test(h)) return "email";
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return "google";
  if (/(^|\.)bing\.com$/.test(h)) return "bing";
  return "website";
}

/** Works out a visit's link and source from what the browser can see. */
export function detectAttribution(input: { pathname: string; search: string; referrer: string; userAgent: string; ownHost: string }): Attribution {
  const q = new URLSearchParams(input.search);
  const ref = q.get("ref")?.trim() || null;
  const src = q.get("src")?.trim() || null;
  const utm = q.get("utm_source")?.trim() || null;
  const campaign = (q.get("utm_campaign")?.trim() || null)?.slice(0, 80) ?? null;

  let kind: LinkKind = "public";
  let code: string | null = null;
  if (ref && ref.length <= 40) {
    kind = "promoter";
    code = ref;
  } else if (/^\/p\/[^/]+/.test(input.pathname)) {
    kind = "private";
    code = input.pathname.split("/")[2]?.slice(0, 60) ?? null;
  }

  const tag = normalizeSource(src) ?? normalizeSource(utm);
  if (tag) return { kind, code, source: tag, detail: null, campaign };
  const app = inAppSource(input.userAgent);
  let host: string | null = null;
  try {
    host = input.referrer ? new URL(input.referrer).host : null;
  } catch {
    host = null;
  }
  if (app) return { kind, code, source: app, detail: host, campaign };
  if (host) {
    const fromSite = referrerSource(host, input.ownHost);
    return { kind, code, source: fromSite, detail: fromSite === "website" ? host.slice(0, 120) : null, campaign };
  }
  return { kind, code, source: "direct", detail: null, campaign };
}

/** Server side: keeps only well-formed values from what a browser sent. */
export function cleanAttribution(raw: unknown): Attribution | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kind = r.kind;
  if (kind !== "public" && kind !== "private" && kind !== "promoter" && kind !== "tagged") return null;
  const source = normalizeSource(typeof r.source === "string" ? r.source : null);
  if (!source) return null;
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return { kind, code: str(r.code, 60), source, detail: str(r.detail, 120), campaign: str(r.campaign, 80) };
}

// ---- browser-only capture ---------------------------------------------------

const ATTR_PREFIX = "eventbuddy:attr:";
const VISIT_PREFIX = "eventbuddy:visit:";
const VISITOR_KEY = "eventbuddy:vid";
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function visitorId(): string {
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, "");
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Records where this visit came from for an event. Remembers the last
 * non-direct visit for 30 days (a later direct visit doesn't wipe out the
 * Instagram click that brought them), and returns the visit to log, or null
 * if this tab already logged one for the event.
 */
export function captureVisit(eventId: string): (Attribution & { visitor: string }) | null {
  if (typeof window === "undefined") return null;
  const now = detectAttribution({
    pathname: window.location.pathname,
    search: window.location.search,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    ownHost: window.location.host,
  });
  try {
    const prev = storedAttribution(eventId);
    if (now.source !== "direct" || now.kind !== "public" || !prev) {
      window.localStorage.setItem(ATTR_PREFIX + eventId, JSON.stringify({ ...now, at: Date.now() }));
    }
  } catch {
    /* storage blocked: attribution is best-effort */
  }
  try {
    if (window.sessionStorage.getItem(VISIT_PREFIX + eventId)) return null;
    window.sessionStorage.setItem(VISIT_PREFIX + eventId, "1");
  } catch {
    return null; // can't dedupe: skip logging rather than log every render
  }
  return { ...now, visitor: visitorId() };
}

/** The link and source to credit a sale or sign-up to, if still within 30 days. */
export function storedAttribution(eventId: string): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATTR_PREFIX + eventId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution & { at: number };
    if (!parsed?.source || Date.now() - parsed.at > WINDOW_MS) {
      window.localStorage.removeItem(ATTR_PREFIX + eventId);
      return null;
    }
    const { at: _at, ...rest } = parsed;
    void _at;
    return rest;
  } catch {
    return null;
  }
}
