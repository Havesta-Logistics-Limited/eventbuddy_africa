import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";

function htmlPage(title: string, body: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title></head>
<body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f8fafc;margin:0;padding:0;">
  <div style="max-width:420px;margin:80px auto;padding:32px;background:#fff;border-radius:16px;border:1px solid #e2e8f0;text-align:center;">
    <h1 style="font-size:18px;color:#1e1b2e;margin:0 0 8px;">${title}</h1>
    <p style="font-size:14px;color:#64748b;margin:0;">${body}</p>
  </div>
</body></html>`;
}

/** One-click unsubscribe link included in every audience blast (see
 *  organization_email_suppressions and src/lib/unsubscribe.ts). GET, not POST —
 *  this needs to work from a plain email-client link click, no JS/form involved. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const org = searchParams.get("org");
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  if (!org || !email || !token || !verifyUnsubscribeToken(org, email, token)) {
    return new NextResponse(htmlPage("Link not valid", "This unsubscribe link is invalid or has expired."), {
      status: 400,
      headers: { "content-type": "text/html" },
    });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("organization_email_suppressions").upsert({ organization_id: org, email: email.toLowerCase() }, { onConflict: "organization_id,email" });
  if (error) {
    return new NextResponse(htmlPage("Something went wrong", "Couldn't process that request. Please try again."), {
      status: 500,
      headers: { "content-type": "text/html" },
    });
  }

  return new NextResponse(htmlPage("You're unsubscribed", "You won't receive any more emails like this one from this organizer."), {
    headers: { "content-type": "text/html" },
  });
}
