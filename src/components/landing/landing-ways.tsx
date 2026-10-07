"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { OrbsObject } from "./event-objects";

/* "2 ways to bring eventbuddy to your event" as a feature chapter: a centred
 * intro over the glow, then a two-cell bento inside the rails. Self-Serve shows
 * the organizer's own events list; Full-Service shows the event-day run sheet
 * eventbuddy's team works through, ticking off as it comes into view. Sample
 * event names and times. */

const MY_EVENTS = [
  { n: "Rooftop Sessions", d: "Sat 14 Nov", state: "Live", stat: "124 tickets sold" },
  { n: "Lagos Tech Meetup", d: "Thu 20 Nov", state: "Live", stat: "86 registered" },
  { n: "Sunday Thanksgiving Service", d: "Sun 23 Nov", state: "Free", stat: "312 registered" },
  { n: "Founders Dinner", d: "Fri 5 Dec", state: "Draft", stat: "Not published" },
];

const RUN_SHEET = [
  { t: "6:30", s: "eventbuddy team on site" },
  { t: "7:00", s: "Check-in desk and devices ready" },
  { t: "7:30", s: "QR badges printing" },
  { t: "8:00", s: "Doors open, check-in live" },
];

function useInViewOnce<T extends Element>() {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true);
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, seen };
}

export function LandingWays({ feeLabel }: { feeLabel: string }) {
  const { ref: sheetRef, seen: sheetSeen } = useInViewOnce<HTMLOListElement>();

  return (
    <section className="lp-chapter" aria-labelledby="lp-ways-title">
      <div className="lp-rails">
        <div className="lp-chapter-intro">
          <div className="lp-chapter-icon" aria-hidden="true">
            <div className="lp-bob" style={{ ["--bob" as string]: "6.4s" }}><OrbsObject /></div>
          </div>
          <h2 id="lp-ways-title" className="lp-chapter-title">
            2 ways to bring eventbuddy to your event.
            <span>Run it yourself, or HAND US THE WHOLE DAY.</span>
          </h2>
        </div>

        <div className="lp-bento">
          {/* Self-Serve */}
          <div className="lp-cell">
            <p className="lp-lead">
              <strong>Run it yourself.</strong> Set up registration and ticketing, virtual or in person, and manage it all
              from your dashboard. Free to start, and you only pay {feeLabel} when a ticket sells.
            </p>
            <Link href="/create" className="lp-link">
              Start for free <ChevronRight size={15} aria-hidden="true" />
            </Link>

            <div className="lp-cell-visual" aria-hidden="true">
              <div className="lp-mini">
                <div className="lp-mini-head">
                  <span>Your events</span>
                  <span className="lp-mini-btn">+ New event</span>
                </div>
                <ul>
                  {MY_EVENTS.map((e) => (
                    <li key={e.n}>
                      <span className="lp-mini-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="lp-mini-name">{e.n}</span>
                        <span className="lp-mini-meta">{e.d} · {e.stat}</span>
                      </span>
                      <span className={`lp-mini-state lp-mini-state--${e.state.toLowerCase()}`}>{e.state}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Full-Service & Enterprise — the option this section sells hardest */}
          <div className="lp-cell lp-cell--featured">
            <p className="lp-lead">
              <strong>We run it. You just show up.</strong> No staff to train, no devices to source, no last-minute panic.
              Our own team lands at your venue and owns the entire day.
            </p>
            <ul className="lp-checks">
              {[
                "On-site staff running your check-in desk",
                "Devices and QR badge printing, handled for you",
                "Registration, ticketing, check-in and live event hub, end to end",
                "Enterprise scales the same team across every event",
              ].map((item) => (
                <li key={item}>
                  <Check size={15} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <Link href="/managed-events" className="lp-link">
              Request a quote <ChevronRight size={15} aria-hidden="true" />
            </Link>

            <div className="lp-cell-visual" aria-hidden="true">
              <div className="lp-runsheet">
                <div className="lp-runsheet-head">
                  <span>Event day run sheet</span>
                  <span className="lp-runsheet-live"><span className="lp-live-dot" /> On site</span>
                </div>
                <ol ref={sheetRef} data-seen={sheetSeen || undefined}>
                  {RUN_SHEET.map((r, i) => (
                    <li key={r.s} style={{ ["--i" as string]: i }}>
                      <span className="lp-runsheet-time">{r.t}</span>
                      <span className="lp-runsheet-step">{r.s}</span>
                      <span className="lp-runsheet-tick"><Check size={12} strokeWidth={3} /></span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
