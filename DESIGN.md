# Design

<!-- impeccable:design-schema 1 -->

## Identity

**eventbuddy**, brand v5 (rebrand, 2026-08-27) — replaces the v4 teal→purple→green-primary identity. Triggered by a user-supplied logo and primary color, rolled out everywhere at once: marketing site, dashboard, platform admin, transactional emails, and favicon/app icons.

### Logo

Four overlapping circles at ~80% opacity (orange, magenta, violet, indigo) over a pale pink petal shape, plus an "eventbuddy" wordmark in orchid pink. Source files: `public/logo-full.png` (full lockup, aspect 4195:671) and `public/logo-mark.png` (icon-only, square, transparent, ~6% safe-area padding). `src/components/logo.tsx` renders both; the `tone` prop (`"brand" | "white"`) is kept for call-site compatibility but both resolve to the same colorful asset now — the pink wordmark has strong contrast on both light and dark surfaces, unlike the old lockup, which needed a separate white export to survive dark sidebars.

App icons derived from the same mark: `src/app/icon.png` (512px, transparent), `src/app/apple-icon.png` (180px, white backing — iOS renders transparency as black), `src/app/favicon.ico` (multi-res 16/32/48/64/256, transparent).

## Color

Full palette strategy (Persuade surfaces get real color commitment; Operate surfaces use it for actions/state, not backgrounds). Every ramp's `500` is a true hue from the logo itself — bright, meant for glows/fills/decorative surfaces with dark text or as a light-on-dark accent, not for white-text buttons. `600`/`700` are deepened versions of the same hue, built to hold ≥4.5:1 contrast with white text for solid buttons, links, and active states.

All defined as CSS custom properties in `src/app/globals.css` (`@theme` block) and consumed via Tailwind utility classes (`bg-brand-600`, `text-accent-purple-500`, etc.) — changing the token value cascades to every usage app-wide, which is how this rebrand and the one before it were rolled out without touching most call sites.

| Token | 50 | 100 | 500 (logo hue) | 600 (button/text-safe) | 700 (hover/active) |
|---|---|---|---|---|---|
| `brand` (primary — pink) | `#FFF3FD` | `#FFD6F7` | `#FF8AF5` | `#C21FAF` | `#93147D` |
| `accent-purple` (secondary — violet) | `#F1EBFE` | `#E1D3FC` | `#8B5CF6` | `#6D28D9` | `#4C1D95` |
| `accent-yellow` (tertiary — orange) | `#FFF1E6` | `#FFDAB8` | `#FF7D2D` | `#E85D0A` | `#B8460A` |
| `accent-green` (quaternary — magenta) | `#FDECFB` | `#FBD0F7` | `#ED1CDC` | `#B8119C` | `#8A0D74` |

`ink-900` (near-black, hero backgrounds / OG image): `#170821` — a deep violet-black rather than a neutral black, so dark surfaces read as part of the same palette instead of generic.

**Deliberately untouched by this rebrand** — functional, not identity, color:
- `staff-600`/`staff-700` (`#1098F7`/`#0C7BCC`): a separate blue identity for the staff/rep portal, distinct from the org-admin brand palette by design (see `shell.tsx`) — keeps "which portal am I in" legible at a glance.
- `teal-*` tokens and Tailwind's own teal scale: semantic success/positive status (checked-in badges, confirmation states) across dozens of unrelated call sites — not brand.
- Amber/rose/slate used for warning/error/neutral status chips throughout the dashboard and platform admin.

Decorative dark panels (login/signup split-screen, platform admin sidebar `SIDEBAR_BG`) use a unified deep violet-plum, `#22103A`, instead of the old near-black green, so every dark surface in the app now reads as one family with `ink-900`.

## Type

Unchanged by this rebrand: DM Serif Display (`--font-display`, body headings), Inter (`--font-sans`, UI/body text), Playfair Display 700/900 (`.font-display-bold`, only for the homepage trust-band stat numbers, which need real heavy-serif weight DM Serif Display doesn't ship).

## Component Language

Unchanged: rounded-xl/2xl cards, soft shadows, pill-shaped buttons and status badges, the existing spacing/motion system in `globals.css` (settle/marquee/modal/drawer keyframes). This rebrand is a palette-and-asset swap, not a structural redesign — composition, layout, and copy were preserved everywhere except the small landing-page copy/asset updates the logo swap itself required.

## Email

`src/lib/email-template.ts` renders a colored banner band (each transactional email keeps its own accent — welcome/brand pink, password reset/near-black, payouts/teal, event-created and draft-reminder/amber) with the full-color logo centered on top. The logo is a multi-hue raster now, not a single-color wordmark, so it stays legible against any banner color without needing a separate light/dark export.
