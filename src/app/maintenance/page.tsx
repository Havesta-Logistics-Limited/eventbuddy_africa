import { createClient } from "@/lib/supabase/server";
import { AuthCentered } from "@/components/auth/auth-shell";
import { OrbsObject } from "@/components/landing/event-objects";
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
    <AuthCentered>
      <MaintenanceAutoRefresh />
      <div className="text-center">
        <div className="mx-auto mb-6 w-28 lp-bob" style={{ ["--bob" as string]: "6.4s" }} aria-hidden="true">
          <OrbsObject />
        </div>
        <h1 className="eb-auth-title mb-3">{title}</h1>
        <p className="mx-auto max-w-md text-[15px] leading-relaxed text-fg-3">{message}</p>
        <div className="mt-8 flex items-center justify-center gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" style={{ animationDelay: `${i * 200}ms`, animationDuration: "1.2s" }} />
          ))}
        </div>
        <p className="mt-4 text-xs text-subtle">This page will refresh automatically once we&apos;re back.</p>
      </div>
    </AuthCentered>
  );
}
