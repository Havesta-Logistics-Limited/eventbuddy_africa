/** Same dark glassmorphic backdrop as the public registration page
 *  (register-page-content.tsx) — deep purple ground with two soft, slow-drifting
 *  color blobs, so a `bg-white/10 backdrop-blur-xl` card actually reads as glass
 *  instead of floating on a flat color. Shared by every public check-in flow
 *  (staff-setup, rep-login) that wants the same visual identity as registration. */
export function DarkAuroraShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#22103A]">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-24 w-[520px] h-[520px] rounded-full bg-[#C21FAF]/25 blur-[110px] animate-aurora-a" />
        <div className="absolute top-1/3 -right-32 w-[560px] h-[560px] rounded-full bg-[#6D28D9]/25 blur-[120px] animate-aurora-b" />
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
