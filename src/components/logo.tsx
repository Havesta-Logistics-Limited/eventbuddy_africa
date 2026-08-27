import Link from "next/link";

const FULL_ASPECT = 4195 / 671;

/** `tone` is kept for call-site compatibility but both tones resolve to the same
 *  source now — the current mark's orchid-pink wordmark has strong contrast on
 *  both light and dark surfaces, unlike the old lockup's purple-on-transparent
 *  wordmark, which needed a separate white export to survive dark sidebars. */
const SOURCES = {
  full: { brand: "/logo-full.png", white: "/logo-full.png" },
  mark: { brand: "/logo-mark.png", white: "/logo-mark.png" },
} as const;

/** App-wide brand logo — always links back to the marketing landing page
 *  ("/"), from any page in the app. `variant="mark"` is the icon-only mark
 *  for tight spaces (mobile headers, icon boxes); `variant="full"` is the
 *  full name+mark lockup, which already includes the "eventbuddy" wordmark
 *  (no separate text needed alongside it). */
export function Logo({
  variant = "full",
  tone = "brand",
  height = 28,
  className = "",
}: {
  variant?: "full" | "mark";
  tone?: "brand" | "white";
  height?: number;
  className?: string;
}) {
  return (
    <Link href="/" className={`inline-flex items-center shrink-0 ${className}`} aria-label="eventbuddy — home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SOURCES[variant][tone]}
        alt="eventbuddy"
        style={{ height, width: variant === "full" ? height * FULL_ASPECT : height }}
        className="object-contain"
      />
    </Link>
  );
}
