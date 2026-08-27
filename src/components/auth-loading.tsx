import { Logo } from "@/components/logo";

/** Full-screen branded splash shown while a gated page is still resolving whether
 *  there's a signed-in session — replaces a blank white flash with something that
 *  reads as "loading," not "broken." Same treatment used on /platform's own
 *  auth check, now shared across every role-gated page. */
export function AuthLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#22103A" }}>
      <Logo tone="white" height={18} className="opacity-70 animate-pulse" />
    </div>
  );
}
