"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarDays, MapPin, ScanLine, Ticket, Users, LayoutGrid, Megaphone, Settings } from "lucide-react";
import { Logo } from "@/components/logo";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "./event-objects";

/* ------------------------------------------------------------------ nav */

export function LandingNav() {
  return (
    <header className="lp-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8">
        {/* Logo renders its own home link */}
        <span className="shrink-0">
          <span className="sm:hidden"><Logo height={19} /></span>
          <span className="hidden sm:block"><Logo height={24} /></span>
        </span>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <Link href="/discover" className="lp-navlink hidden sm:inline-flex">Events</Link>
          <Link href="/pricing" className="lp-navlink hidden sm:inline-flex">Pricing</Link>
          <span className="mx-2 hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />
          <Link href="/login" className="lp-navlink">Sign in</Link>
          <Link href="/signup" className="lp-navcta">Sign up</Link>
        </nav>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ stars */

// Seeded so the server render and the client hydrate to identical markup.
function makeStars(n: number) {
  let s = 20261006;
  const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, () => {
    const x = r() * 100;
    // denser toward the pool at the bottom-centre
    const y = 30 + Math.pow(r(), 0.7) * 70;
    return { x, y, size: r() < 0.82 ? 1.5 : 2.5, delay: r() * 6, dur: 3 + r() * 4, o: 0.25 + r() * 0.6 };
  });
}
const STARS = makeStars(90);

/* ------------------------------------------------------------------ product window */

const CHECKINS = [
  { n: "Amara Okafor", t: "Regular" },
  { n: "Tunde Bakare", t: "VIP" },
  { n: "Ngozi Eze", t: "Regular" },
  { n: "Kola Martins", t: "Regular" },
  { n: "Halima Bello", t: "VIP" },
  { n: "Seyi Adeyemi", t: "Regular" },
  { n: "Emeka Obi", t: "Regular" },
  { n: "Ada Nwosu", t: "VIP" },
];
const SALES = [12, 18, 15, 26, 22, 34, 41, 38, 52, 47, 63, 71];

function ProductWindow({ live }: { live: boolean }) {
  // A live check-in feed: a new arrival lands at the top every few seconds and the
  // counter ticks with it. Only runs while the window is on screen.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 2600);
    return () => window.clearInterval(id);
  }, [live]);
  const checkedIn = 87 + tick;
  const feed = Array.from({ length: 5 }, (_, i) => CHECKINS[(tick - i + CHECKINS.length * 100) % CHECKINS.length]);
  const max = Math.max(...SALES);

  return (
    <div className="lp-window" role="img" aria-label="The eventbuddy organizer dashboard for a sample event, showing ticket sales and a live check-in feed. Sample data.">
      <div className="lp-window-chrome">
        <span /><span /><span />
        <p>eventbuddy.africa/dashboard</p>
      </div>
      <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[64px_1fr]">
        {/* app rail */}
        <div className="flex flex-col items-center gap-5 border-r border-slate-200/80 bg-slate-50 py-5 text-slate-400">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#C21FAF] text-white"><LayoutGrid size={16} /></span>
          <Ticket size={18} />
          <ScanLine size={18} />
          <Users size={18} />
          <Megaphone size={18} />
          <Settings size={18} className="mt-auto" />
        </div>

        <div className="min-w-0 p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[15px] font-semibold text-slate-900 sm:text-lg">Rooftop Sessions</h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  <span className="lp-live-dot" /> Live
                </span>
              </div>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> Sat 14 Nov · 7pm</span>
                <span className="inline-flex items-center gap-1"><MapPin size={12} /> Victoria Island, Lagos</span>
              </p>
            </div>
            <span className="hidden rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 sm:inline-block">Share link</span>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2.5 sm:gap-3">
            {[
              { k: "Sold", v: "124", s: "of 200 tickets" },
              { k: "Sales", v: "₦1.6m", s: "to your bank" },
              { k: "Checked in", v: String(checkedIn), s: "at the door" },
            ].map((m) => (
              <div key={m.k} className="rounded-xl border border-slate-200/80 bg-white p-2.5 sm:p-3.5">
                <p className="truncate text-[10px] font-medium text-slate-500 sm:text-xs">{m.k}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{m.v}</p>
                <p className="text-[10px] leading-tight text-slate-400 sm:text-[11px]">{m.s}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[1.35fr_1fr]">
            <div className="rounded-xl border border-slate-200/80 bg-white p-3.5">
              <div className="flex items-baseline justify-between">
                <p className="text-xs font-medium text-slate-600">Sales, last 12 days</p>
                <p className="text-[11px] text-slate-400">Regular · VIP</p>
              </div>
              <div className="mt-3 flex h-28 items-end gap-1.5 sm:h-36">
                {SALES.map((v, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col justify-end gap-px">
                    <div className="rounded-t-[3px] bg-[#8B5CF6]" style={{ height: `${(v / max) * 30}%` }} />
                    <div className="rounded-b-[3px] bg-[#C21FAF]" style={{ height: `${(v / max) * 62}%` }} />
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden rounded-xl border border-slate-200/80 bg-white p-3.5 sm:block">
              <p className="text-xs font-medium text-slate-600">Check-ins</p>
              <ul className="mt-2 space-y-1.5">
                {feed.map((c, i) => (
                  <li key={`${tick}-${i}`} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 ${i === 0 ? "lp-feed-new bg-emerald-50" : ""}`}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                      {c.n.split(" ").map((p) => p[0]).join("")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800">{c.n}</span>
                    <span className="text-[10px] text-slate-400">{c.t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

export function LandingHero({ feeLabel }: { feeLabel: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const [windowLive, setWindowLive] = useState(false);

  // Scroll-linked rise: --rise runs 0 → 1 as the product window travels from the
  // bottom of the viewport up to its resting place. CSS reads it for the window's
  // lift and for tucking the objects back into the glow behind it.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      el.style.setProperty("--rise", "1");
      return;
    }
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.75)));
      el.style.setProperty("--rise", p.toFixed(4));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(([e]) => setWindowLive(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    router.push(v ? `/signup?email=${encodeURIComponent(v)}` : "/signup");
  };

  return (
    <section className="lp-hero relative isolate overflow-hidden" aria-labelledby="lp-hero-title">
      {/* the glow pool and its stars */}
      <div className="lp-pool" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="lp-star"
            style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, opacity: s.o, animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
          />
        ))}
      </div>

      <div className="relative mx-auto max-w-[1240px] px-5 pt-20 text-center sm:px-8 sm:pt-28">
        <h1 id="lp-hero-title" className="lp-title mx-auto max-w-[15ch] sm:max-w-none">
          Sell your tickets.
          <br />
          <span className="lp-title-accent">Then run the whole event.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[34rem] text-[15px] leading-relaxed text-[#C9BCD6] sm:text-lg">
          Registration, ticketing, check-in and a live event hub for any event: concerts, conferences, festivals,
          meetups. Run it yourself, or bring eventbuddy&apos;s own team on-site.
        </p>

        <div className="mx-auto mt-9 flex max-w-[36rem] flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
          <form onSubmit={submit} className="lp-signup flex-1">
            <label htmlFor="lp-email" className="sr-only">Email address</label>
            <input
              id="lp-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit">
              Start for free
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </form>
          <Link href="/pricing" className="lp-ghost">See pricing</Link>
        </div>
        <p className="mt-4 text-xs text-[#9D8DAD]">Free to start · {feeLabel} on tickets sold · no subscription</p>
      </div>

      {/* objects rise out of the pool; the product window then rises over them */}
      <div ref={stageRef} className="lp-stage relative mx-auto mt-10 max-w-[1240px] px-4 sm:mt-14 sm:px-8">
        <div className="lp-objects" aria-hidden="true">
          <div className="lp-obj lp-obj-ticket" style={{ ["--d" as string]: "0.35s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "6.2s" }}><TicketObject className="lp-tilt-ticket" /></div>
          </div>
          <div className="lp-obj lp-obj-badge" style={{ ["--d" as string]: "0.6s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "7s", animationDelay: "-2s" }}><BadgeObject className="lp-tilt-badge" /></div>
          </div>
          <div className="lp-obj lp-obj-band" style={{ ["--d" as string]: "0.85s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "5.6s", animationDelay: "-1s" }}><WristbandObject className="lp-tilt-band" /></div>
          </div>
          <div className="lp-obj lp-obj-orbs" style={{ ["--d" as string]: "1.1s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "6.6s", animationDelay: "-3s" }}><OrbsObject /></div>
          </div>
        </div>

        <div className="lp-window-wrap">
          <ProductWindow live={windowLive} />
        </div>
      </div>
    </section>
  );
}
