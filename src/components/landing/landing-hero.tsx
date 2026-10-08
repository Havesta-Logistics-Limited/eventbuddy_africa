"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { formatTicketFee, type TicketFee } from "@/lib/billing";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "./event-objects";
import { ProductShowcase } from "./product-showcase";

/* ------------------------------------------------------------------ nav */

const NAV_LINKS = [
  { href: "/discover", label: "Events" },
  { href: "/pricing", label: "Pricing" },
  { href: "/marketplace", label: "For Promoters" },
];

export function LandingNav() {
  const pathname = usePathname();
  const current = (href: string) => (pathname === href || pathname.startsWith(href + "/") ? "page" : undefined);
  // Phones: the section links live in a drop-down behind a menu button.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  return (
    <header className="lp-nav sticky top-0 z-40">
      <div className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-5 sm:px-8">
        {/* Logo renders its own home link */}
        <span className="shrink-0">
          <span className="sm:hidden"><Logo height={19} /></span>
          <span className="hidden sm:block"><Logo height={24} /></span>
        </span>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)} className="lp-navlink hidden sm:inline-flex">
              {l.label}
            </Link>
          ))}
          <span className="mx-2 hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />
          {/* on the promoter pages, sign-in opens with promoter wording */}
          <Link href={pathname.startsWith("/marketplace") || pathname.startsWith("/promote") ? "/login?as=promoter" : "/login"} className="lp-navlink lp-navlink--signin">Sign in</Link>
          {/* phones: Sign up lives in the menu, so Sign in has room to breathe */}
          <Link href="/signup" className="lp-navcta hidden sm:inline-flex">Sign up</Link>
          <button
            type="button"
            className="lp-navmenu sm:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="lp-mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </nav>
      </div>
      {menuOpen && (
        <nav id="lp-mobile-menu" className="lp-mobile-menu sm:hidden" aria-label="Menu">
          {NAV_LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={current(l.href)} onClick={() => setMenuOpen(false)}>
              {l.label}
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
          <Link href="/promote" onClick={() => setMenuOpen(false)} className="lp-mobile-menu-sub">
            Become a promoter
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/signup" onClick={() => setMenuOpen(false)} className="lp-mobile-menu-cta">
            Sign up free
          </Link>
        </nav>
      )}
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
          <span className="lp-title-accent">Then we run the whole event.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-[34rem] text-[15px] leading-relaxed text-[#C9BCD6] sm:text-lg">
          Registration, ticketing, check-in and a live event hub for any event: concerts, conferences, festivals,
          meetups. Run it yourself, or bring eventbuddy&apos;s own team on-site.
        </p>

        <Link href="/create" className="lp-cta mx-auto mt-9">
          Create Event
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <p className="mt-4 text-xs text-[#9D8DAD]">Free to start · {feeLabel} per ticket sold ·{" "}
          <Link href="/pricing" className="underline decoration-white/25 underline-offset-2 hover:text-white">lower fees on Grow and Scale</Link>
        </p>
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
