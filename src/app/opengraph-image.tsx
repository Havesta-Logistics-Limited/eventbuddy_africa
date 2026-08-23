import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "eventbuddy — Never Lose a Lead";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const markPng = await readFile(join(process.cwd(), "public/logo-mark.png"));
const markSrc = `data:image/png;base64,${markPng.toString("base64")}`;

/** Default OG/social-share card for the whole site — any route can override this by
 *  adding its own opengraph-image.tsx, but most of this app's public surface (the
 *  marketing pages) is happy sharing one branded card. */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #0b0500 0%, #1B512D 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <img src={markSrc} width={84} height={84} alt="" style={{ objectFit: "contain" }} />
          <div style={{ display: "flex", color: "white", fontSize: 88, fontWeight: 700 }}>eventbuddy</div>
        </div>
        <div style={{ display: "flex", color: "#f9d158", fontSize: 30, marginTop: 20, letterSpacing: 2, textTransform: "uppercase" }}>
          Never Lose a Lead
        </div>
      </div>
    ),
    { ...size }
  );
}
