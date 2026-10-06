import { Logo } from "@/components/logo";
import { BadgeObject, OrbsObject, TicketObject, WristbandObject } from "@/components/landing/event-objects";

/* Sign-in surfaces in the landing page's world (app redesign, phase 2).
 *
 * AuthSplit — login and signup: the glow pool and the event objects rising out
 * of it on the left, the form on the right. Below lg the art collapses to a
 * short glow band over the form so phones still feel part of the same world.
 *
 * AuthCentered — every single-purpose step (forgot/reset password, invite,
 * verify email, platform login): one card over the glow, logo above. */

function Stars() {
  // Fixed, hand-placed field so server and client render identically.
  const stars = [
    [8, 22], [17, 64], [24, 38], [31, 81], [39, 15], [46, 57], [53, 29], [61, 72], [68, 44], [74, 12],
    [81, 66], [88, 35], [93, 78], [12, 48], [35, 92], [57, 8], [77, 88], [91, 52], [4, 74], [64, 58],
  ];
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {stars.map(([x, y], i) => (
        <span key={i} className="lp-star" style={{ left: `${x}%`, top: `${y}%`, width: i % 5 === 0 ? 2.5 : 1.5, height: i % 5 === 0 ? 2.5 : 1.5, animationDelay: `${(i * 0.7) % 6}s`, animationDuration: `${3 + (i % 4)}s` }} />
      ))}
    </div>
  );
}

export function AuthSplit({ headline, accent, sub, children }: { headline: string; accent: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="eb-auth min-h-screen lg:grid lg:grid-cols-[1.05fr_1fr]">
      <aside className="eb-auth-art hidden lg:flex" aria-hidden="true">
        <Stars />
        <div className="eb-auth-pool" />
        <div className="relative z-10 p-12">
          <Logo tone="white" height={22} />
        </div>
        <div className="relative z-10 px-12">
          <p className="eb-auth-headline">
            {headline}
            <span>{accent}</span>
          </p>
          <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">{sub}</p>
        </div>
        <div className="eb-auth-objects">
          <div className="lp-obj eb-auth-ticket" style={{ ["--d" as string]: "0.25s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "6.2s" }}><TicketObject className="lp-tilt-ticket" /></div>
          </div>
          <div className="lp-obj eb-auth-badge" style={{ ["--d" as string]: "0.5s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "7s", animationDelay: "-2s" }}><BadgeObject className="lp-tilt-badge" /></div>
          </div>
          <div className="lp-obj eb-auth-wrist" style={{ ["--d" as string]: "0.75s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "5.6s", animationDelay: "-1s" }}><WristbandObject className="lp-tilt-band" /></div>
          </div>
          <div className="lp-obj eb-auth-orbs" style={{ ["--d" as string]: "1s" }}>
            <div className="lp-bob" style={{ ["--bob" as string]: "6.6s", animationDelay: "-3s" }}><OrbsObject /></div>
          </div>
        </div>
      </aside>

      <main className="eb-auth-main">
        <div className="eb-auth-band lg:hidden" aria-hidden="true" />
        <div className="relative flex w-full flex-col items-center">
          {/* Logo renders its own home link */}
          <span className="mb-7 inline-flex lg:hidden">
            <Logo tone="white" height={20} />
          </span>
          <div className="eb-auth-card">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function AuthCentered({ badge, children }: { badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="eb-auth eb-auth-centered min-h-screen">
      <Stars />
      <div className="eb-auth-pool eb-auth-pool--center" aria-hidden="true" />
      <main className="relative z-10 flex min-h-screen flex-col items-center justify-center px-5 py-16">
        <div className="mb-8 flex flex-col items-center gap-2.5">
          <Logo tone="white" height={22} />
          {badge}
        </div>
        <div className="eb-auth-panel">{children}</div>
      </main>
    </div>
  );
}
