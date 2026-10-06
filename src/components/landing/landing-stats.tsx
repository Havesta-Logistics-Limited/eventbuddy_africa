"use client";

import { useEffect, useRef, useState } from "react";

/* Real usage figures, supplied by eventbuddy (updated 2026-10-06). This
 * environment's own database only holds test data, so they can't be derived.
 * `plus` marks figures that are a floor ("20+"), not an exact count. */
const STATS = [
  { value: 20, plus: true, label: "Event creators", caption: "Real organizers, from first-timers to seasoned teams" },
  { value: 3000, plus: true, label: "Tickets sold", caption: "Ticket sales, tracked the moment they happen" },
  { value: 15, plus: true, label: "Events powered", caption: "Small meetups and multi-day programmes alike" },
  { value: 3, plus: false, label: "Countries", caption: "Rooted in Africa, built to work anywhere" },
];

/** Counts each figure up once, the first time the row scrolls into view. The
 *  server and first paint show the final numbers, so nothing is ever blank and
 *  reduced-motion visitors simply see them as they are. */
function useCountUp(targets: number[]) {
  const ref = useRef<HTMLDListElement>(null);
  const [values, setValues] = useState(targets);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = 1400;
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / dur);
          const k = 1 - Math.pow(1 - p, 4);
          setValues(targets.map((t) => Math.round(t * k)));
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
    // targets are module constants; run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { ref, values };
}

export function LandingStats({ eventNames }: { eventNames: string[] }) {
  const { ref, values } = useCountUp(STATS.map((s) => s.value));

  return (
    <section className="lp-stats" aria-labelledby="lp-stats-title">
      <div className="lp-rails">
        <h2 id="lp-stats-title" className="lp-stats-title">
          Event teams across Africa and beyond
          <span> run on eventbuddy.</span>
        </h2>

        <dl ref={ref} className="lp-stats-grid">
          {STATS.map((s, i) => (
            <div key={s.label} className="lp-stat">
              <dt className="sr-only">{s.label}</dt>
              <dd className="lp-stat-value">
                <span className="tabular-nums">{values[i].toLocaleString("en-NG")}</span>
                {s.plus && (
                  <>
                    <span className="lp-stat-plus" aria-hidden="true">+</span>
                    <span className="sr-only"> or more</span>
                  </>
                )}
              </dd>
              <dd className="lp-stat-label" aria-hidden="true">{s.label}</dd>
              <dd className="lp-stat-caption">{s.caption}</dd>
            </div>
          ))}
        </dl>

        {/* Real event names, live from the featured organization's hosted events. */}
        <div className="lp-powered">
          <p className="lp-powered-label">Events powered by eventbuddy</p>
          <div className="lp-powered-viewport">
            <div className="lp-powered-track">
              {[0, 1].map((copy) => (
                <ul key={copy} className="lp-powered-set" aria-hidden={copy === 1 || undefined}>
                  {eventNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
