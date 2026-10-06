/** The staff/rep check-in backdrop (app redesign, phase 5): the landing page's
 *  canvas with a glow rising from the top and a field of stars, tinted staff
 *  blue or rep pink. Shared by staff-setup, rep-login and their event picker.
 *  (Name kept from the old purple aurora version so callers didn't change.) */
const STARS = [
  [6, 18], [13, 52], [21, 9], [28, 36], [35, 64], [42, 22], [49, 48], [56, 12], [63, 40], [70, 26],
  [77, 58], [84, 15], [91, 44], [96, 30], [17, 72], [59, 70], [88, 76], [32, 84], [74, 86], [9, 90],
];

export function DarkAuroraShell({ children, tone = "staff" }: { children: React.ReactNode; tone?: "staff" | "rep" }) {
  return (
    <div className="eb-portal" data-tone={tone}>
      <div className="eb-portal-glow" aria-hidden="true" />
      <div className="eb-portal-stars" aria-hidden="true">
        {STARS.map(([x, y], i) => (
          <span key={i} className="lp-star" style={{ left: `${x}%`, top: `${y}%`, width: i % 5 === 0 ? 2.5 : 1.5, height: i % 5 === 0 ? 2.5 : 1.5, animationDelay: `${(i * 0.7) % 6}s`, animationDuration: `${3 + (i % 4)}s` }} />
        ))}
      </div>
      <div className="eb-portal-body">{children}</div>
    </div>
  );
}
