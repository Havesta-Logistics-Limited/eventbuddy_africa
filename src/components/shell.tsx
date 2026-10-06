"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, Users, Settings, LogOut, Menu, X, BookOpen, ScanLine, ShieldCheck, Megaphone, Wallet } from "lucide-react";
import { getDestinationById, getEventById, getUniversityById, logout, useSession } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "@/components/landing/event-objects";

const adminNav = [
  { to: "/dashboard", label: "Events", icon: Calendar },
  { to: "/leads", label: "Leads", icon: Users },
  { to: "/audience", label: "Audience", icon: Megaphone },
  { to: "/payouts", label: "Payouts", icon: Wallet },
  { to: "/admin", label: "Settings", icon: Settings },
];

const staffNav = [
  { to: "/collect", label: "Collect Leads", icon: BookOpen },
  { to: "/checkin", label: "Check-In", icon: ScanLine },
  { to: "/my-leads", label: "My Leads", icon: Users },
];

const repNav = [{ to: "/leads", label: "Leads", icon: Users }];

export function Shell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = session?.role === "admin";
  const isRep = session?.role === "rep";
  const isStaff = session?.role === "staff";
  const isEventSupport = session?.role === "event_support";

  // Platform-admin status is a separate axis from the org role above — an org owner
  // may or may not also be a platform admin — so it needs its own check.
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  useEffect(() => {
    if (!isAdmin || !session) return;
    const supabase = createClient();
    supabase
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", session.id)
      .maybeSingle()
      .then(({ data }) => setIsPlatformAdmin(!!data));
  }, [isAdmin, session]);

  const nav = isAdmin
    ? isPlatformAdmin
      ? [...adminNav, { to: "/platform", label: "Platform", icon: ShieldCheck }]
      : adminNav
    : isEventSupport
      ? [] // locked to their one event page — nothing else to navigate to
      : isRep
        ? repNav
        : staffNav;

  const staffDest = session?.destinationId ? getDestinationById(session.destinationId) : null;
  const staffUni = session?.universityId ? getUniversityById(session.universityId) : null;
  const staffEvent = session?.eventId ? getEventById(session.eventId) : null;

  // Organizers get the brand pink; Staff keep their own distinct blue identity
  // so the portal is never mistaken for the Admin/Rep experience (DESIGN.md).
  const accent = isStaff ? "#4FB3FF" : "#FF8AF5";
  const shellTone = isStaff ? "eb-shell eb-shell--staff" : "eb-shell";

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — desktop */}
      <aside className={`${shellTone} hidden md:flex w-64 flex-col fixed inset-y-0 left-0 z-40`} style={{ ["--accent" as string]: accent }}>
        <div className="px-5 h-16 flex items-center border-b border-line-soft">
          <Logo tone="white" height={20} />
        </div>

        {!isAdmin && staffEvent && <SessionCard event={staffEvent.name} dest={staffDest} uni={staffUni?.shortName} />}

        <NavList items={nav} pathname={pathname} />

        <RailObjects />

        <div className="relative px-3 pb-4 pt-3 border-t border-line-soft">
          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 mb-1">
            <div className="eb-avatar">{session?.name.charAt(0)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fg truncate">{session?.name}</p>
              <p className="text-xs text-subtle capitalize">{session?.role?.replace("_", " ")}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="eb-nav-item w-full">
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className={`${shellTone} eb-mobilebar md:hidden fixed top-0 inset-x-0 z-50 h-14 flex items-center px-4 gap-3`} style={{ ["--accent" as string]: accent }}>
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" aria-expanded={mobileOpen} className="eb-iconbtn -ml-1.5">
          <Menu size={20} />
        </button>
        <Logo tone="white" height={15} />
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <div className={`${shellTone} eb-drawer relative w-72 max-w-[85vw] flex flex-col h-full animate-drawer-in`} style={{ ["--accent" as string]: accent }}>
            <div className="px-5 h-14 flex items-center justify-between border-b border-line-soft">
              <Logo tone="white" height={15} />
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="eb-iconbtn -mr-1.5">
                <X size={19} />
              </button>
            </div>
            {!isAdmin && staffEvent && <SessionCard event={staffEvent.name} dest={staffDest} uni={staffUni?.shortName} />}
            <NavList items={nav} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
            <RailObjects />
            <div className="relative px-3 pb-5 pt-3 border-t border-line-soft">
              <button
                onClick={() => {
                  handleLogout();
                  setMobileOpen(false);
                }}
                className="eb-nav-item w-full"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
          <div className="flex-1 bg-black/60 backdrop-blur-[2px] animate-modal-backdrop" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main content */}
      {/* min-w-0 keeps this a shrinkable flex item — without it, wide content
          (e.g. the leads table's nowrap columns) forces the whole page past
          the viewport instead of scrolling inside its own overflow-x-auto. */}
      <main className="flex-1 min-w-0 md:ml-64 min-h-screen pt-14 md:pt-0 bg-canvas">{children}</main>
    </div>
  );
}

type NavItem = { to: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };

/** The nav list. One pill marks the active page and glides between items as the
 *  route changes, so moving around the app reads as one continuous surface. */
function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const activeIndex = items.findIndex(({ to }) => pathname === to || pathname.startsWith(to + "/"));
  return (
    <nav className="relative flex-1 px-3 py-4" aria-label="Main">
      <ul className="relative space-y-0.5">
        {activeIndex >= 0 && (
          <li aria-hidden="true" className="eb-nav-pill" style={{ transform: `translateY(${activeIndex * 42}px)` }} />
        )}
        {items.map(({ to, label, icon: Icon }, i) => {
          const active = i === activeIndex;
          return (
            <li key={to}>
              <Link href={to} onClick={onNavigate} aria-current={active ? "page" : undefined} className="eb-nav-item" data-active={active || undefined}>
                <Icon size={17} className="eb-nav-icon" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SessionCard({ event, dest, uni }: { event: string; dest: { flag: string; name: string } | null | undefined; uni?: string }) {
  return (
    <div className="mx-3 mt-4 rounded-xl border border-line-soft bg-fill px-3.5 py-3 text-xs">
      <p className="text-subtle uppercase tracking-wider text-[10px] font-semibold mb-1">Active session</p>
      <p className="font-semibold text-fg truncate">{event}</p>
      {dest && (
        <p className="mt-0.5 text-[color:var(--accent)]">
          {dest.flag} {dest.name}
        </p>
      )}
      {uni && <p className="text-muted truncate">{uni}</p>}
    </div>
  );
}

/** The landing page's event objects, gathered in the rail's light pool just
 *  above the account card: they rise in one by one, then float. Decorative,
 *  and hidden on short screens so they never crowd the nav. */
function RailObjects() {
  return (
    <div className="eb-rail-objects" aria-hidden="true">
      <div className="lp-obj eb-rail-ticket" style={{ ["--d" as string]: "0.3s" }}>
        <div className="lp-bob" style={{ ["--bob" as string]: "6.2s" }}><TicketObject className="lp-tilt-ticket" /></div>
      </div>
      <div className="lp-obj eb-rail-badge" style={{ ["--d" as string]: "0.5s" }}>
        <div className="lp-bob" style={{ ["--bob" as string]: "7s", animationDelay: "-2s" }}><BadgeObject className="lp-tilt-badge" /></div>
      </div>
      <div className="lp-obj eb-rail-wrist" style={{ ["--d" as string]: "0.7s" }}>
        <div className="lp-bob" style={{ ["--bob" as string]: "5.6s", animationDelay: "-1s" }}><WristbandObject className="lp-tilt-band" /></div>
      </div>
      <div className="lp-obj eb-rail-orbs" style={{ ["--d" as string]: "0.9s" }}>
        <div className="lp-bob" style={{ ["--bob" as string]: "6.6s", animationDelay: "-3s" }}><OrbsObject /></div>
      </div>
    </div>
  );
}
