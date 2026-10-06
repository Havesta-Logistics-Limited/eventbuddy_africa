"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, Calendar, Check, ChevronRight, Clock, Megaphone, Mic2, Plus, Send, ShieldCheck } from "lucide-react";
import { BadgeObject } from "./event-objects";

/* The Event Hub as a split row: the four hub features as an accordion on the
 * left; on the right, a phone in the hub's own visual language (pink header
 * band, five-icon tab bar — see src/app/[orgSlug]/events/[eventId]/hub) that
 * switches to whichever feature is open. Sample event content. */

type FeatureId = "schedule" | "qa" | "polls" | "access";

const FEATURES: { id: FeatureId; title: string; body: string }[] = [
  { id: "schedule", title: "Full schedule & speakers", body: "Every session, time, and speaker, searchable in seconds, so nobody's asking where they need to be." },
  { id: "qa", title: "Live, moderated Q&A", body: "Attendees ask questions aimed at a specific speaker or session. Nothing reaches the room until you approve it." },
  { id: "polls", title: "Live polls", body: "Push a question to everyone at once and watch the results update as votes come in." },
  { id: "access", title: "Access, no extra effort", body: "A link on their confirmation gets them in automatically, or they scan one QR code posted at the venue." },
];

const TAB_FOR: Record<FeatureId, number> = { schedule: 0, qa: 2, polls: 3, access: 0 };

function HubSchedule() {
  const sessions = [
    { tag: "Keynote", tagCls: "bg-[#FFF3FD] text-[#C21FAF]", t: "Opening remarks", m: "9:00 AM · Amaka Obi", now: false },
    { tag: "Panel", tagCls: "bg-[#F1EBFE] text-[#6D28D9]", t: "Building for African markets", m: "10:30 AM · 3 speakers", now: true },
    { tag: "Workshop", tagCls: "bg-[#FFF1E6] text-[#B8460A]", t: "Pricing your first product", m: "1:00 PM · Seyi Adeyemi", now: false },
  ];
  return (
    <div className="space-y-2">
      {sessions.map((s) => (
        <div key={s.t} className={`rounded-xl border p-3 ${s.now ? "border-[#C21FAF]/40 bg-[#FFF3FD]/50" : "border-slate-100"}`}>
          <div className="flex items-center justify-between">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${s.tagCls}`}>{s.tag}</span>
            {s.now && <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-[#C21FAF]"><span className="lp-live-dot bg-[#C21FAF]!" /> Now</span>}
          </div>
          <p className="mt-1.5 text-[13px] font-semibold text-slate-900">{s.t}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{s.m}</p>
        </div>
      ))}
    </div>
  );
}

function HubQA() {
  return (
    <div className="space-y-2">
      <div className="lp-pop rounded-xl border border-amber-200 bg-amber-50/70 p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-700"><Clock size={11} /> Waiting for your approval</div>
        <p className="mt-1.5 text-[13px] leading-snug text-slate-800">Will the slides be shared after the panel?</p>
        <div className="mt-2.5 flex gap-1.5">
          <span className="flex-1 rounded-lg bg-[#C21FAF] py-1.5 text-center text-[11px] font-semibold text-white">Approve</span>
          <span className="flex-1 rounded-lg border border-slate-200 bg-white py-1.5 text-center text-[11px] font-semibold text-slate-500">Hide</span>
        </div>
      </div>
      {[
        { q: "How do you price for markets with low card usage?", to: "Building for African markets", v: 24 },
      ].map((x) => (
        <div key={x.q} className="rounded-xl border border-slate-100 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700"><ShieldCheck size={11} /> Approved · to {x.to}</div>
          <p className="mt-1.5 text-[13px] leading-snug text-slate-800">{x.q}</p>
          <p className="mt-1 text-[10px] tabular-nums text-slate-400">▲ {x.v} upvotes</p>
        </div>
      ))}
    </div>
  );
}

function HubPolls() {
  const opts = [
    { o: "Funding", p: 42, c: "#C21FAF" },
    { o: "Hiring", p: 31, c: "#8B5CF6" },
    { o: "Distribution", p: 27, c: "#FF7D2D" },
  ];
  return (
    <div className="rounded-xl border border-slate-100 p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700"><span className="lp-live-dot" /> Live poll</div>
      <p className="mt-1.5 text-[13px] font-semibold leading-snug text-slate-900">What should the next panel cover?</p>
      <div className="mt-3 space-y-2.5">
        {opts.map((x) => (
          <div key={x.o}>
            <div className="flex justify-between text-[11px] text-slate-600"><span>{x.o}</span><span className="tabular-nums">{x.p}%</span></div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="lp-bar h-full rounded-full" style={{ width: `${x.p}%`, background: x.c }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] tabular-nums text-slate-400">418 votes · updating live</p>
    </div>
  );
}

function HubAccess() {
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-slate-100 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Your confirmation email</p>
        <p className="mt-1 text-[13px] font-semibold text-slate-900">You&apos;re registered for Africa Creators Summit</p>
        <p className="mt-1 text-[11px] text-slate-500">Reference K7QX-4R2M</p>
        <span className="mt-2.5 block rounded-lg bg-[#C21FAF] py-2 text-center text-[11px] font-semibold text-white">Open event hub</span>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3">
        <div className="grid h-14 w-14 shrink-0 grid-cols-5 gap-px rounded-md bg-white p-1 ring-1 ring-slate-200" aria-hidden="true">
          {Array.from({ length: 25 }, (_, i) => (
            <span key={i} className={[0, 1, 3, 4, 5, 9, 12, 15, 19, 20, 21, 23, 24, 7, 17].includes(i) ? "bg-[#170821]" : ""} />
          ))}
        </div>
        <div>
          <p className="text-[12px] font-semibold text-slate-900">At the venue</p>
          <p className="text-[11px] leading-snug text-slate-500">One QR poster opens the hub. No app, no extra sign-up.</p>
        </div>
      </div>
    </div>
  );
}

const PANELS: Record<FeatureId, () => React.JSX.Element> = { schedule: HubSchedule, qa: HubQA, polls: HubPolls, access: HubAccess };

export function LandingHub() {
  const [open, setOpen] = useState<FeatureId>("schedule");
  const Panel = PANELS[open];
  const activeTab = TAB_FOR[open];

  return (
    <section className="lp-chapter" aria-labelledby="lp-hub-title">
      <div className="lp-rails">
        <div className="lp-chapter-intro">
          <div className="lp-chapter-icon lp-chapter-icon--badge" aria-hidden="true">
            <div className="lp-bob" style={{ ["--bob" as string]: "7.2s" }}><BadgeObject className="lp-tilt-badge" /></div>
          </div>
          <h2 id="lp-hub-title" className="lp-chapter-title">
            Check-in isn&apos;t the finish line.
            <span>Neither is your event page.</span>
          </h2>
        </div>

        <div className="lp-split">
          <div className="lp-cell">
            <p className="lp-lead">
              <strong>The Event Hub.</strong> The moment someone registers, they get their own event hub: schedule,
              speakers, live Q&amp;A, and updates, all in one place. You stay in control of what goes live; they stay
              engaged from the first session to the last.
            </p>
            <Link href="/signup" className="lp-link">
              Start for free <ChevronRight size={15} aria-hidden="true" />
            </Link>

            <div className="lp-accordion">
              {FEATURES.map((f) => {
                const isOpen = f.id === open;
                return (
                  <div key={f.id} className="lp-acc-item" data-open={isOpen || undefined}>
                    <h3>
                      <button
                        type="button"
                        id={`lp-acc-${f.id}`}
                        aria-expanded={isOpen}
                        aria-controls={`lp-acc-panel-${f.id}`}
                        onClick={() => setOpen(f.id)}
                      >
                        {f.title}
                        <Plus size={18} aria-hidden="true" />
                      </button>
                    </h3>
                    <div id={`lp-acc-panel-${f.id}`} role="region" aria-labelledby={`lp-acc-${f.id}`} className="lp-acc-body">
                      <div>
                        <p>{f.body}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lp-hubstage" aria-hidden="true">
            <div className="lp-hubphone">
              <div className="lp-hubphone-head">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/65">Event Hub</p>
                <p className="mt-1 text-[17px] font-semibold leading-tight text-white">Africa Creators Summit</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/80"><Calendar size={11} /> 21 November · 9:00 AM</p>
              </div>
              <div className="lp-hubphone-body">
                <div className="flex border-b border-slate-100">
                  {[Calendar, Mic2, Send, BarChart3, Megaphone].map((Icon, i) => (
                    <div key={i} className={`flex flex-1 justify-center border-b-2 py-2.5 transition-colors ${i === activeTab ? "border-[#C21FAF]" : "border-transparent"}`}>
                      <Icon size={14} className={i === activeTab ? "text-[#C21FAF]" : "text-slate-300"} />
                    </div>
                  ))}
                </div>
                <div key={open} className="lp-scene p-3">
                  <Panel />
                </div>
              </div>
              {open === "qa" && (
                <div className="lp-pop lp-hubtoast"><Check size={13} strokeWidth={3} /> You decide what goes live</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
