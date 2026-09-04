"use client";

import { useParams } from "next/navigation";
import { RegisterPageContent } from "@/components/register-page-content";

/** Org-scoped registration link — kept working for anything shared before
 *  /discover/[slug] existed, or an event with no global slug set. See
 *  RegisterPageContent for the actual page. */
export default function RegisterPage() {
  const { orgSlug, eventId } = useParams<{ orgSlug: string; eventId: string }>();
  return <RegisterPageContent orgSlug={orgSlug} eventIdOrSlug={eventId} />;
}
