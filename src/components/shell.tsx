"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, Users, Settings, LogOut, Menu, X, BookOpen, ScanLine, ShieldCheck, Megaphone, Wallet, Store, Eye } from "lucide-react";
import { getDestinationById, getEventById, getUniversityById, logout, useSession } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "@/components/landing/event-objects";

import { canEdit, canView, SECTION_LABELS, TEAM_SECTIONS, type TeamSection } from "@/lib/team-permissions";
const adminNav: { to: string; label: string; icon: typeof Calendar; section: TeamSection }[] = [
  { to: "/dashboard", label: "Events", icon: Calendar, section: "events" },
  { to: "/leads", label: "Leads", icon: Users, section: "leads" },
  { to: "/audience", label: "Audience", icon: Megaphone, section: "audience" },
  { to: "/payouts", label: "Payouts", icon: Wallet, section: "payouts" },
  { to: "/admin", label: "Settings", icon: Settings, section: "settings" },
];

const staffNav = [
  { to: "/checkin", label: "Kiosk", icon: ScanLine },
  { to: "/collect", label: "Collect Leads", icon: BookOpen },
  { to: "/my-leads", label: "My Leads", icon: Users },
];

const repNav = [{ to: "/leads", label: "Leads", icon: Users }];
const promoterNav = [
  { to: "/promoter", label: "My events", icon: Megaphone },
  { to: "/marketplace", label: "Marketplace", icon: Store },
  { to: "/promoter/payouts", label: "Payouts", icon: Wallet },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const session = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = session?.role === "admin";
  const isRep = session?.role === "rep";
  const isStaff = session?.role === "staff";
  const isEventSupport = session?.role === "event_support";
  const isPromoter = session?.role === "promoter";

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

  // a team member with view-only access to the page they're on sees a notice
  const pageSection: TeamSection | null =
    pathname.startsWith("/dashboard") || pathname.startsWith("/events") || pathname.startsWith("/tours")
      ? "events"
      : pathname.startsWith("/leads")
        ? "leads"
        : pathname.startsWith("/audience")
          ? "audience"
          : pathname.startsWith("/payouts")
            ? "payouts"
            : pathname.startsWith("/admin")
              ? "settings"
              : null;
  const viewOnlySection =
    (isAdmin || isEventSupport) && pageSection && session?.permissions && canView(session.permissions, pageSection) && !canEdit(session.permissions, pageSection) ? pageSection : null;

  // view-only: locked controls (data-edit) can't be reached by keyboard either; re-applied as tabs render
  useEffect(() => {
    const main = document.querySelector("main[data-readonly]");
    if (!main) return;
    const lock = () => main.querySelectorAll("[data-edit]").forEach((el) => el.setAttribute("inert", ""));
    lock();
    const mo = new MutationObserver(lock);
    mo.observe(main, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      main.querySelectorAll("[data-edit][inert]").forEach((el) => el.removeAttribute("inert"));
    };
  }, [viewOnlySection, pathname]);

  // team members only see the pages they have access to (migration 0137)
  const myAdminNav = adminNav.filter((n) => canView(session?.permissions, n.section));
  const nav = isAdmin
    ? isPlatformAdmin
      ? [...myAdminNav, { to: "/platform", label: "Platform", icon: ShieldCheck }]
      : myAdminNav
    : isEventSupport
      ? [] // locked to their one event page — nothing else to navigate to
      : isPromoter
        ? promoterNav
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
              <p className="text-xs text-subtle capitalize">
                {(isAdmin || isEventSupport) && session?.permissions
                  ? TEAM_SECTIONS.every((x) => session.permissions![x] !== "edit")
                    ? "Team member · view only"
                    : "Team member"
                  : isAdmin && session?.isOwner !== false && !session?.permissions
                    ? "Owner"
                    : session?.role?.replace("_", " ")}
              </p>
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
      {/* data-readonly hides every control marked data-edit (team permissions, migration 0137) */}
      <main className="flex-1 min-w-0 md:ml-64 min-h-screen pt-14 md:pt-0 bg-canvas" data-readonly={viewOnlySection ? "true" : undefined}>
        {viewOnlySection && (
          <div className="eb-viewonly" role="status">
            <Eye size={15} aria-hidden="true" />
            <span>
              <strong>View only.</strong> {`You can look around ${SECTION_LABELS[viewOnlySection]}, but not change anything here. Ask the owner if you need edit access.`}
            </span>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

type NavItem = { to: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> };

/** The nav list. One pill marks the active page and glides between items as the
 *  route changes, so moving around the app reads as one continuous surface. */
function NavList({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  // the longest matching item wins, so /promoter/payouts highlights Payouts, not /promoter
  const activeIndex = items.reduce(
    (best, { to }, i) => ((pathname === to || pathname.startsWith(to + "/")) && (best < 0 || to.length > items[best].to.length) ? i : best),
    -1
  );
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
