"use client";

import { useEffect, useState } from "react";
import { Laptop, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { parseUserAgent } from "@/lib/utils";

type SessionRow = { session_id: string; created_at: string; refreshed_at: string | null; user_agent: string | null };

/** The session_id claim GoTrue embeds in every access token JWT — used to tell
 *  which row from list_my_sessions() is the device we're looking at right now. */
function currentSessionIdFromToken(accessToken: string | undefined): string | null {
  if (!accessToken) return null;
  try {
    const base64 = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)).session_id ?? null;
  } catch {
    return null;
  }
}

export function ActiveDevicesSection() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    (async () => {
      const [{ data: sessionData }, { data: rows, error }] = await Promise.all([supabase.auth.getSession(), supabase.rpc("list_my_sessions")]);
      setCurrentId(currentSessionIdFromToken(sessionData.session?.access_token));
      if (error) {
        toast.error("Couldn't load active devices.");
        setSessions([]);
        return;
      }
      setSessions((rows ?? []) as SessionRow[]);
    })();
  }, []);

  async function handleSignOutOthers() {
    setSigningOutOthers(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      toast.success("Signed out of your other devices.");
      const { data: rows } = await supabase.rpc("list_my_sessions");
      setSessions((rows ?? []) as SessionRow[]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sign out other devices.");
    } finally {
      setSigningOutOthers(false);
    }
  }

  const otherCount = (sessions ?? []).filter((s) => s.session_id !== currentId).length;

  return (
    <div>
      <h2 className="font-semibold text-slate-800 mb-1">Active devices</h2>
      <p className="text-sm text-slate-500 mb-4">Devices currently signed into your account.</p>
      {sessions === null ? (
        <div className="h-16 rounded-xl bg-slate-100 animate-pulse" />
      ) : sessions.length === 0 ? (
        <p className="text-sm text-slate-400">No active sessions found.</p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {sessions.map((s) => {
            const { browser, os, isMobile } = parseUserAgent(s.user_agent);
            const isCurrent = s.session_id === currentId;
            const Icon = isMobile ? Smartphone : Laptop;
            return (
              <div key={s.session_id} className="flex items-center gap-3 px-4 py-3">
                <Icon size={16} className="text-slate-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">
                      {browser} on {os}
                    </span>
                    {isCurrent && <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">This device</span>}
                  </div>
                  {!isCurrent && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Active {formatDistanceToNowStrict(new Date(s.refreshed_at || s.created_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {otherCount > 0 && (
        <button
          type="button"
          onClick={handleSignOutOthers}
          disabled={signingOutOthers}
          className="mt-3 text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-60 transition-transform active:scale-[0.97]"
        >
          {signingOutOthers ? "Signing out…" : `Sign out of ${otherCount} other device${otherCount !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
