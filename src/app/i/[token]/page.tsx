import type { Metadata } from "next";
import { Download } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupInvite } from "@/lib/invite-lookup";
import { formatDate, formatTime } from "@/lib/utils";

/**
 * A guest's personal invitation page (migration 0136): their flyer with their
 * own entry QR and name, and a button to save it. Opened from the WhatsApp
 * message or email; the link is private to them, so it's never indexed.
 */

export const metadata: Metadata = { title: "Your invitation", robots: { index: false, follow: false, nocache: true } };
export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await lookupInvite(createAdminClient(), token);

  if (!invite || !invite.referenceId || !invite.event.published) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#fbf7f2] p-6 text-center text-[#3a3852]">
        <div className="max-w-sm">
          <p className="text-lg font-semibold text-[#14122b]">This invitation isn&apos;t available.</p>
          <p className="mt-1 text-sm">The link may be incomplete, or the host has changed the guest list. Please contact them.</p>
        </div>
      </main>
    );
  }

  const flyer = `/api/invites/${token}/flyer`;
  const when = [formatDate(invite.event.date), invite.event.start_time ? formatTime(invite.event.start_time) : ""].filter(Boolean).join(" · ");
  const where = [invite.event.venue, invite.event.location].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#fbf7f2] px-4 py-8 text-[#3a3852]">
      <div className="mx-auto max-w-md">
        <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#a0739a]">Your invitation</p>
        <h1 className="mt-1 text-center text-2xl font-bold text-[#14122b]">{invite.event.name}</h1>
        <p className="mt-1 text-center text-sm">{`Dear ${invite.guestName}`}</p>
        {invite.design ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={flyer} alt={`Invitation to ${invite.event.name} for ${invite.guestName}, with your entry QR code`} className="mt-5 w-full rounded-2xl shadow-xl" />
        ) : null}
        <a
          href={`${flyer}?download=1`}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#14122b] px-5 py-3.5 text-sm font-semibold text-white"
        >
          <Download size={16} aria-hidden="true" /> Save my invitation
        </a>
        <div className="mt-5 rounded-2xl bg-white p-4 text-sm shadow-sm">
          <p className="font-semibold text-[#14122b]">{when}</p>
          {where && <p className="mt-0.5">{where}</p>}
          <p className="mt-3 text-xs text-[#7a7891]">
            Show the QR code on your invitation at the entrance. It&apos;s yours alone and works once.
            {invite.orgName ? ` Hosted by ${invite.orgName}.` : ""}
          </p>
        </div>
        <p className="mt-6 text-center text-[11px] text-[#9a98ad]">Invitations by eventbuddy</p>
      </div>
    </main>
  );
}
