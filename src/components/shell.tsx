"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Calendar, Users, Settings, LogOut, Menu, X, BookOpen, ScanLine, ShieldCheck } from "lucide-react";
import { getDestinationById, getEventById, getUniversityById, logout, useSession } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/logo";

const adminNav = [
  { to: "/dashboard", label: "Events", icon: Calendar },
  { to: "/leads", label: "Leads", icon: Users },
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
    : isRep
      ? repNav
      : staffNav;

  const staffDest = session?.destinationId ? getDestinationById(session.destinationId) : null;
  const staffUni = session?.universityId ? getUniversityById(session.universityId) : null;
  const staffEvent = session?.eventId ? getEventById(session.eventId) : null;

  // Brand green is the app-wide identity; Staff gets its own distinct blue
  // identity so it's never mistaken for the Admin/Rep experience.
  const sidebarBg = isStaff ? "#04223d" : "#0d2615";
  const activeNavAccent = isStaff ? "#1098F7" : "var(--color-brand-600)";
  const sessionAccentColor = isStaff ? "text-sky-300" : "text-[#a5e9bc]";
  const avatarBg = isStaff ? "bg-[#1098F7]/20" : "bg-brand-600/25";
  const avatarText = isStaff ? "text-sky-300" : "text-[#a5e9bc]";

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 flex-col text-white fixed inset-y-0 left-0 z-40" style={{ background: sidebarBg }}>
        <div className="px-6 py-5 border-b border-white/10">
          <Logo tone="white" height={18} />
        </div>

        {!isAdmin && staffEvent && (
          <div className="mx-4 mt-4 rounded-lg bg-white/8 p-3 text-xs">
            <p className="text-white/50 uppercase tracking-wider text-[10px] mb-1">Active Session</p>
            <p className="font-semibold text-white truncate">{staffEvent.name}</p>
            {staffDest && (
              <p className={`${sessionAccentColor} mt-0.5`}>
                {staffDest.flag} {staffDest.name}
              </p>
            )}
            {staffUni && <p className="text-white/60 truncate">{staffUni.shortName}</p>}
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {nav.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                href={to}
                style={active ? { background: `color-mix(in srgb, ${activeNavAccent} 20%, transparent)` } : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active ? "text-white font-medium" : "text-white/60 hover:text-white hover:bg-white/8"
                }`}
              >
                <Icon size={17} className={active ? sessionAccentColor : undefined} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-5 border-t border-white/10 pt-4">
          <div className="flex items-center gap-3 px-3 mb-3">
            <div className={`w-8 h-8 rounded-full ${avatarBg} flex items-center justify-center ${avatarText} font-semibold text-sm`}>
              {session?.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{session?.name}</p>
              <p className="text-xs text-white/40 capitalize">{session?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/8 transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden fixed top-0 inset-x-0 z-50 text-white h-14 flex items-center px-4 gap-4" style={{ background: sidebarBg }}>
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu">
          <Menu size={22} />
        </button>
        <Logo tone="white" height={12} />
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="w-64 text-white flex flex-col h-full animate-drawer-in" style={{ background: sidebarBg }}>
            <div className="px-5 py-4 flex items-center justify-between border-b border-white/10">
              <Logo tone="white" height={13} />
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X size={20} className="text-white/60" />
              </button>
            </div>
            {!isAdmin && staffEvent && (
              <div className="mx-4 mt-4 rounded-lg bg-white/8 p-3 text-xs">
                <p className="text-white/50 uppercase tracking-wider text-[10px] mb-1">Active Session</p>
                <p className="font-semibold text-white truncate">{staffEvent.name}</p>
                {staffDest && (
                  <p className={`${sessionAccentColor} mt-0.5`}>
                    {staffDest.flag} {staffDest.name}
                  </p>
                )}
              </div>
            )}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
              {nav.map(({ to, label, icon: Icon }) => {
                const active = pathname === to;
                return (
                  <Link
                    key={to}
                    href={to}
                    onClick={() => setMobileOpen(false)}
                    style={active ? { background: `color-mix(in srgb, ${activeNavAccent} 20%, transparent)` } : undefined}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      active ? "text-white font-medium" : "text-white/60 hover:text-white hover:bg-white/8"
                    }`}
                  >
                    <Icon size={17} className={active ? sessionAccentColor : undefined} />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 pb-5 border-t border-white/10 pt-4">
              <button
                onClick={() => {
                  handleLogout();
                  setMobileOpen(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/8"
              >
                <LogOut size={16} />
                Sign out
              </button>
            </div>
          </div>
          <div className="flex-1 bg-black/50 animate-modal-backdrop" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Main content */}
      {/* min-w-0 keeps this a shrinkable flex item — without it, wide content
          (e.g. the leads table's nowrap columns) forces the whole page past
          the viewport instead of scrolling inside its own overflow-x-auto. */}
      <main className="flex-1 min-w-0 md:ml-64 min-h-screen pt-14 md:pt-0">{children}</main>
    </div>
  );
}
