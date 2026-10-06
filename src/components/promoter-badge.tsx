import { Award, Crown, ShieldCheck, Sparkles } from "lucide-react";
import { BADGES, type PromoterBadge } from "@/lib/promoters";

const ICONS = { starter: Sparkles, seller: Award, reliable: ShieldCheck, captain: Crown } as const;

/** A promoter's earned badge (migration 0106), as a small glossy chip. */
export function PromoterBadgeChip({ badge, size = "sm" }: { badge: PromoterBadge | null; size?: "sm" | "md" }) {
  if (!badge) return <span className="eb-badge" data-badge="none" data-size={size}>No badge yet</span>;
  const Icon = ICONS[badge];
  return (
    <span className="eb-badge" data-badge={badge} data-size={size}>
      <Icon size={size === "md" ? 14 : 11} aria-hidden="true" />
      {BADGES.find((b) => b.id === badge)?.label}
    </span>
  );
}
