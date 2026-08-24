/**
 * Shared HTML shell for every transactional email this app sends — a colored
 * banner (logo + short label, built purely from HTML/CSS, no photography) over a
 * white content card, so each template reads as eventbuddy-branded and distinct
 * from the others by its own accent color, while sharing one layout recipe
 * instead of four independently hand-rolled ones. Table-based markup throughout
 * (not flexbox/grid) for Outlook/older-client compatibility.
 */

export type EmailBanner = {
  /** Solid background color for the banner band. */
  color: string;
  /** Short uppercase label under the centered logo, e.g. "WELCOME", "PASSWORD RESET". */
  label: string;
  /** One small emoji shown inline next to the label — a quiet per-template accent,
   *  not a dominant graphic (the centered logo carries the banner visually). */
  emoji: string;
};

/** Always the real production domain, regardless of NEXT_PUBLIC_SITE_URL — the logo is
 *  a static asset that's live on production no matter which environment triggered the
 *  send, and email clients (Gmail included) can't fetch an image from a dev machine's
 *  localhost. Deriving this from NEXT_PUBLIC_SITE_URL instead silently degrades to
 *  alt-text-only in every email sent while testing against local dev. CTA links are
 *  built by each calling route instead, since those need to point wherever the app
 *  that sent the email is actually running (localhost while testing, production once
 *  deployed) — unlike this static asset, which is the same file either way. */
const LOGO_URL = "https://eventbuddy.africa/logo-full-white.png";

export function renderEmailShell(banner: EmailBanner, bodyHtml: string): string {
  return `
<div style="background:#f1f5f9; padding:32px 16px; font-family:-apple-system,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${banner.color};">
      <tr>
        <td style="padding:28px 32px; text-align:center;">
          <img src="${LOGO_URL}" alt="eventbuddy" width="150" height="21" style="display:inline-block; width:150px; height:21px; border:0;" />
          <p style="color:#ffffff; font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; opacity:0.75; margin:12px 0 0;">
            ${banner.emoji} ${banner.label}
          </p>
        </td>
      </tr>
    </table>
    <div style="padding:32px; color:#1e1b2e; font-size:14px; line-height:1.6;">
      ${bodyHtml}
    </div>
  </div>
  <p style="max-width:600px; margin:20px auto 0; text-align:center; color:#94a3b8; font-size:12px;">
    eventbuddy · Registration, ticketing, and check-in for any event
  </p>
</div>`;
}

export function emailButton(url: string, label: string, color: string): string {
  return `<a href="${url}" style="display:inline-block; padding:12px 22px; border-radius:8px; background:${color}; color:#ffffff; font-size:14px; font-weight:600; text-decoration:none;">${label}</a>`;
}
