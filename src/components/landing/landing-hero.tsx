"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { formatTicketFee, type TicketFee } from "@/lib/billing";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "./event-objects";
import { ProductShowcase } from "./product-showcase";

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

/* ------------------------------------------------------------------ hero */

export function LandingHero({ fee }: { fee: TicketFee }) {
  const feeLabel = formatTicketFee(fee);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

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

      {/* objects rise out of the pool; the product tour window then rises over them */}
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

        <div className="lp-rise">
          <ProductShowcase fee={fee} />
        </div>
      </div>
    </section>
  );
}
