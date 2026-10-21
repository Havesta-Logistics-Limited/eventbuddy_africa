/**
 * Invitation flyers (migration 0136): the organizer's own flyer with a QR box
 * placed on it. Positions are fractions of the flyer, so they hold at any
 * rendered size. Shared by the designer (browser) and the renderer (server).
 */

export type InviteLabelMode = "first" | "last" | "full" | "none";

export type InviteDesign = {
  url: string;
  width: number;
  height: number;
  /** top-left of the QR box and its size, as fractions of the flyer width/height */
  qr: { x: number; y: number; size: number };
  label: { mode: InviteLabelMode; color: "dark" | "light" };
};

export function parseInviteDesign(raw: unknown): InviteDesign | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const qr = r.qr as Record<string, unknown> | undefined;
  const label = r.label as Record<string, unknown> | undefined;
  const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  if (typeof r.url !== "string" || !r.url) return null;
  const width = n(r.width, 1, 10000, 0);
  const height = n(r.height, 1, 10000, 0);
  if (!width || !height) return null;
  const mode = label?.mode;
  return {
    url: r.url,
    width,
    height,
    qr: { x: n(qr?.x, 0, 0.95, 0.06), y: n(qr?.y, 0, 0.95, 0.72), size: n(qr?.size, 0.08, 0.6, 0.2) },
    label: {
      mode: mode === "first" || mode === "last" || mode === "full" || mode === "none" ? mode : "first",
      color: label?.color === "light" ? "light" : "dark",
    },
  };
}

/** The name printed under the QR. */
export function inviteLabel(fullName: string, mode: InviteLabelMode): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (mode === "none" || parts.length === 0) return "";
  if (mode === "first") return parts[0].toUpperCase();
  if (mode === "last") return parts[parts.length - 1].toUpperCase();
  return parts.join(" ").toUpperCase();
}

/** The guest's personal invitation page. */
export function inviteUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/i/${token}`;
}
