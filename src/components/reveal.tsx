/** No-op wrapper — kept so call sites across the app don't need to change, but it
 *  no longer animates anything (the stagger-reveal effect read as too mechanical and
 *  was pulled per feedback). `index` is intentionally unused. */
export function Reveal({ className, children }: { index?: number; className?: string; children: React.ReactNode }) {
  return <div className={className}>{children}</div>;
}
