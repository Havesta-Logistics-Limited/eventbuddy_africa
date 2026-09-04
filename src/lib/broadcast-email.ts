import { Resend } from "resend";
import { renderEmailShell, escapeHtml } from "@/lib/email-template";

/** Resend's batch endpoint accepts at most 100 emails per call — see
 *  https://resend.com/docs/dashboard/emails/batch-sending#limitations. */
const BATCH_SIZE = 100;

/** Hard cap on one broadcast's recipient count — not a product limit so much as a
 *  guardrail against a single call accidentally trying to send thousands of emails
 *  in one request (timeout risk, and worth a human noticing before it happens at
 *  real scale). Recipients beyond this are silently dropped by the caller, which
 *  logs how many were cut. */
export const BROADCAST_RECIPIENT_CAP = 2000;

/**
 * Sends one organizer-authored update to every recipient — same content, not
 * personalized per attendee. Chunks into Resend's 100-per-call batch limit and
 * keeps going across chunk failures (a Resend outage on one chunk shouldn't
 * cancel every other chunk that would have gone out fine), returning how many
 * actually sent so the caller can report an honest count back to the organizer.
 */
export async function sendBroadcastEmail(params: {
  recipients: string[];
  eventName: string;
  subject: string;
  bodyText: string;
}): Promise<{ sentCount: number; totalCount: number }> {
  const apiKey = process.env.RESEND_API_KEY;
  const totalCount = params.recipients.length;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here" || totalCount === 0) {
    return { sentCount: 0, totalCount };
  }

  const from = process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>";
  const safeEvent = escapeHtml(params.eventName);
  const safeBody = escapeHtml(params.bodyText).replace(/\n/g, "<br>");
  const html = renderEmailShell(
    { color: "#C21FAF", label: "Event update", emoji: "📣" },
    `<h1 style="font-size:19px; margin:0 0 4px;">${safeEvent}</h1><p style="margin:16px 0 0; white-space:pre-line;">${safeBody}</p>`
  );

  const resend = new Resend(apiKey);
  let sentCount = 0;
  for (let i = 0; i < params.recipients.length; i += BATCH_SIZE) {
    const chunk = params.recipients.slice(i, i + BATCH_SIZE);
    try {
      const { data, error } = await resend.batch.send(
        chunk.map((to) => ({ from, to, subject: params.subject, text: params.bodyText, html }))
      );
      if (error) {
        console.error(`[broadcast] batch send failed for ${chunk.length} recipients:`, error.message);
        continue;
      }
      sentCount += data?.data?.length ?? chunk.length;
    } catch (err) {
      console.error(`[broadcast] batch send threw for ${chunk.length} recipients:`, err instanceof Error ? err.message : err);
    }
  }
  return { sentCount, totalCount };
}
