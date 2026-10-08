"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarRange,
  Check,
  Copy,
  CreditCard,
  Handshake,
  Layers,
  LayoutDashboard,
  Lock,
  Megaphone,
  MessageCircle,
  ReceiptText,
  ScanLine,
  Share2,
  Store,
  Ticket,
  Users,
} from "lucide-react";
import { LandingNav } from "@/components/landing/landing-hero";
import { LandingFooter } from "@/components/landing/landing-close";
import { TrustedBy } from "@/components/landing/trusted-by";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "@/components/landing/event-objects";
import { ScenePlayer, type SceneId } from "@/components/landing/product-showcase";
import { DEFAULT_TICKET_FEE, fetchCurrentTicketFee, formatTicketFee } from "@/lib/billing";
import { copyText } from "@/lib/copy-text";

/** Fires once when the element first scrolls into view (and stays "in"). */
function useInView<T extends Element>(threshold = 0.25) {
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
    }, { threshold, rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, seen };
}

/** Tracks whether the element is on screen right now (scenes only play then). */
function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, on };
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, seen } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`cp-reveal ${className}`} data-in={seen || undefined} style={{ ["--cp-d" as string]: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** A real-world photo shown instead of the product scene, with eventbuddy cards floating over it. */
type Photo = { src: string; alt: string; chips: { icon: typeof Ticket; title: string; sub: string; tone: "green" | "pink" | "dark"; pos: string }[] };
type Feature = { id: SceneId; icon: typeof Ticket; kicker: string; title: string; body: string; points: string[]; photo?: Photo };

const FEATURES: (fee: string) => Feature[] = (fee) => [
  {
    id: "sell",
    icon: Ticket,
    kicker: "Ticketing and registration",
    title: "Sell tickets in minutes",
    body: "Create your event page, add ticket types and publish. Buyers pay by card, bank transfer or USSD, and get a QR ticket by email straight away.",
    points: ["Single, VIP and group tickets, with one QR per guest", "Discount codes, sales windows and capacity limits", `Free to start: you only pay ${fee} when a ticket sells`],
  },
  {
    id: "share",
    icon: Share2,
    kicker: "Reach",
    title: "One link does it all",
    body: "A single link for buying tickets, registering and the event hub, ready for WhatsApp, Instagram and anywhere your audience is.",
    points: ["Share cards that preview properly", "Multi-city tours on one page, with a ticket button per city", "Guest lists and invite-only events when you need them"],
  },
  {
    id: "promote",
    icon: Megaphone,
    kicker: "Promoters",
    title: "Promoters sell for you",
    body: "Open your event to promoters on the eventbuddy marketplace. Each gets their own link and earns commission only on tickets they sell. We track every sale and pay them for you.",
    points: ["You set the commission and who can join", "Badges show which promoters have a track record", "Every click, sale and commission visible to you"],
  },
  {
    id: "checkin",
    icon: ScanLine,
    kicker: "On the day",
    title: "Fast check-in at the door",
    body: "Door staff scan QR tickets with any phone: no app to install, no account needed. Repeat and cancelled tickets are caught instantly, with sounds you can hear over a queue.",
    points: ["A kiosk to register walk-ups on the spot", "Early check-in when doors open before the start time", "A live count of who's in"],
    photo: {
      src: "/company/checkin-door.jpg",
      alt: "Door staff scanning a guest's QR ticket on a phone at a concert entrance",
      chips: [
        { icon: Check, title: "Amara Okafor", sub: "Regular · checked in", tone: "green", pos: "cp-chip--bl" },
        { icon: ScanLine, title: "89 / 124 in", sub: "Door A · live", tone: "dark", pos: "cp-chip--tr" },
      ],
    },
  },
  {
    id: "exhibit",
    icon: Store,
    kicker: "Exhibitors",
    title: "Sell stands to exhibitors",
    body: "Businesses apply for a stand, you approve, they pay. On the day, their staff scan visitors' tickets to collect leads, and attendees find them on your floor plan.",
    points: ["Paid or free stands, with staff passes included", "An exhibitor portal for passes and lead capture", "An exhibitor directory and floor plan in the event hub"],
    photo: {
      src: "/company/exhibitor-stands.jpg",
      alt: "Exhibitors at their stands in a busy expo hall, one scanning a visitor's ticket",
      chips: [
        { icon: Check, title: "Lead captured", sub: "Glow Skincare · Stand B2", tone: "pink", pos: "cp-chip--bl" },
        { icon: Store, title: "24 stands", sub: "18 confirmed · ₦2.7m", tone: "dark", pos: "cp-chip--tr" },
      ],
    },
  },
  {
    id: "engage",
    icon: Users,
    kicker: "Attendee experience",
    title: "A live hub for every attendee",
    body: "Every ticket opens a personal event hub: the agenda, speakers, moderated Q&A, live polls and announcements, all from the same link.",
    points: ["You approve questions before they go live", "Live polls with results as votes come in", "A post-event survey to hear how it went"],
  },
  {
    id: "paid",
    icon: LayoutDashboard,
    kicker: "Money",
    title: "See every naira, get paid safely",
    body: "Every sale, fee and payout is in your dashboard. Payouts go to your verified bank account, and refunds and disputes are tracked against each sale.",
    points: ["Clear, per-ticket pricing, with no subscription needed", "Verified organizers get paid sooner", "Sales charts and exports for your records"],
  },
];

const EVENT_KINDS = ["Concerts and shows", "Conferences and summits", "Festivals", "Expos and trade shows", "Meetups and workshops", "Church and community events", "Corporate events", "Tours across cities"];

function FeatureRow({ f, fee, flip, index }: { f: Feature; fee: typeof DEFAULT_TICKET_FEE; flip: boolean; index: number }) {
  const { ref: screenRef, on } = useOnScreen<HTMLDivElement>();
  const { ref: riseRef, seen } = useInView<HTMLDivElement>(0.15);
  return (
    <section className="cp-feature" data-flip={flip || undefined} aria-labelledby={`cp-f-${f.id}`}>
      <Reveal className="cp-feature-copy">
        <p className="cp-kicker">
          <span className="cp-kicker-num">{String(index + 1).padStart(2, "0")}</span>
          <f.icon size={15} aria-hidden="true" /> {f.kicker}
        </p>
        <h3 id={`cp-f-${f.id}`} className="cp-feature-title">{f.title}</h3>
        <p className="cp-feature-body">{f.body}</p>
        <ul className="cp-points">
          {f.points.map((p) => (
            <li key={p}>
              <Check size={15} aria-hidden="true" /> {p}
            </li>
          ))}
        </ul>
      </Reveal>
      <div ref={riseRef} className="cp-feature-visual" data-in={seen || undefined}>
        <div ref={screenRef} className="cp-visual-glow" aria-hidden="true" />
        {f.photo ? (
          <figure className="cp-visual-inner cp-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.photo.src} alt={f.photo.alt} width={1344} height={752} loading="lazy" />
            {f.photo.chips.map((c, i) => (
              <span key={c.title} className={`cp-chip cp-chip--${c.tone} ${c.pos}`} style={{ ["--cp-d" as string]: `${700 + i * 350}ms` }} aria-hidden="true">
                <span className="cp-chip-icon"><c.icon size={15} /></span>
                <span>
                  <strong>{c.title}</strong>
                  <small>{c.sub}</small>
                </span>
              </span>
            ))}
          </figure>
        ) : (
          <div className="cp-visual-inner" aria-hidden="true">
            <ScenePlayer id={f.id} fee={fee} active={on} />
          </div>
        )}
      </div>
    </section>
  );
}

function ShareButtons({ align = "center" }: { align?: "center" | "start" }) {
  const [copied, setCopied] = useState(false);
  // always the live address, so a link shared from anywhere opens the real page
  const url = "https://eventbuddy.africa/company";
  const text = `eventbuddy: tickets, check-in, promoters, exhibitors and a live hub for any event. ${url}`;
  return (
    <div className={`flex flex-wrap gap-2 ${align === "center" ? "justify-center" : ""}`}>
      <a className="cp-share" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        <MessageCircle size={15} aria-hidden="true" /> Share on WhatsApp
      </a>
      <button
        type="button"
        className="cp-share"
        onClick={() =>
          copyText(url).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            },
            () => {}
          )
        }
      >
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />} {copied ? "Link copied" : "Copy link"}
      </button>
    </div>
  );
}

/**
 * /company: the company profile organizers share with prospective clients.
 * What eventbuddy is, in plain terms, with each feature shown working
 * (the landing page's live product scenes), how to work with us, pricing
 * at a glance, and a word from the founder.
 */
export function CompanyContent() {
  const [fee, setFee] = useState(DEFAULT_TICKET_FEE);
  useEffect(() => {
    fetchCurrentTicketFee().then(setFee).catch(() => {});
  }, []);
  const feeLabel = formatTicketFee(fee);
  const features = FEATURES(feeLabel);

  return (
    <div className="cp min-h-screen bg-[#07030c] text-white">
      <LandingNav />

      {/* ---- hero ---- */}
      <section className="cp-hero">
        <div className="cp-hero-glow" aria-hidden="true" />
        <div className="cp-hero-copy">
          <p className="cp-eyebrow">Company profile</p>
          <h1 className="cp-h1">
            Everything your event needs.
            <span>One platform. One team.</span>
          </h1>
          <p className="cp-lead">
            eventbuddy is an event platform for Africa, built for any kind of event: concerts, conferences, festivals, expos and meetups. We sell your
            tickets, help fill the room through promoters and exhibitors, check people in at the door, keep attendees engaged, and handle the money.
            Run it yourself, or bring our team on-site.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="lp-cta">
              Talk to our team <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-5">
            <ShareButtons />
          </div>
        </div>
        <div className="lp-objects cp-objects" aria-hidden="true">
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
      </section>

      {/* ---- founder ---- */}
      <section className="cp-section" aria-labelledby="cp-founder">
        <div className="cp-founder">
          <Reveal className="cp-founder-photo">
            <div className="cp-founder-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/company/noel-amobeda-founder.jpg" alt="Noel Amobeda, founder of eventbuddy" width={1100} height={725} loading="lazy" />
            </div>
          </Reveal>
          <Reveal delay={120} className="cp-founder-copy">
            <p className="cp-eyebrow !text-left">From our founder</p>
            <h2 id="cp-founder" className="cp-h2 !text-left">Less chaos. Better events.</h2>
            <blockquote className="cp-quote">
              <p>
                We built eventbuddy because running an event shouldn&apos;t be chaotic, and event day shouldn&apos;t be full of surprises. Too many organizers juggle
                registrations, payments, check-ins and staff across spreadsheets, forms and WhatsApp.
              </p>
              <p>
                eventbuddy brings all of it into one place, so you always know what&apos;s happening before, during and after your event. And when you&apos;d rather step
                back and host, our team is there to run it with you.
              </p>
            </blockquote>
            <p className="cp-sign">
              <strong>Noel Amobeda</strong>
              <span>Founder, eventbuddy Africa</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ---- what we are ---- */}
      <section className="cp-section" aria-labelledby="cp-what">
        <Reveal>
          <p className="cp-eyebrow">What eventbuddy is</p>
          <h2 id="cp-what" className="cp-h2">Three things, working together</h2>
        </Reveal>
        <div className="cp-trio">
          {[
            { icon: Layers, t: "A platform", b: "Self-serve software: create your event, sell tickets, run check-in and the event hub from one dashboard. Free to start." },
            { icon: Handshake, t: "A team", b: "Full-service: our people on-site, managing check-in, attendee flow, registration and staff, so you can focus on hosting." },
            { icon: Megaphone, t: "A network", b: "Promoters who sell your tickets on commission, and exhibitors who book stands, all tracked and paid through eventbuddy." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 110} className="cp-card">
              <span className="cp-card-icon"><c.icon size={20} aria-hidden="true" /></span>
              <h3 className="cp-card-title">{c.t}</h3>
              <p className="cp-card-body">{c.b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---- features ---- */}
      <section className="cp-section cp-section--features" aria-labelledby="cp-features">
        <Reveal>
          <p className="cp-eyebrow">What you get</p>
          <h2 id="cp-features" className="cp-h2">From the first ticket to the last check-in</h2>
          <p className="cp-sub">Every screen below is the real product, playing live.</p>
        </Reveal>
        {features.map((f, i) => (
          <FeatureRow key={f.id} f={f} fee={fee} flip={i % 2 === 1} index={i} />
        ))}
      </section>

      {/* ---- how to work with us ---- */}
      <section className="cp-section" aria-labelledby="cp-ways">
        <Reveal>
          <p className="cp-eyebrow">Working with us</p>
          <h2 id="cp-ways" className="cp-h2">Run it yourself, or let us run it</h2>
        </Reveal>
        <div className="cp-duo">
          <Reveal className="cp-card cp-card--big">
            <span className="cp-card-icon"><LayoutDashboard size={20} aria-hidden="true" /></span>
            <h3 className="cp-card-title">Self-serve</h3>
            <p className="cp-card-body">Sign up free and do it all from your dashboard: tickets, promoters, exhibitors, check-in staff and the event hub. Pay only when a ticket sells.</p>
            <Link href="/signup" className="cp-inline-link">Sign up free <ArrowRight size={14} aria-hidden="true" /></Link>
          </Reveal>
          <Reveal delay={120} className="cp-card cp-card--big cp-card--accent">
            <span className="cp-card-icon"><Handshake size={20} aria-hidden="true" /></span>
            <h3 className="cp-card-title">Full-service</h3>
            <p className="cp-card-body">Our team runs the event with you: setup, door check-in, attendee flow, registration desks and staff coordination on the day, with a report afterwards.</p>
            <Link href="/managed-events" className="cp-inline-link">Get a quote <ArrowRight size={14} aria-hidden="true" /></Link>
          </Reveal>
        </div>
      </section>

      {/* ---- any event ---- */}
      <section className="cp-section" aria-labelledby="cp-kinds">
        <Reveal>
          <p className="cp-eyebrow">Who it&apos;s for</p>
          <h2 id="cp-kinds" className="cp-h2">Built for any event</h2>
        </Reveal>
        <Reveal delay={80}>
          <ul className="cp-kinds">
            {EVENT_KINDS.map((k, i) => (
              <li key={k} style={{ ["--cp-i" as string]: i }}>
                <CalendarRange size={15} aria-hidden="true" /> {k}
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* ---- pricing + trust ---- */}
      <section className="cp-section" aria-labelledby="cp-trust">
        <div className="cp-duo">
          <Reveal className="cp-card cp-card--big">
            <span className="cp-card-icon"><ReceiptText size={20} aria-hidden="true" /></span>
            <p className="cp-eyebrow !mb-1 text-left">Pricing at a glance</p>
            <h3 className="cp-card-title">Free to start. Pay per ticket sold.</h3>
            <p className="cp-card-body">
              Creating events, free registrations and check-in cost nothing. On paid tickets, eventbuddy takes {feeLabel} per ticket sold. Busy organizers can move to the Grow or
              Scale plan for lower fees.
            </p>
            <Link href="/pricing" className="cp-inline-link">See pricing <ArrowRight size={14} aria-hidden="true" /></Link>
          </Reveal>
          <Reveal delay={120} className="cp-card cp-card--big">
            <span className="cp-card-icon"><Lock size={20} aria-hidden="true" /></span>
            <p className="cp-eyebrow !mb-1 text-left">Trust</p>
            <h3 id="cp-trust" className="cp-card-title">Your money and your attendees, handled properly</h3>
            <ul className="cp-points cp-points--tight">
              <li><CreditCard size={15} aria-hidden="true" /> Payments by Paystack: card, bank transfer and USSD</li>
              <li><BadgeCheck size={15} aria-hidden="true" /> Payouts to verified bank accounts, every one recorded</li>
              <li><ReceiptText size={15} aria-hidden="true" /> Refunds and disputes tracked against each sale</li>
              <li><Lock size={15} aria-hidden="true" /> Attendee data kept private and never sold</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <TrustedBy />

      {/* ---- close ---- */}
      <section className="cp-close" aria-labelledby="cp-close">
        <div className="cp-close-glow" aria-hidden="true" />
        <Reveal>
          <h2 id="cp-close" className="cp-h2">Ready when you are</h2>
          <p className="cp-sub">Tell us about your event and we&apos;ll show you how eventbuddy would run it.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/contact" className="lp-cta">
              Talk to our team <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-6">
            <ShareButtons />
          </div>
        </Reveal>
      </section>

      <LandingFooter />
    </div>
  );
}
