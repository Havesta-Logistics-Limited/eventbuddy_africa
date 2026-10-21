import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { brandedQrBuffer } from "@/lib/branded-qr-server";
import { inviteLabel, type InviteDesign } from "@/lib/invite-design";

/**
 * Renders one guest's invitation (migration 0136): the organizer's flyer with
 * the guest's own entry QR (their registration reference, the same code the
 * door scanner reads) in the placed box, and their name under it. PNG, at the
 * flyer's own proportions, at most 1200px wide.
 */

let fontCache: Buffer | null = null;
async function boldFont() {
  if (!fontCache) fontCache = await readFile(join(process.cwd(), "public/fonts/inter-700.ttf"));
  return fontCache;
}

export async function renderInviteFlyer(design: InviteDesign, guestName: string, referenceId: string): Promise<ImageResponse> {
  const W = Math.round(Math.min(design.width, 1200));
  const H = Math.round((W * design.height) / design.width);
  const qrSize = Math.round(design.qr.size * W);
  const pad = Math.max(4, Math.round(qrSize * 0.05));
  const left = Math.round(design.qr.x * W);
  const top = Math.round(design.qr.y * H);
  const label = inviteLabel(guestName, design.label.mode);
  const fontSize = Math.max(12, Math.round(qrSize * 0.13));
  const qr = (await brandedQrBuffer(referenceId, { width: 320, margin: 1 })).toString("base64");

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative" }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={design.url} width={W} height={H} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, objectFit: "cover" }} />
        <div style={{ position: "absolute", left, top, width: qrSize, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ display: "flex", background: "#ffffff", padding: pad, borderRadius: Math.round(pad * 1.2) }}>
            {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
            <img src={`data:image/png;base64,${qr}`} width={qrSize - pad * 2} height={qrSize - pad * 2} />
          </div>
          {label ? (
            <div
              style={{
                marginTop: Math.round(fontSize * 0.45),
                fontSize,
                fontWeight: 700,
                letterSpacing: 1,
                color: design.label.color === "light" ? "#ffffff" : "#111111",
                textAlign: "center",
                maxWidth: qrSize * 1.6,
                display: "flex",
                justifyContent: "center",
              }}
            >
              {label}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: W, height: H, fonts: [{ name: "Inter", data: await boldFont(), weight: 700, style: "normal" }] }
  );
}
