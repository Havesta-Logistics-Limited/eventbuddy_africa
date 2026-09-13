import QRCode from "qrcode";
import { PNG } from "pngjs";
import fs from "fs";
import path from "path";

/** Server-side counterpart to src/lib/branded-qr.ts (which needs a DOM/Canvas and
 *  can't run in an email-sending API route). Composites the same brand badge — a
 *  pre-rendered 96x96 white circle with the eventbuddy mark, generated once as
 *  public/qr-email-badge.png rather than re-drawn per request — onto the QR's raw
 *  pixels via pngjs (pure JS, no native image-processing dependency needed on a
 *  serverless function). Only correct for the 320px width this badge was sized for;
 *  a different width would need a proportionally re-generated badge. */
const BADGE_PATH = path.join(process.cwd(), "public/qr-email-badge.png");
let badgeCache: PNG | null = null;

function getBadge(): PNG {
  if (!badgeCache) badgeCache = PNG.sync.read(fs.readFileSync(BADGE_PATH));
  return badgeCache;
}

export async function brandedQrBuffer(value: string, opts?: { width?: number; margin?: number }): Promise<Buffer> {
  const width = opts?.width ?? 320;
  const qrBuffer = await QRCode.toBuffer(value, { width, margin: opts?.margin ?? 1, errorCorrectionLevel: "H" });
  const qr = PNG.sync.read(qrBuffer);
  const badge = getBadge();

  const offsetX = Math.round((qr.width - badge.width) / 2);
  const offsetY = Math.round((qr.height - badge.height) / 2);

  for (let y = 0; y < badge.height; y++) {
    for (let x = 0; x < badge.width; x++) {
      const alpha = badge.data[(badge.width * y + x) * 4 + 3];
      if (alpha === 0) continue;

      const qx = offsetX + x;
      const qy = offsetY + y;
      if (qx < 0 || qy < 0 || qx >= qr.width || qy >= qr.height) continue;

      const bi = (badge.width * y + x) * 4;
      const qi = (qr.width * qy + qx) * 4;
      const a = alpha / 255;
      qr.data[qi] = Math.round(badge.data[bi] * a + qr.data[qi] * (1 - a));
      qr.data[qi + 1] = Math.round(badge.data[bi + 1] * a + qr.data[qi + 1] * (1 - a));
      qr.data[qi + 2] = Math.round(badge.data[bi + 2] * a + qr.data[qi + 2] * (1 - a));
      qr.data[qi + 3] = 255;
    }
  }

  return PNG.sync.write(qr);
}
