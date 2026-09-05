/** Soft, fixed-position brand-color blobs behind the page content — the reason a
 *  glass/backdrop-blur surface reads as glass at all (translucency over a plain
 *  white page is invisible; this gives it something worth blurring). Uses the
 *  same brand/accent hues as the rest of the identity, at low opacity so it stays
 *  ambient rather than competing with foreground content — an Operate surface,
 *  not a marketing page. `pointer-events-none` so it never intercepts clicks. */
export function AmbientBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="absolute -top-32 -left-20 w-[26rem] h-[26rem] rounded-full bg-brand-500/[0.08] blur-3xl" />
      <div className="absolute top-1/4 -right-40 w-[32rem] h-[32rem] rounded-full bg-accent-purple-500/[0.07] blur-3xl" />
      <div className="absolute -bottom-40 left-1/3 w-[24rem] h-[24rem] rounded-full bg-accent-yellow-500/[0.06] blur-3xl" />
    </div>
  );
}
