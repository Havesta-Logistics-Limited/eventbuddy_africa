import { describe, expect, it } from "vitest";
import { cleanAttribution, detectAttribution, normalizeSource } from "./marketing-attribution";

const base = { pathname: "/lekki-waterside-groove", search: "", referrer: "", userAgent: "Mozilla/5.0 Safari", ownHost: "eventbuddy.africa" };

describe("detectAttribution", () => {
  it("public link, no referrer → direct", () => {
    expect(detectAttribution(base)).toMatchObject({ kind: "public", code: null, source: "direct" });
  });
  it("promoter link wins the link, referrer gives the source", () => {
    expect(detectAttribution({ ...base, search: "?ref=RICHARD", referrer: "https://l.instagram.com/" })).toMatchObject({ kind: "promoter", code: "RICHARD", source: "instagram" });
  });
  it("a ?src= tag credits its source on the same link, even with no referrer (WhatsApp)", () => {
    expect(detectAttribution({ ...base, search: "?src=wa" })).toMatchObject({ kind: "public", code: null, source: "whatsapp" });
    expect(detectAttribution({ ...base, search: "?ref=RICHARD&src=whatsapp" })).toMatchObject({ kind: "promoter", code: "RICHARD", source: "whatsapp" });
  });
  it("in-app browser beats a missing referrer", () => {
    expect(detectAttribution({ ...base, userAgent: "Mozilla/5.0 (iPhone) Instagram 300.0" })).toMatchObject({ source: "instagram" });
    expect(detectAttribution({ ...base, userAgent: "Mozilla/5.0 [FBAN/FBIOS;FBAV/400]" })).toMatchObject({ source: "facebook" });
    expect(detectAttribution({ ...base, userAgent: "Mozilla/5.0 musical_ly_25.1" })).toMatchObject({ source: "tiktok" });
  });
  it("private link", () => {
    expect(detectAttribution({ ...base, pathname: "/p/H5ZERQNK", referrer: "https://t.co/abc" })).toMatchObject({ kind: "private", code: "H5ZERQNK", source: "x" });
  });
  it("utm_source and campaign", () => {
    expect(detectAttribution({ ...base, search: "?utm_source=Facebook&utm_campaign=dec-launch" })).toMatchObject({ kind: "public", source: "facebook", campaign: "dec-launch" });
  });
  it("own site, google, other sites", () => {
    expect(detectAttribution({ ...base, referrer: "https://eventbuddy.africa/discover" }).source).toBe("eventbuddy");
    expect(detectAttribution({ ...base, referrer: "https://www.google.com.ng/" }).source).toBe("google");
    expect(detectAttribution({ ...base, referrer: "https://pulse.ng/article" })).toMatchObject({ source: "website", detail: "pulse.ng" });
  });
});

describe("normalizeSource / cleanAttribution", () => {
  it("maps aliases and slugs custom names", () => {
    expect(normalizeSource("IG")).toBe("instagram");
    expect(normalizeSource("Flyer")).toBe("qr");
    expect(normalizeSource("Radio Ad!")).toBe("radio-ad");
    expect(normalizeSource("  ")).toBeNull();
  });
  it("rejects junk from the browser", () => {
    expect(cleanAttribution({ kind: "hacker", source: "x" })).toBeNull();
    expect(cleanAttribution({ kind: "public", source: "<script>" })).toMatchObject({ source: "script" });
    expect(cleanAttribution(null)).toBeNull();
  });
});
