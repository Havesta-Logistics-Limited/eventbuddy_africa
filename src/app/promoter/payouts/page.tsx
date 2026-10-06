"use client";

import { Shell } from "@/components/shell";
import { AuthLoading } from "@/components/auth-loading";
import { PayoutsView } from "@/components/payouts-view";
import { useRequireRole } from "@/lib/auth";
import type { Role } from "@/lib/types";

const PROMOTER_ONLY: Role[] = ["promoter"];

export default function PromoterPayoutsPage() {
  const session = useRequireRole(PROMOTER_ONLY);
  if (!session) return <AuthLoading />;
  return (
    <Shell>
      <PayoutsView kind="promoter" />
    </Shell>
  );
}
