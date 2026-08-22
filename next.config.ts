import type { NextConfig } from "next";

// Deliberately no Content-Security-Policy here: this app lets admins paste arbitrary
// external image URLs for event covers, and getting script-src right without breaking
// Next.js hydration or the QR scanner needs nonce plumbing through middleware — a
// change that risks silently breaking the app if rushed. Everything below is safe
// (no functional dependency on being absent) and closes real gaps for public launch.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  devIndicators: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
