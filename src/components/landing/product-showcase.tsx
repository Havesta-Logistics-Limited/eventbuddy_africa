"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHoverIntent } from "@/lib/use-hover-intent";
import {
  ArrowBigUp,
  Bookmark,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  LayoutGrid,
  Link2,
  Mail,
  MapPin,
  Megaphone,
  Pause,
  Play,
  ScanLine,
  Settings,
  Store,
  Ticket,
  TriangleAlert,
  Users,
} from "lucide-react";
import { formatNaira, formatTicketFee, ticketFeeMinor, type TicketFee } from "@/lib/billing";

/* ==========================================================================
 * Product showcase — the hero's window, with seven tabs that each play a short,
 * looping demo of a real part of the product. Every scene is driven by one
 * clock (seconds since the tab started) so pause, tab jumps and reduced motion
 * all behave the same way. Names, prices and counts are sample data.
 * ========================================================================== */

type SceneProps = { t: number; fee: TicketFee };

const ease = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);
const prog = (t: number, at: number, dur: number) => ease((t - at) / dur);
/** Characters of `s` revealed by a typing animation running [at, at + dur]. */
const typed = (s: string, t: number, at: number, dur: number) => s.slice(0, Math.floor(Math.min(1, Math.max(0, (t - at) / dur)) * s.length));
const after = (t: number, at: number) => t >= at;

function Caret({ on }: { on: boolean }) {
  return on ? <span className="ml-px inline-block h-[1.05em] w-[2px] translate-y-[2px] animate-pulse bg-[#C21FAF]" aria-hidden="true" /> : null;
}

/* ---------------------------------------------------------------- 1 · Sell */

function SellScene({ t }: SceneProps) {
  const name = typed("Rooftop Sessions", t, 0.4, 1.1);
  const date = typed("Sat 14 Nov · 7pm", t, 1.8, 0.7);
  const venue = typed("Victoria Island, Lagos", t, 2.7, 0.8);
  const tiers = [
    { n: "Regular", p: "₦10,000", q: "150 available", at: 3.8 },
    { n: "VIP", p: "₦25,000", q: "50 available", at: 4.3 },
  ];
  const live = after(t, 5.7);
  const pressed = t > 5.45 && t < 5.7;

  return (
    <div className="grid h-full gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex min-w-0 flex-col">
        <p className="text-lg font-semibold tracking-tight text-slate-900">New event</p>
        <p className="text-xs text-slate-500">Paid · In person</p>
        <div className="mt-3 space-y-2.5">
          {[
            { l: "Event name", v: name, on: t > 0.3 && t < 1.7 },
            { l: "Date & time", v: date, on: t > 1.7 && t < 2.6 },
            { l: "Venue", v: venue, on: t > 2.6 && t < 3.7 },
          ].map((f) => (
            <label key={f.l} className="block">
              <span className="text-[11px] font-medium text-slate-500">{f.l}</span>
              <span className={`mt-1 flex h-9 items-center rounded-lg border px-3 text-sm text-slate-900 ${f.on ? "border-[#C21FAF] ring-2 ring-[#C21FAF]/15" : "border-slate-200"}`}>
                {f.v}
                <Caret on={f.on} />
              </span>
            </label>
          ))}
          <div>
            <span className="text-[11px] font-medium text-slate-500">Tickets</span>
            <div className="mt-1 space-y-2">
              {tiers.map((tr) => {
                const p = prog(t, tr.at, 0.35);
                return (
                  <div key={tr.n} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5" style={{ opacity: p, transform: `translateY(${(1 - p) * 8}px)` }}>
                    <span className="text-sm font-medium text-slate-800">{tr.n}</span>
                    <span className="flex items-center gap-3">
                      <span className="hidden text-[11px] text-slate-400 sm:inline">{tr.q}</span>
                      <span className="text-sm font-semibold text-[#C21FAF]">{tr.p}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <button
          type="button"
          tabIndex={-1}
          className={`mt-auto flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white transition-colors ${live ? "bg-emerald-600" : "bg-[#C21FAF]"}`}
          style={{ transform: pressed ? "scale(0.98)" : undefined }}
        >
          {live ? <><Check size={16} /> Live — tickets on sale</> : "Publish event"}
        </button>
      </div>

      {/* the public event page, filling in as the organizer types */}
      <div className="hidden min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 lg:flex">
        <div className="relative h-36 shrink-0 bg-[linear-gradient(120deg,#6D28D9,#C21FAF_60%,#FF7D2D)] p-4">
          <p className="text-[10px] font-bold tracking-[0.18em] text-white/85">{date ? date.toUpperCase() : " "}</p>
          <p className="mt-6 font-[family-name:var(--font-hero)] text-[28px] font-bold uppercase leading-none tracking-tight text-white">{name || " "}</p>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="text-base font-semibold text-slate-900">{name || <span className="text-slate-300">Your event</span>}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} /> {venue || "—"}</p>
          <div className="mt-4 space-y-2">
            {tiers.map((tr) => (
              <div key={tr.n} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm" style={{ opacity: prog(t, tr.at + 0.15, 0.35) }}>
                <span className="text-slate-700">{tr.n}</span>
                <span className="font-semibold text-slate-900">{tr.p}</span>
              </div>
            ))}
          </div>
          <div className={`mt-auto rounded-lg py-2.5 text-center text-sm font-semibold ${live ? "bg-[#C21FAF] text-white" : "bg-slate-100 text-slate-400"}`}>
            {live ? "Get tickets" : "Not published yet"}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 2 · Share */

function WhatsAppGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path d="M7.2 17.2l.8-2.6a5.6 5.6 0 1 1 2.1 2l-2.9.6z" fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
function InstagramGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FEDA75" /><stop offset="0.5" stopColor="#D62976" /><stop offset="1" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="url(#ig-g)" />
      <rect x="6" y="6" width="12" height="12" rx="4" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2.8" fill="none" stroke="#fff" strokeWidth="1.6" />
    </svg>
  );
}

function ShareScene({ t }: SceneProps) {
  const copied = after(t, 1.2);
  const sent = after(t, 2.3);
  const replies = [
    { who: "Tolu", c: "#0e7490", text: "I'm in 🙌", at: 3.6 },
    { who: "Ify", c: "#b45309", text: "Just got my VIP ticket!", at: 4.7 },
  ];
  const sold = 112 + Math.round(prog(t, 3.8, 2.4) * 12);

  return (
    <div className="grid h-full gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={20} className="text-emerald-600" />
          <p className="text-lg font-semibold tracking-tight text-slate-900">Your event is live</p>
        </div>
        <p className="mt-1 text-sm text-slate-500">One link for buying tickets, registering and the event hub.</p>
        <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#C21FAF]/30 bg-[#FFF3FD] p-2 pl-3">
          <Link2 size={16} className="shrink-0 text-[#C21FAF]" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">eventbuddy.africa/rooftop/events/…</span>
          <span className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ${copied ? "bg-white text-slate-600 ring-1 ring-slate-200" : "bg-[#C21FAF] text-white"}`}>
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </span>
        </div>
        <p className="mt-6 text-[11px] font-medium text-slate-500">Share to</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[
            { n: "WhatsApp", i: <WhatsAppGlyph size={22} />, hot: true },
            { n: "Instagram", i: <InstagramGlyph size={22} /> },
            { n: "X", i: <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-black text-[11px] font-bold text-white">X</span> },
            { n: "Email", i: <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-slate-700 text-white"><Mail size={12} /></span> },
          ].map((s) => (
            <div key={s.n} className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 text-[11px] text-slate-600 transition-colors ${s.hot && t > 1.9 && t < 2.5 ? "border-[#25D366] bg-[#25D366]/10" : "border-slate-200"}`}>
              {s.i}
              {s.n}
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-xs text-slate-500">Tickets sold</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900">{sold}<span className="text-sm font-normal text-slate-400"> / 200</span></span>
        </div>
      </div>

      {/* the group chat the link lands in */}
      <div className="hidden min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#EFEAE2] lg:flex">
        <div className="flex items-center gap-2.5 bg-[#075E54] px-3.5 py-2.5 text-white">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 text-[11px] font-semibold">LM</span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">Lagos Music Lovers</p>
            <p className="truncate text-[10px] text-white/70">248 members</p>
          </div>
        </div>
        <div className="flex flex-1 flex-col justify-end gap-2 p-3">
          {sent && (
            <div className="lp-pop ml-auto w-[78%] rounded-lg rounded-tr-none bg-[#D9FDD3] p-1.5 shadow-sm">
              <div className="overflow-hidden rounded-md bg-white/70">
                <div className="h-16 bg-[linear-gradient(120deg,#6D28D9,#C21FAF_60%,#FF7D2D)] p-2">
                  <p className="font-[family-name:var(--font-hero)] text-sm font-bold uppercase leading-none tracking-tight text-white">Rooftop Sessions</p>
                </div>
                <div className="px-2 py-1.5">
                  <p className="text-[11px] font-semibold text-slate-800">Rooftop Sessions · Sat 14 Nov</p>
                  <p className="text-[10px] text-slate-500">eventbuddy.africa</p>
                </div>
              </div>
              <p className="px-1 pt-1.5 text-[12px] text-slate-800">Tickets are out! Regular and VIP 👇</p>
              <p className="px-1 text-right text-[9px] text-slate-500">7:02 pm ✓✓</p>
            </div>
          )}
          {replies.map((r) =>
            after(t, r.at) ? (
              <div key={r.who} className="lp-pop w-fit max-w-[70%] rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 shadow-sm">
                <p className="text-[10px] font-semibold" style={{ color: r.c }}>{r.who}</p>
                <p className="text-[12px] text-slate-800">{r.text}</p>
              </div>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Promote */

const PROMOTERS = [
  { h: "kingjesse", n: "King Jesse", badge: "Seller", c: "#C21FAF", clicks: [214, 268], sold: [18, 24] },
  { h: "tolu.vibes", n: "Tolu A.", badge: "Starter", c: "#6D28D9", clicks: [96, 131], sold: [6, 9] },
  { h: "ifyreads", n: "Ify O.", badge: "Starter", c: "#B8460A", clicks: [41, 58], sold: [2, 4] },
];

function PromoteScene({ t }: SceneProps) {
  const grow = prog(t, 1.2, 4.6);
  const sale = after(t, 2.6) && t < 5.4;
  const earned = Math.round(14150 + grow * 8490);

  return (
    <div className="grid h-full gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">Promoters</p>
            <p className="text-sm text-slate-500">They share their own link. You pay only on tickets sold.</p>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">10% of net · on</span>
        </div>
        <div className="mt-4 space-y-2">
          {PROMOTERS.map((p, i) => {
            const clicks = Math.round(p.clicks[0] + grow * (p.clicks[1] - p.clicks[0]));
            const sold = Math.round(p.sold[0] + grow * (p.sold[1] - p.sold[0]));
            const hot = i === 0 && sale;
            return (
              <div key={p.h} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${hot ? "border-[#C21FAF]/40 bg-[#FFF3FD]" : "border-slate-100"}`}>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-semibold text-white" style={{ background: p.c }}>{p.n.charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-slate-900">@{p.h}</p>
                  <p className="text-[11px] text-slate-400">{p.badge} badge</p>
                </div>
                <div className="text-right text-[11px] tabular-nums text-slate-500">
                  <p><b className="text-slate-900">{clicks}</b> clicks</p>
                  <p><b className="text-slate-900">{sold}</b> sold</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-auto flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
          <span className="text-xs text-slate-500">Sold through promoters</span>
          <span className="text-lg font-semibold tabular-nums text-slate-900">{Math.round(26 + grow * 11)} tickets</span>
        </div>
      </div>

      {/* the promoter's own view: their link and what it earned */}
      <div className="relative hidden min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 lg:flex">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Promoter dashboard</p>
        <p className="mt-1 text-[15px] font-semibold text-slate-900">@kingjesse</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-[#C21FAF]/30 bg-[#FFF3FD] px-2.5 py-2">
          <Link2 size={14} className="shrink-0 text-[#C21FAF]" />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">eventbuddy.africa/rooftop/kingjesse</span>
        </div>
        <div className="mt-4 rounded-xl bg-[#170821] p-4 text-white">
          <p className="text-[11px] text-white/60">Earned on Rooftop Sessions</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatNaira(earned)}</p>
          <p className="mt-1 text-[11px] text-white/60">Paid out to their bank on request</p>
        </div>
        {sale && (
          <div key="sale" className="lp-pop mt-auto flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            <p className="min-w-0 text-[12px] leading-snug text-slate-800"><b>Ada</b> bought a VIP ticket through your link. <b className="text-emerald-700">+₦2,350</b></p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Exhibit */

const STANDS = [
  { co: "Mama Put Kitchen", stand: "Corner · A1", price: 300000, x: 0.27, y: 0.32 },
  { co: "Glow Skincare", stand: "Standard · B2", price: 150000, x: 0.5, y: 0.32 },
  { co: "Book Swap Club", stand: "Community · C1", price: 0, x: 0.73, y: 0.32 },
];

function ExhibitScene({ t }: SceneProps) {
  // the first application gets approved, then paid; the others are already in
  const state = (i: number) => (i > 0 ? "Confirmed" : after(t, 3.2) ? "Confirmed" : after(t, 1.6) ? "Awaiting payment" : "New");
  const confirmed = STANDS.filter((_, i) => state(i) === "Confirmed");
  const sales = confirmed.reduce((s, x) => s + x.price, 0);
  const lead = after(t, 4.6);

  return (
    <div className="grid h-full gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold tracking-tight text-slate-900">Exhibitors</p>
            <p className="text-sm text-slate-500">They apply for a stand, you approve, they pay.</p>
          </div>
          <span className="shrink-0 text-right">
            <span className="block text-[10px] text-slate-400">Stand sales</span>
            <span className="text-lg font-semibold tabular-nums text-slate-900">{formatNaira(sales)}</span>
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {STANDS.map((x, i) => {
            const st = state(i);
            return (
              <div key={x.co} className={`rounded-xl border p-3 transition-colors ${i === 0 && t > 1.2 && t < 3.6 ? "border-[#C21FAF]/40 bg-[#FFF3FD]" : "border-slate-100"}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-semibold text-slate-900">{x.co}</p>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st === "Confirmed" ? "bg-emerald-50 text-emerald-700" : st === "Awaiting payment" ? "bg-amber-50 text-amber-700" : "bg-[#FFF3FD] text-[#C21FAF]"}`}>{st}</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">{x.stand} · {x.price ? formatNaira(x.price) : "Free"}</p>
                  {i === 0 && st === "New" && <span className="rounded-md bg-[#C21FAF] px-2.5 py-1 text-[10px] font-semibold text-white">Approve</span>}
                </div>
              </div>
            );
          })}
        </div>
        {lead && (
          <div className="lp-pop mt-auto flex items-center gap-2.5 rounded-xl bg-[#170821] px-3.5 py-2.5 text-white">
            <ScanLine size={16} className="shrink-0 text-[#FF8AF5]" />
            <p className="min-w-0 text-[12px] leading-snug">Glow Skincare scanned <b>Ngozi Eze</b> at stand B2 · lead saved <span className="ml-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px]">Hot</span></p>
          </div>
        )}
      </div>

      {/* the floor plan attendees see in their hub */}
      <div className="hidden min-w-0 flex-col lg:flex">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-slate-500"><Store size={13} /> Floor plan · in every attendee&apos;s hub</p>
        <div className="relative flex-1 overflow-hidden rounded-xl border border-slate-200 bg-[#F4F1EA]">
          <div className="absolute inset-[8%] rounded-md border-2 border-slate-700/70" />
          {[0.27, 0.5, 0.73].map((cx) => (
            <div key={cx} className="absolute h-[22%] w-[20%] -translate-x-1/2 rounded bg-[#9AD1D4]" style={{ left: `${cx * 100}%`, top: "21%" }} />
          ))}
          <div className="absolute left-[14%] right-[14%] top-[58%] h-[24%] rounded bg-[#CDE7B0]" />
          {STANDS.map((x, i) => {
            const on = state(i) === "Confirmed";
            const lit = (i === 0 && after(t, 3.2) && t < 4.4) || (i === 1 && lead);
            return (
              <span
                key={x.co}
                className={`absolute grid h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full px-1.5 text-[10px] font-bold transition-all duration-500 ${on ? "bg-[#FF8AF5] text-[#1a0b1f] shadow-[0_0_0_2px_#fff,0_4px_12px_rgba(0,0,0,0.3)]" : "bg-white/70 text-slate-400 ring-1 ring-slate-300"} ${lit ? "scale-125 shadow-[0_0_0_3px_#FF8AF5,0_0_24px_6px_rgba(237,28,220,0.6)]" : ""}`}
                style={{ left: `${x.x * 100}%`, top: `${x.y * 100}%` }}
              >
                {x.stand.split("· ")[1]}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 3 · Check in */

function MiniQR({ size = 120 }: { size?: number }) {
  // Fixed module map; finder squares plus a deterministic body.
  const n = 17;
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const f = (ox: number, oy: number) => x >= ox && x < ox + 5 && y >= oy && y < oy + 5;
      if (f(0, 0) || f(n - 5, 0) || f(0, n - 5)) {
        const ox = x >= n - 5 ? n - 5 : 0, oy = y >= n - 5 ? n - 5 : 0;
        const dx = x - ox, dy = y - oy;
        if (dx === 0 || dx === 4 || dy === 0 || dy === 4 || (dx === 2 && dy === 2)) cells.push([x, y]);
      } else if (((x * 7 + y * 13 + x * y) % 5) < 2) cells.push([x, y]);
    }
  const q = size / n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <rect width={size} height={size} fill="#fff" />
      {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x * q} y={y * q} width={q + 0.3} height={q + 0.3} fill="#170821" />)}
    </svg>
  );
}

const SCANS = [
  { at: 1.5, n: "Amara Okafor", t: "Regular", dup: false },
  { at: 3.4, n: "Tunde Bakare", t: "VIP", dup: false },
  { at: 5.3, n: "Amara Okafor", t: "Regular", dup: true },
];

function CheckinScene({ t }: SceneProps) {
  const done = SCANS.filter((s) => after(t, s.at));
  const last = done[done.length - 1];
  const showResult = last && t - last.at < 1.6;
  const checkedIn = 87 + done.filter((s) => !s.dup).length;
  const sweep = (Math.sin(t * 2.6) + 1) / 2;

  return (
    <div className="grid h-full gap-5 sm:grid-cols-[minmax(0,240px)_1fr]">
      {/* staff phone in scanner mode */}
      <div className="relative mx-auto flex h-[250px] w-full max-w-[240px] flex-col overflow-hidden rounded-[22px] border-[5px] border-slate-900 bg-slate-900 sm:h-auto">
        <div className="flex items-center justify-between px-3 py-2 text-[10px] text-white/70">
          <span>Door A · Kemi</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5">Access code</span>
        </div>
        <div className="relative flex flex-1 items-center justify-center bg-[radial-gradient(circle_at_50%_40%,#2a1640,#0d0714)]">
          <div className="relative rounded-lg bg-white p-2">
            <MiniQR size={104} />
            <span className="pointer-events-none absolute inset-x-1 h-[2px] bg-[#FF8AF5] shadow-[0_0_10px_#FF8AF5]" style={{ top: `${8 + sweep * 84}%` }} />
          </div>
          {["left-6 top-6 border-l-2 border-t-2", "right-6 top-6 border-r-2 border-t-2", "bottom-6 left-6 border-b-2 border-l-2", "bottom-6 right-6 border-b-2 border-r-2"].map((c) => (
            <span key={c} className={`absolute h-6 w-6 rounded-sm ${showResult ? (last.dup ? "border-amber-400" : "border-emerald-400") : "border-white/60"} ${c}`} />
          ))}
          {showResult && (
            <div key={last.at} className={`lp-pop absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl px-3 py-2.5 text-white ${last.dup ? "bg-amber-500" : "bg-emerald-600"}`}>
              {last.dup ? <TriangleAlert size={18} className="shrink-0" /> : <CheckCircle2 size={18} className="shrink-0" />}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold">{last.n}</p>
                <p className="truncate text-[10px] text-white/85">{last.dup ? "Already checked in at 7:42 pm" : `${last.t} · checked in`}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-baseline justify-between">
          <p className="text-lg font-semibold tracking-tight text-slate-900">Check-in</p>
          <p className="text-sm tabular-nums text-slate-500"><span className="text-xl font-semibold text-slate-900">{checkedIn}</span> / 124</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-500" style={{ width: `${(checkedIn / 124) * 100}%` }} />
        </div>
        <ul className="mt-4 hidden space-y-2 sm:block">
          {[...done.filter((s) => !s.dup)].reverse().concat([{ at: -1, n: "Ngozi Eze", t: "Regular", dup: false }, { at: -2, n: "Kola Martins", t: "VIP", dup: false }]).slice(0, 4).map((s) => (
            <li key={`${s.n}-${s.at}`} className={`flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 ${s.at > 0 ? "lp-pop" : ""}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-[10px] font-semibold text-emerald-700">{s.n.split(" ").map((p) => p[0]).join("")}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{s.n}</span>
              <span className="text-[11px] text-slate-400">{s.t}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto hidden rounded-xl border border-dashed border-slate-300 px-3.5 py-3 sm:block">
          <p className="text-[11px] font-medium text-slate-500">No phone? Look up the reference ID</p>
          <p className="mt-1 font-mono text-sm tracking-wider text-slate-800">K7QX-4R2M</p>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 4 · Engage */

function EngageScene({ t }: SceneProps) {
  const agenda = [
    { time: "7:00", s: "Doors open", now: false },
    { time: "7:30", s: "Opening set — DJ Tobi", now: true },
    { time: "8:30", s: "Headline performance", now: false },
    { time: "10:00", s: "After-party", now: false },
  ];
  const saved = after(t, 1.4);
  const qBase = [
    { q: "Will the set be recorded?", v: 14, grow: 22, at: 0.6 },
    { q: "Is there parking at the venue?", v: 9, grow: 4, at: 1.1 },
    { q: "What time does the headliner start?", v: 6, grow: 3, at: 1.6 },
  ];
  const qs = qBase
    .map((x) => ({ ...x, votes: x.v + Math.round(prog(t, x.at, 4) * x.grow) }))
    .sort((a, b) => b.votes - a.votes);
  const answered = after(t, 5.6);
  const poll = [
    { o: "Burna Boy", p: 46 },
    { o: "Tems", p: 34 },
    { o: "Asake", p: 20 },
  ];
  const pp = prog(t, 0.6, 3.4);
  const voters = Math.round(180 + pp * 132);

  return (
    <div className="grid h-full content-start gap-3 sm:gap-4 lg:grid-cols-[1fr_1.1fr_1fr] lg:content-stretch">
      <div className="hidden min-w-0 rounded-xl border border-slate-200 p-3.5 lg:block">
        <p className="text-xs font-semibold text-slate-700">Agenda</p>
        <ul className="mt-2 space-y-1.5">
          {agenda.map((a) => (
            <li key={a.s} className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${a.now ? "bg-[#FFF3FD]" : ""}`}>
              <span className="w-9 shrink-0 text-[11px] font-semibold tabular-nums text-[#C21FAF]">{a.time}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-800">{a.s}</span>
              {a.now && <span className="rounded-full bg-[#C21FAF] px-1.5 py-px text-[9px] font-bold uppercase text-white">Now</span>}
              {a.time === "8:30" && <Bookmark size={14} className={saved ? "fill-[#C21FAF] text-[#C21FAF]" : "text-slate-300"} />}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 rounded-xl border border-slate-200 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">Live Q&amp;A</p>
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700"><span className="lp-live-dot" /> Open</span>
        </div>
        <ul className="mt-2 space-y-1.5">
          {qs.map((x, i) => (
            <li key={x.q} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2 transition-transform duration-500">
              <span className={`flex w-9 shrink-0 flex-col items-center rounded-md py-0.5 ${i === 0 ? "bg-[#FFF3FD] text-[#C21FAF]" : "bg-slate-50 text-slate-500"}`}>
                <ArrowBigUp size={14} />
                <span className="text-[11px] font-semibold tabular-nums">{x.votes}</span>
              </span>
              <span className="min-w-0 flex-1 text-[12px] leading-snug text-slate-800">{x.q}</span>
              {i === 0 && answered && <span className="lp-pop shrink-0 rounded-full bg-emerald-50 px-1.5 py-px text-[9px] font-semibold text-emerald-700">Answered</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="min-w-0 rounded-xl border border-slate-200 p-3.5">
        <p className="text-xs font-semibold text-slate-700">Live poll</p>
        <p className="mt-1 text-[13px] font-medium text-slate-900">Who should headline next time?</p>
        <div className="mt-3 space-y-2.5">
          {poll.map((x, i) => (
            <div key={x.o}>
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>{x.o}</span>
                <span className="tabular-nums">{Math.round(x.p * pp)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${x.p * pp}%`, background: i === 0 ? "#C21FAF" : i === 1 ? "#8B5CF6" : "#FF7D2D" }} />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] tabular-nums text-slate-400">{voters} votes</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 5 · Get paid */

const SALES = [12, 18, 15, 26, 22, 34, 41, 38, 52, 47, 63, 71];
const PAYMENTS = [
  { n: "Amara Okafor", t: "Regular", p: 10000, at: 0.8 },
  { n: "Tunde Bakare", t: "VIP", p: 25000, at: 1.9 },
  { n: "Halima Bello", t: "Regular", p: 10000, at: 3.0 },
];

function PaidScene({ t, fee }: SceneProps) {
  const p = prog(t, 0.2, 2.6);
  const gross = 1600000 * p;
  const sold = Math.round(124 * p);
  // what eventbuddy keeps from this sample, using the live fee model
  const feeTotal = ((Math.round(124 * 0.81) * ticketFeeMinor(10000, fee) + Math.round(124 * 0.19) * ticketFeeMinor(25000, fee)) / 100) * p;
  const max = Math.max(...SALES);
  const shown = PAYMENTS.filter((x) => after(t, x.at)).reverse();

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        {[
          { k: "Sold", v: String(sold), s: "of 200 tickets" },
          { k: "Ticket sales", v: formatNaira(gross), s: "paid by buyers" },
          { k: "To your bank", v: formatNaira(Math.max(0, gross - feeTotal)), s: `after ${formatTicketFee(fee)} per ticket` },
        ].map((m) => (
          <div key={m.k} className="rounded-xl border border-slate-200/80 bg-white p-2.5 sm:p-3.5">
            <p className="truncate text-[10px] font-medium text-slate-500 sm:text-xs">{m.k}</p>
            <p className="mt-1 text-base font-semibold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{m.v}</p>
            <p className="text-[10px] leading-tight text-slate-400 sm:text-[11px]">{m.s}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.25fr_1fr]">
        <div className="flex min-h-0 flex-col rounded-xl border border-slate-200/80 bg-white p-3.5">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-medium text-slate-600">Sales, last 12 days</p>
            <p className="text-[11px] text-slate-400">Regular · VIP</p>
          </div>
          <div className="mt-3 flex min-h-[90px] flex-1 items-end gap-1.5">
            {SALES.map((v, i) => {
              const g = prog(t, 0.2 + i * 0.07, 0.6);
              return (
                <div key={i} className="flex h-full flex-1 flex-col justify-end gap-px">
                  <div className="rounded-t-[3px] bg-[#8B5CF6]" style={{ height: `${(v / max) * 30 * g}%` }} />
                  <div className="rounded-b-[3px] bg-[#C21FAF]" style={{ height: `${(v / max) * 62 * g}%` }} />
                </div>
              );
            })}
          </div>
        </div>
        <div className="hidden min-w-0 flex-col rounded-xl border border-slate-200/80 bg-white p-3.5 sm:flex">
          <p className="text-xs font-medium text-slate-600">Latest payments</p>
          <ul className="mt-2 flex-1 space-y-1.5">
            {shown.map((x) => {
              const f = ticketFeeMinor(x.p, fee) / 100;
              return (
                <li key={x.n} className="lp-pop flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-slate-800">{x.n}</span>
                    <span className="block text-[10px] text-slate-400">{x.t} · fee {formatNaira(f)}</span>
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-emerald-700">+{formatNaira(x.p - f)}</span>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#170821] px-3 py-2.5 text-white" style={{ opacity: prog(t, 3.6, 0.5) }}>
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
            <span className="min-w-0 text-[11px] leading-tight">Settling to <b>GTBank ••4821</b> automatically</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- shell */

const TABS = [
  { id: "sell", label: "Sell", path: "dashboard/events/new", dur: 8, caption: "Create an event, add ticket types and prices, and publish. It's free until a ticket sells.", Scene: SellScene },
  { id: "share", label: "Share", path: "dashboard/events/rooftop/share", dur: 7.5, caption: "One link does it all. Drop it in WhatsApp, Instagram or anywhere your people are.", Scene: ShareScene },
  { id: "promote", label: "Promote", path: "dashboard/events/rooftop/promoters", dur: 7, caption: "Promoters sell for you on commission. Each shares their own link, you see every click and sale, and we pay them for you.", Scene: PromoteScene },
  { id: "checkin", label: "Check in", path: "checkin", dur: 7.5, caption: "Staff scan QR tickets at the door with an access code, with no account needed. Repeat scans get caught.", Scene: CheckinScene },
  { id: "exhibit", label: "Exhibit", path: "dashboard/events/rooftop/exhibitors", dur: 7, caption: "Sell stands to exhibitors: they apply, you approve, they pay. On the day they scan visitors at their stand to collect leads.", Scene: ExhibitScene },
  { id: "engage", label: "Engage", path: "rooftop/events/hub", dur: 8, caption: "Every attendee gets a live hub: the agenda, moderated Q&A and live polls, all from the same ticket link.", Scene: EngageScene },
  { id: "paid", label: "Get paid", path: "dashboard", dur: 7.5, caption: "Every sale lands in your balance. Request a payout to your bank whenever it clears. You only pay when a ticket sells.", Scene: PaidScene },
] as const;

export function ProductShowcase({ fee }: { fee: TicketFee }) {
  const [tab, setTab] = useState(0);
  const [t, setT] = useState(0);
  const [paused, setPaused] = useState(false);
  // while the pointer is over the tabs the scene keeps playing but the tour
  // doesn't move on: a hovered tab replays its own scene instead
  const overTabsRef = useRef(false);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = inView && !paused && !reduced;
  const dur = TABS[tab].dur;

  // One clock for the active scene. When it runs past the tab's length the
  // showcase moves to the next tab and the clock starts again.
  // The elapsed time lives in a ref so the tick stays a plain side effect; state
  // only mirrors it for rendering.
  const tRef = useRef(0);
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      tRef.current += (now - last) / 1000;
      last = now;
      if (tRef.current >= dur) {
        tRef.current = 0;
        if (!overTabsRef.current) setTab((x) => (x + 1) % TABS.length);
      }
      setT(tRef.current);
    }, 80);
    return () => window.clearInterval(id);
  }, [running, dur]);

  const choose = useCallback((i: number) => {
    tRef.current = 0;
    setTab(i);
    setT(0);
  }, []);

  const hoverTab = useHoverIntent<number>(choose);

  // Keyboard: arrow keys move between tabs, as a tablist should.
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (tab + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    choose(next);
    pillRefs.current[next]?.focus();
  };

  useLayoutEffect(() => {
    const el = pillRefs.current[tab];
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
  }, [tab]);
  useEffect(() => {
    const onResize = () => {
      const el = pillRefs.current[tab];
      if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [tab]);

  const Active = TABS[tab].Scene;
  // Reduced motion shows each scene in its finished state instead of playing it.
  const sceneT = reduced ? 99 : t;

  return (
    <div ref={rootRef}>
      <div className="lp-window-wrap">
      <div className="lp-window">
        <div className="lp-window-chrome">
          <span /><span /><span />
          <p>eventbuddy.africa/{TABS[tab].path}</p>
        </div>
        <div className="grid grid-cols-[52px_1fr] sm:grid-cols-[60px_1fr]">
          <div className="flex flex-col items-center gap-5 border-r border-slate-200/80 bg-slate-50 py-5 text-slate-400" aria-hidden="true">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#C21FAF] text-white"><LayoutGrid size={16} /></span>
            <Ticket size={18} className={tab === 0 ? "text-[#C21FAF]" : ""} />
            <Link2 size={18} className={tab === 1 ? "text-[#C21FAF]" : ""} />
            <ScanLine size={18} className={tab === 2 ? "text-[#C21FAF]" : ""} />
            <Megaphone size={18} className={tab === 3 ? "text-[#C21FAF]" : ""} />
            <Users size={18} />
            <Settings size={18} className="mt-auto" />
          </div>
          <div className="relative min-w-0">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500 sm:px-6">
              <span className="font-semibold text-slate-800">Rooftop Sessions</span>
              <span className="hidden items-center gap-1 sm:inline-flex"><CalendarDays size={12} /> Sat 14 Nov · 7pm</span>
            </div>
            <div
              id={`lp-panel-${TABS[tab].id}`}
              role="tabpanel"
              aria-labelledby={`lp-tab-${TABS[tab].id}`}
              className="lp-scene h-[440px] p-4 sm:h-[490px] sm:p-6"
              key={TABS[tab].id}
            >
              <Active t={sceneT} fee={fee} />
            </div>
            <div key={`wash-${tab}`} className="lp-wash" aria-hidden="true" />
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className="lp-pause"
              aria-label={paused ? "Play the product tour" : "Pause the product tour"}
              hidden={reduced}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
          </div>
        </div>
      </div>
      </div>

      <div className="lp-tabs-wrap">
        <div
          className="lp-tabs"
          role="tablist"
          aria-label="Product tour"
          onKeyDown={onKey}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") overTabsRef.current = true;
          }}
          onPointerLeave={() => {
            overTabsRef.current = false;
          }}
        >
          {indicator && <span className="lp-tab-indicator" style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} aria-hidden="true" />}
          {TABS.map((x, i) => (
            <button
              key={x.id}
              ref={(el) => { pillRefs.current[i] = el; }}
              id={`lp-tab-${x.id}`}
              role="tab"
              type="button"
              aria-selected={i === tab}
              aria-controls={`lp-panel-${x.id}`}
              tabIndex={i === tab ? 0 : -1}
              onClick={() => choose(i)}
              onPointerEnter={i === tab ? undefined : hoverTab.enter(i)}
              onPointerLeave={hoverTab.leave}
              className="lp-tab"
            >
              {x.label}
              {i === tab && !reduced && (
                <span className="lp-tab-progress" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (t / dur) * 100)}%` }} />
                </span>
              )}
            </button>
          ))}
        </div>
        <p key={TABS[tab].id} className="lp-caption">{TABS[tab].caption}</p>
      </div>
    </div>
  );
}
