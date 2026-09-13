import QRCode from "qrcode";

/** Renders a QR code as a data URL with the eventbuddy mark composited into the
 *  center on a white rounded backdrop — browser-only (uses Canvas), for the places
 *  attendees/staff actually look at a code (registration confirmation, RSVP, the
 *  registrant detail modal, the staff/rep check-in QR). Error correction is forced to
 *  "H" so scanners stay reliable despite the obscured center modules. The emailed
 *  ticket QR (src/lib/registration-email.ts) is generated server-side and isn't
 *  wired through this — see the comment there. */
export async function brandedQrDataUrl(
  value: string,
  opts?: { width?: number; margin?: number; dark?: string; light?: string }
): Promise<string> {
  const width = opts?.width ?? 320;
  const qrDataUrl = await QRCode.toDataURL(value, {
    width,
    margin: opts?.margin ?? 1,
    errorCorrectionLevel: "H",
    color: { dark: opts?.dark ?? "#1e1b2e", light: opts?.light ?? "#ffffff" },
  });

  const [qrImg, logoImg] = await Promise.all([loadImage(qrDataUrl), loadImage("/logo-mark.png")]);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = width;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qrDataUrl;

  ctx.drawImage(qrImg, 0, 0, width, width);

  const badgeSize = width * 0.26;
  const badgeX = (width - badgeSize) / 2;
  const badgeY = (width - badgeSize) / 2;
  const badgeRadius = badgeSize / 2;

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(width / 2, width / 2, badgeRadius + width * 0.02, 0, Math.PI * 2);
  ctx.fill();

  const logoSize = badgeSize * 0.78;
  const logoX = (width - logoSize) / 2;
  const logoY = (width - logoSize) / 2;
  ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
