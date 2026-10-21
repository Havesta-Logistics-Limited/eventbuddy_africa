"use client";

import { Shell } from "@/components/shell";
import { AuthLoading } from "@/components/auth-loading";
import { PayoutsView } from "@/components/payouts-view";
import { useRequireRole, useRequireSection } from "@/lib/auth";
import type { Role } from "@/lib/types";

const ADMIN_ONLY: Role[] = ["admin"];

export default function PayoutsPage() {
  const session = useRequireRole(ADMIN_ONLY);
  // team permissions (migration 0137): no access to this page sends them elsewhere
  useRequireSection(session, "payouts");
  if (!session) return <AuthLoading />;
  return (
    <Shell>
      <PayoutsView kind="organizer" />
    </Shell>
  );
}
