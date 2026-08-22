import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/logo";
import { MaintenanceAutoRefresh } from "@/components/maintenance-auto-refresh";
import { DEFAULT_MAINTENANCE_MESSAGE, DEFAULT_MAINTENANCE_TITLE } from "@/lib/maintenance";

/** Server Component, not client — proxy.ts rewrites every blocked request straight
 *  here, so this needs to render correctly even if the visitor's browser never runs
 *  a script (a maintenance page that itself depends on client JS to show its text
 *  defeats the purpose). Reads platform_settings directly; RLS makes this row
 *  publicly readable (same policy the pricing page relies on). MaintenanceAutoRefresh
 *  is the one piece of progressive enhancement — it polls in the background and
 *  reloads once a platform admin turns maintenance mode back off. */
export default async function MaintenancePage() {
  const supabase = await createClient();
  const { data } = await supabase.from("platform_settings").select("maintenance_title, maintenance_message").eq("id", true).maybeSingle();
  const title = data?.maintenance_title || DEFAULT_MAINTENANCE_TITLE;
  const message = data?.maintenance_message || DEFAULT_MAINTENANCE_MESSAGE;

  return (
    <div
      className="min-h-screen flex items-center justify-center text-white p-6 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, #9b1a9f 0%, #610064 42%, #1a0533 78%)" }}
    >
      {/* Faint grid texture — the same "quiet detail" as the dashboard's empty
          states, keeps the huge flat gradient from feeling like an inert slide. */}
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <MaintenanceAutoRefresh />

      <div className="relative max-w-lg w-full text-center animate-fade-in-up">
        <div className="flex justify-center mb-10">
          <Logo tone="white" height={30} />
        </div>

        <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center mx-auto mb-6 animate-idle-float">
          <Wrench size={26} className="text-fuchsia-200" />
        </div>

        <h1 className="font-display text-3xl sm:text-4xl leading-tight mb-3">{title}</h1>
        <p className="text-white/70 text-base leading-relaxed max-w-md mx-auto">{message}</p>

        <div className="flex items-center justify-center gap-1.5 mt-9" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse"
              style={{ animationDelay: `${i * 200}ms`, animationDuration: "1.2s" }}
            />
          ))}
        </div>
        <p className="text-white/40 text-xs mt-4">This page will refresh automatically once we&apos;re back.</p>
      </div>
    </div>
  );
}
