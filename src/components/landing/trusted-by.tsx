"use client";

import { useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";

/* Venues whose events ran on eventbuddy. Logos are each venue's own mark, taken
 * from its official website and recoloured white for the dark band:
 *   Eko Hotels & Suites — ekohotels.com
 *   Abuja Continental   — abujacontinental.com
 *   Mövenpick           — movenpick.accor.com (Mövenpick Ambassador Hotel Accra)
 * Los Angeles Event Center has no website and its Instagram is behind a login,
 * so its name is set as plain text until the venue's logo file is supplied. */
type Venue =
  | { name: string; kind: "image"; src: string; w: number; h: number; height: number }
  | { name: string; kind: "text" };

const VENUES: Venue[] = [
  { name: "Eko Hotels & Suites", kind: "image", src: "/logos/trusted/eko-hotels.png", w: 294, h: 62, height: 34 },
  { name: "Abuja Continental Hotel", kind: "image", src: "/logos/trusted/abuja-continental.png", w: 937, h: 450, height: 50 },
  { name: "Mövenpick Ambassador Hotel Accra", kind: "image", src: "/logos/trusted/movenpick.svg", w: 280, h: 98, height: 40 },
  { name: "Los Angeles Event Center, Abuja", kind: "text" },
];

function VenueMark({ v }: { v: Venue }) {
  if (v.kind === "text") {
    return (
      <span className="lp-venue-text" title={v.name}>
        Los Angeles
        <span>Event Center</span>
      </span>
    );
  }
  return (
    <Image
      src={v.src}
      alt={v.name}
      width={v.w}
      height={v.h}
      className="lp-venue-img"
      unoptimized={v.src.endsWith(".svg")}
      style={{ height: v.height, width: "auto" }}
    />
  );
}

export function TrustedBy() {
  const [paused, setPaused] = useState(false);
  // The track holds the list several times over so the loop never shows a gap
  // even on very wide screens; only the first copy is exposed to assistive tech.
  const copies = [0, 1, 2, 3];

  return (
    <section className="lp-trust" aria-labelledby="lp-trust-title">
      <h2 id="lp-trust-title" className="lp-trust-title">Trusted by</h2>
      <div className="lp-marquee-wrap">
      <div className="lp-marquee">
        <div className="lp-marquee-track" data-paused={paused || undefined}>
          {copies.map((c) => (
            <ul key={c} className="lp-marquee-set" aria-hidden={c > 0 || undefined}>
              {VENUES.map((v) => (
                <li key={v.name} className="lp-venue">
                  <VenueMark v={v} />
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
        <button
          type="button"
          className="lp-marquee-pause"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? "Play the logo carousel" : "Pause the logo carousel"}
        >
          {paused ? <Play size={12} /> : <Pause size={12} />}
        </button>
      </div>
    </section>
  );
}
