"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Megaphone, Search, UserCheck, Users } from "lucide-react";
import { Shell } from "@/components/shell";
import { useRequireRole } from "@/lib/auth";
import { resolveMyOrgId } from "@/lib/store";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Role } from "@/lib/types";
import { downloadCsv } from "@/lib/csv";
import { AuthLoading } from "@/components/auth-loading";

const ADMIN_ONLY: Role[] = ["admin"];

type AudienceMember = { email: string; fullName: string; source: "registered" | "follower"; joinedAt: string };

/** Everyone who's ever joined this org's audience — either by registering for one
 *  of its events, or by explicitly following (see FollowOrgButton) without
 *  necessarily registering for anything. Read-only for now: the actual send
 *  pipeline (invites to a new event, newsletters, reminders) is a later pass — see
 *  organization_audience/organization_audience_count (migration 0065). */
export default function AudiencePage() {
  const session = useRequireRole(ADMIN_ONLY);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<AudienceMember[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    resolveMyOrgId(supabase).then(async (orgId) => {
      if (!orgId) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc("organization_audience", { p_organization_id: orgId });
      if (error) {
        toast.error("Couldn't load your audience.");
      } else {
        setMembers((data ?? []).map((r: { email: string; full_name: string | null; source: string; joined_at: string }) => ({
          email: r.email,
          fullName: r.full_name || "",
          source: r.source as "registered" | "follower",
          joinedAt: r.joined_at,
        })));
      }
      setLoading(false);
    });
  }, []);

  if (!session) return <AuthLoading />;

  const filtered = members.filter((m) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return m.email.toLowerCase().includes(q) || m.fullName.toLowerCase().includes(q);
  });
  const followerCount = members.filter((m) => m.source === "follower").length;

  function exportAudience() {
    const headers = ["Name", "Email", "Source", "Joined"];
    const rows = filtered.map((m) => [m.fullName, m.email, m.source === "follower" ? "Follower" : "Attendee", new Date(m.joinedAt).toLocaleDateString("en-GB")]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadCsv("audience.csv", csv);
  }

  return (
    <Shell>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="font-display text-2xl text-slate-900">Audience</h1>
            <p className="text-slate-500 text-sm mt-0.5">Everyone who&apos;s registered for one of your events or followed you directly.</p>
          </div>
          {members.length > 0 && (
            <button
              onClick={exportAudience}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-white bg-brand-600 hover:bg-brand-700"
            >
              <Download size={14} />
              Export
            </button>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={15} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">Total audience</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : members.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck size={15} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">Direct followers</span>
            </div>
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{loading ? "—" : followerCount}</p>
          </div>
        </div>

        <div className="relative max-w-sm mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your audience…"
            className="w-full pl-9 pr-3.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-10 text-center">
            <Megaphone size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">{members.length === 0 ? "No audience yet" : "No matches"}</p>
            <p className="text-xs text-slate-400 mt-1.5">
              {members.length === 0 ? "Anyone who registers for an event or follows you will show up here." : "Try a different search."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {["Name", "Email", "Source", "Joined"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((m) => (
                    <tr key={m.email}>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{m.fullName || "—"}</td>
                      <td className="px-4 py-3 text-slate-500">{m.email}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            m.source === "follower" ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {m.source === "follower" ? "Follower" : "Attendee"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(m.joinedAt).toLocaleDateString("en-GB")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
