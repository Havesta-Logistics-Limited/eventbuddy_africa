"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import { Logo } from "@/components/logo";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "./event-objects";

/* The page's last three beats: FAQ (split row + accordion), the closing call to
 * action (every event object gathered in the glow, as the hero opened), and the
 * footer. FAQ copy comes from src/app/pricing/faqs.ts, the same source the
 * pricing page and its FAQPage structured data use. */

export function LandingFaq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState(0);
  return (
    <section className="lp-chapter" aria-labelledby="lp-faq-title">
      <div className="lp-rails">
        <div className="lp-split lp-split--faq">
          <div className="lp-cell">
            <h2 id="lp-faq-title" className="lp-faq-title">
              Questions, answered.
              <span>Everything else is on the pricing page.</span>
            </h2>
            <Link href="/pricing" className="lp-link">
              See all FAQs <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="lp-cell lp-cell--faq">
            <div className="lp-accordion lp-accordion--flush">
              {items.map((f, i) => {
                const isOpen = i === open;
                return (
                  <div key={f.q} className="lp-acc-item" data-open={isOpen || undefined}>
                    <h3>
                      <button
                        type="button"
                        id={`lp-faq-${i}`}
                        aria-expanded={isOpen}
                        aria-controls={`lp-faq-panel-${i}`}
                        onClick={() => setOpen(isOpen ? -1 : i)}
                      >
                        {f.q}
                        <Plus size={18} aria-hidden="true" />
                      </button>
                    </h3>
                    <div id={`lp-faq-panel-${i}`} role="region" aria-labelledby={`lp-faq-${i}`} className="lp-acc-body">
                      <div>
                        <p>{f.a}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LandingClose({ feeLabel }: { feeLabel: string }) {
  return (
    <section className="lp-close" aria-labelledby="lp-close-title">
      <div className="lp-close-objects" aria-hidden="true">
        <div className="lp-close-obj lp-close-ticket"><div className="lp-bob" style={{ ["--bob" as string]: "6.4s" }}><TicketObject className="lp-tilt-ticket" /></div></div>
        <div className="lp-close-obj lp-close-badge"><div className="lp-bob" style={{ ["--bob" as string]: "7.1s", animationDelay: "-2s" }}><BadgeObject className="lp-tilt-badge" /></div></div>
        <div className="lp-close-obj lp-close-band"><div className="lp-bob" style={{ ["--bob" as string]: "5.8s", animationDelay: "-1s" }}><WristbandObject className="lp-tilt-band" /></div></div>
        <div className="lp-close-obj lp-close-orbs"><div className="lp-bob" style={{ ["--bob" as string]: "6.9s", animationDelay: "-3s" }}><OrbsObject /></div></div>
      </div>
      <div className="lp-close-copy">
        <h2 id="lp-close-title" className="lp-close-title">
          Your next event deserves
          <span>a better system.</span>
        </h2>
        <p className="lp-close-sub">
          Stop juggling spreadsheets, WhatsApp groups, and walk-up chaos. Set up registration, ticketing, and check-in
          yourself, or bring eventbuddy&apos;s own team on-site to run it for you.
        </p>
        <Link href="/create" className="lp-cta mx-auto mt-9">
          Create Event
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
        <p className="mt-4 text-xs text-[#9D8DAD]">Free to start · {feeLabel} per ticket sold ·{" "}
          <Link href="/pricing" className="underline decoration-white/25 underline-offset-2 hover:text-white">lower fees on Grow and Scale</Link>
        </p>
      </div>
    </section>
  );
}

const FOOTER_COLUMNS = [
  { h: "Product", links: [{ l: "Discover events", href: "/discover" }, { l: "Pricing", href: "/pricing" }, { l: "Full-Service quote", href: "/managed-events" }] },
  { h: "For Promoters", links: [{ l: "Promoter marketplace", href: "/marketplace" }, { l: "Become a promoter", href: "/promote" }] },
  { h: "Account", links: [{ l: "Create Event", href: "/create" }, { l: "Sign in", href: "/login" }] },
  { h: "Company", links: [{ l: "Company profile", href: "/company" }, { l: "Contact", href: "/contact" }, { l: "Privacy Policy", href: "/privacy" }, { l: "Terms & Conditions", href: "/terms" }] },
];

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer-inner">
        <div className="lp-footer-brand">
          <Logo height={22} />
          <p>
            An all-in-one event platform for Africa: sell tickets, check guests in, and run the whole event day from one
            link.
          </p>
        </div>
        <nav className="lp-footer-cols" aria-label="Footer">
          {FOOTER_COLUMNS.map((c) => (
            <div key={c.h}>
              <p className="lp-footer-h">{c.h}</p>
              <ul>
                {c.links.map((x) => (
                  <li key={x.href}>
                    <Link href={x.href}>{x.l}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="lp-footer-bar">
        <p>© {new Date().getFullYear()} eventbuddy. All rights reserved.</p>
        <p>eventbuddy.africa</p>
      </div>
    </footer>
  );
}
