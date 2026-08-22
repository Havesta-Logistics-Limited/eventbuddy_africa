import Link from "next/link";

const FULL_ASPECT = 4220 / 1036;

/** `tone="white"` swaps in a recolored export for dark surfaces (sidebars, dark
 *  hero panels) — the source "full" lockup's wordmark is brand-purple-on-transparent,
 *  which disappears against a dark background. The "mark" badge already sits on its
 *  own white circle, so it reads fine on dark surfaces at either tone. */
const SOURCES = {
  full: { brand: "/logo-full.png", white: "/logo-full-white.png" },
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
