import { ImageResponse } from "next/og";

export const alt = "eventbuddy — Never Lose a Lead";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          background: "linear-gradient(145deg, #1a0533 0%, #610064 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              width: 84,
              height: 84,
              borderRadius: 24,
              background: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 44,
            }}
          >
            🎟️
          </div>
          <div style={{ display: "flex", color: "white", fontSize: 88, fontWeight: 700 }}>eventbuddy</div>
        </div>
        <div style={{ display: "flex", color: "#dba8e0", fontSize: 30, marginTop: 20, letterSpacing: 2, textTransform: "uppercase" }}>
          Never Lose a Lead
        </div>
      </div>
    ),
    { ...size }
  );
}
