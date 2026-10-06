/* The things an event is made of, drawn as glossy objects: a ticket, a check-in
 * badge carrying a real-format reference ID and QR, a VIP wristband, and the
 * four orbs of the eventbuddy mark. Pure SVG so they stay crisp at any size and
 * need no image assets. Each id prefix keeps gradient ids unique on the page. */

// Deterministic QR-ish matrix: three finder squares plus seeded data modules, so
// server and client render the same pattern (no hydration mismatch).
function qrCells(size: number, seed: number) {
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
      if (inBox(ox, oy)) {
        const dx = x - ox, dy = y - oy;
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const core = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        return ring || core ? 1 : 0;
      }
      if (x >= ox - 1 && x <= ox + 7 && y >= oy - 1 && y <= oy + 7) return 0;
    }
    return -1;
  };
  const cells: [number, number][] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const f = finder(x, y);
      if (f === 1 || (f === -1 && rand() > 0.52)) cells.push([x, y]);
    }
  }
  return cells;
}

export function TicketObject({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 128" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="tk-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8AF5" />
          <stop offset="0.45" stopColor="#ED1CDC" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
        <linearGradient id="tk-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="tk-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4C1D95" />
          <stop offset="1" stopColor="#2A0C4A" />
        </linearGradient>
        <mask id="tk-cut">
          <rect width="260" height="128" fill="#fff" />
          <circle cx="182" cy="4" r="11" fill="#000" />
          <circle cx="182" cy="116" r="11" fill="#000" />
        </mask>
      </defs>
      {/* thickness: the same shape, offset down, in a darker tone */}
      <g mask="url(#tk-cut)" transform="translate(0 8)">
        <rect x="2" y="4" width="256" height="112" rx="16" fill="url(#tk-edge)" />
      </g>
      <g mask="url(#tk-cut)">
        <rect x="2" y="4" width="256" height="112" rx="16" fill="url(#tk-body)" />
        <rect x="2" y="4" width="256" height="58" rx="16" fill="url(#tk-gloss)" />
        <line x1="182" y1="18" x2="182" y2="102" stroke="#fff" strokeOpacity="0.55" strokeWidth="2" strokeDasharray="5 6" strokeLinecap="round" />
        <text x="24" y="44" fill="#fff" style={{ fontFamily: "var(--font-hero)" }} fontWeight="700" fontSize="13" letterSpacing="2.4">ADMIT ONE</text>
        <text x="24" y="78" fill="#fff" style={{ fontFamily: "var(--font-hero)" }} fontWeight="700" fontSize="26" letterSpacing="-0.5">Regular</text>
        <text x="24" y="98" fill="#fff" fillOpacity="0.8" style={{ fontFamily: "var(--font-sans)" }} fontWeight="500" fontSize="11">SAT 14 NOV · 7PM</text>
        <text x="220" y="70" fill="#fff" fillOpacity="0.92" style={{ fontFamily: "var(--font-hero)" }} fontWeight="700" fontSize="13" letterSpacing="2" textAnchor="middle" transform="rotate(-90 220 64)">No. 0124</text>
      </g>
    </svg>
  );
}

export function BadgeObject({ className = "" }: { className?: string }) {
  const cells = qrCells(21, 7);
  const q = 4.2;
  return (
    <svg viewBox="0 0 170 246" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="bd-strap" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4C1D95" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#4C1D95" />
        </linearGradient>
        <linearGradient id="bd-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EFE8F7" />
        </linearGradient>
        <linearGradient id="bd-head" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C21FAF" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
        <linearGradient id="bd-gloss" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.7" />
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* lanyard strap and clip */}
      <path d="M62 0 L74 44 L96 44 L108 0" fill="none" stroke="url(#bd-strap)" strokeWidth="13" strokeLinejoin="round" />
      <rect x="72" y="38" width="26" height="16" rx="4" fill="#C7BFD3" />
      <rect x="76" y="44" width="18" height="4" rx="2" fill="#8E86A0" />
      {/* card edge (thickness) then face */}
      <rect x="13" y="58" width="146" height="184" rx="16" fill="#B9AACD" />
      <rect x="11" y="52" width="146" height="186" rx="16" fill="url(#bd-face)" />
      <path d="M11 68 a16 16 0 0 1 16 -16 h114 a16 16 0 0 1 16 16 v22 h-146 z" fill="url(#bd-head)" />
      <circle cx="84" cy="54" r="5" fill="#2A0C4A" />
      <text x="26" y="82" fill="#fff" style={{ fontFamily: "var(--font-hero)" }} fontWeight="700" fontSize="11" letterSpacing="1.8">ATTENDEE</text>
      <text x="26" y="116" fill="#170821" style={{ fontFamily: "var(--font-hero)" }} fontWeight="700" fontSize="17" letterSpacing="-0.3">Amara Okafor</text>
      <g transform="translate(40 128)">
        <rect x="-5" y="-5" width={21 * q + 10} height={21 * q + 10} rx="6" fill="#fff" />
        {cells.map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x * q} y={y * q} width={q} height={q} fill="#170821" />
        ))}
      </g>
      <text x="84" y="231" fill="#6D28D9" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontWeight="600" fontSize="11.5" letterSpacing="1.2" textAnchor="middle">K7QX-4R2M</text>
      <rect x="11" y="52" width="146" height="186" rx="16" fill="url(#bd-gloss)" />
    </svg>
  );
}

export function WristbandObject({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="wb-front" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB070" />
          <stop offset="0.5" stopColor="#FF7D2D" />
          <stop offset="1" stopColor="#E85D0A" />
        </linearGradient>
        <linearGradient id="wb-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B8460A" />
          <stop offset="1" stopColor="#7A2E06" />
        </linearGradient>
      </defs>
      {/* far half of the loop, seen through the opening */}
      <path d="M22 70 C22 30 198 30 198 70" fill="none" stroke="url(#wb-back)" strokeWidth="26" strokeLinecap="round" />
      {/* near half, brighter and thicker in perspective */}
      <path d="M22 70 C22 122 198 122 198 70" fill="none" stroke="url(#wb-front)" strokeWidth="32" strokeLinecap="round" />
      <path d="M34 82 C52 106 168 106 186 82" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
      {/* snap tab */}
      <rect x="88" y="96" width="44" height="30" rx="7" fill="#170821" />
      <rect x="88" y="96" width="44" height="12" rx="6" fill="#fff" fillOpacity="0.14" />
      <text x="110" y="117" fill="#FFDAB8" style={{ fontFamily: "var(--font-hero)" }} fontWeight="800" fontSize="12" letterSpacing="1.6" textAnchor="middle">VIP</text>
    </svg>
  );
}

const ORBS = [
  { cx: 38, cy: 60, r: 34, a: "#FFC08F", b: "#FF7D2D", c: "#B8460A" },
  { cx: 78, cy: 46, r: 40, a: "#FF9CF6", b: "#ED1CDC", c: "#8A0D74" },
  { cx: 116, cy: 64, r: 38, a: "#C4A8FF", b: "#8B5CF6", c: "#4C1D95" },
  { cx: 150, cy: 50, r: 30, a: "#A5A8FF", b: "#5B4BF0", c: "#2A1C8F" },
];

export function OrbsObject({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 190 110" className={className} aria-hidden="true">
      <defs>
        {ORBS.map((o, i) => (
          <radialGradient key={i} id={`orb-${i}`} cx="0.35" cy="0.3" r="0.75">
            <stop offset="0" stopColor={o.a} />
            <stop offset="0.55" stopColor={o.b} />
            <stop offset="1" stopColor={o.c} />
          </radialGradient>
        ))}
      </defs>
      {ORBS.map((o, i) => (
        <g key={i} opacity="0.94">
          <circle cx={o.cx} cy={o.cy} r={o.r} fill={`url(#orb-${i})`} />
          <ellipse cx={o.cx - o.r * 0.32} cy={o.cy - o.r * 0.42} rx={o.r * 0.34} ry={o.r * 0.2} fill="#fff" fillOpacity="0.5" transform={`rotate(-28 ${o.cx - o.r * 0.32} ${o.cy - o.r * 0.42})`} />
        </g>
      ))}
    </svg>
  );
}
