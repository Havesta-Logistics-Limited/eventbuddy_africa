import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAnonClient } from "@/lib/supabase/anon";

export const eventOgImageSize = { width: 1200, height: 630 };

const markPng = await readFile(join(process.cwd(), "public/logo-mark.png"));
const markSrc = `data:image/png;base64,${markPng.toString("base64")}`;

type OgEvent = {
  name: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  location: string;
  venue: string;
  coverImage: string | null;
  eventFormat: string | null;
  virtualPlatform: string | null;
};

/** Resolves the event a register-page link points at, purely for building its share
 *  card — public data only (the same columns the register page itself already shows
 *  everyone), via the anon client since this runs at request time with no session.
 *  Matches by real id or either kind of slug, same as RegisterPageContent. */
export async function resolveEventForOg(orgSlug: string, eventIdOrSlug: string): Promise<OgEvent | null> {
  const supabase = createAnonClient();
  const { data: events } = await supabase.rpc("public_org_events", { org_slug: orgSlug });
  type Row = {
    id: string;
    slug: string | null;
    name: string;
    date: string;
    end_date: string | null;
    start_time: string | null;
    location: string;
    venue: string;
    cover_image: string | null;
    event_format: string | null;
    virtual_platform: string | null;
  };
  const event = ((events ?? []) as Row[]).find((e) => e.id === eventIdOrSlug || (e.slug && e.slug === eventIdOrSlug));
  if (!event) return null;
  return {
    name: event.name,
    date: event.date,
    endDate: event.end_date,
    startTime: event.start_time,
    location: event.location,
    venue: event.venue,
    coverImage: event.cover_image,
    eventFormat: event.event_format,
    virtualPlatform: event.virtual_platform,
  };
}

/** Builds the actual share-card image (Satori/next-og, so only a constrained CSS
 *  subset applies — flexbox only, `display: flex` on every box) — a two-panel card
 *  matching Luma's own share-card composition: a branded panel with the event name
 *  and a Register cue on the left, the event's own cover photo shown plainly (not
 *  cropped full-bleed or overlaid) in a rounded inset on the right. A data: URI cover
 *  photo renders fine here even though a browser fetching og:image directly could
 *  never load one — Satori renders it as image content, not a URL a client fetches.
 *  No cover image falls back to the brand gradient alone filling the right panel. */
export function buildEventOgImage(event: OgEvent) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#170821" }}>
        <div
          style={{
            width: 520,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 56,
            background: "radial-gradient(ellipse 160% 140% at 15% -15%, #FF8AF5 0%, #C21FAF 55%, #170821 130%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={markSrc} width={34} height={34} alt="" />
            <div style={{ display: "flex", color: "white", fontSize: 26, fontWeight: 700 }}>eventbuddy</div>
          </div>
          <div style={{ display: "flex", color: "white", fontSize: 46, fontWeight: 700, lineHeight: 1.15 }}>{event.name}</div>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", background: "white", color: "#170821", fontSize: 22, fontWeight: 700, padding: "14px 32px", borderRadius: 999 }}>Register</div>
          </div>
        </div>
        <div style={{ flex: 1, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          {event.coverImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.coverImage} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 24 }} alt="" />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 40,
                textAlign: "center",
                background: "linear-gradient(145deg, #FF8AF5 0%, #C21FAF 100%)",
              }}
            >
              <div style={{ display: "flex", color: "white", fontSize: 34, fontWeight: 700, lineHeight: 1.3 }}>{event.name}</div>
            </div>
          )}
        </div>
      </div>
    ),
    eventOgImageSize
  );
}
