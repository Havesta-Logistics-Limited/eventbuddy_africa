/** Decorative — a fake QR pattern (three finder-pattern corners, like a real one, plus
 *  filler noise) rendered as inline SVG rects. Not scannable, just visually authentic. */
const QR_ROWS = [
  "111111101111111",
  "100000101000001",
  "101110101011101",
  "101110101011101",
  "101110101011101",
  "100000101000001",
  "111111101111111",
  "010000000000010",
  "111111101011010",
  "100000110100101",
  "101110101101010",
  "101110110010101",
  "101110101011010",
  "100000110101101",
  "111111101010010",
];

function MiniQr({ size = 64 }: { size?: number }) {
  const modules = QR_ROWS[0].length;
  const cell = size / modules;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rounded-[3px] bg-white shrink-0" aria-hidden="true">
      {QR_ROWS.flatMap((row, y) =>
        [...row].map((bit, x) => (bit === "1" ? <rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="#221726" /> : null))
      )}
    </svg>
  );
}

/** The signature visual on the auth pages: a stack of "attendee badge" tickets — the
 *  literal artifact EventPal generates (QR + reference ID) for every registration,
 *  rendered as the hero image instead of a generic illustration. */
export function AttendeeBadgeArt({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`relative ${compact ? "h-36 w-64" : "h-48 w-72"} shrink-0 animate-idle-float hover-bounce`} aria-hidden="true">
      <div
        className={`absolute left-6 top-2 ${compact ? "w-44" : "w-52"} rounded-2xl bg-white/8 border border-white/15 animate-badge-settle-back`}
        style={{ height: compact ? 118 : 148 }}
      />
      <div
        className={`absolute left-0 top-0 ${compact ? "w-48" : "w-56"} rounded-2xl bg-[#FFFDF9] shadow-2xl shadow-black/30 overflow-hidden animate-badge-settle-front`}
      >
        <div className="px-4 pt-3.5 pb-2.5">
          <p className="text-[9px] font-semibold tracking-[0.16em] uppercase" style={{ color: "#D4A039" }}>
            Attendee
          </p>
          <p className="text-[13px] font-semibold text-[#221726] mt-1 truncate">Global Careers Expo</p>
        </div>
        <div className="mx-4 border-t border-dashed border-slate-200" />
        <div className="px-4 py-3.5 flex items-center gap-3">
          <MiniQr size={compact ? 44 : 52} />
          <div className="min-w-0">
            <p className="text-[9px] text-slate-400 uppercase tracking-wide">Reference</p>
            <p className="font-mono font-bold text-[13px] text-[#221726] tracking-wide">K7QX-4R2M</p>
          </div>
        </div>
      </div>
    </div>
  );
}
