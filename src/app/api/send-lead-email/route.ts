import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient as createServerClient } from "@/lib/supabase/server";

type SendLeadEmailBody = {
  to: string;
  subject: string;
  message: string;
  csv: string;
  filename: string;
};

/**
 * Sends a CSV of leads by email — reachable only by a signed-in org admin. This route
 * had no auth check at all before: anyone on the internet could POST an arbitrary
 * `to`/`subject`/`text`/attachment and use this app's Resend sending identity as an
 * open relay. The cookie-bound, RLS-respecting server client confirms a real Supabase
 * Auth session exists before any email goes out — same pattern as
 * /api/platform/create-admin and /api/platform/delete-org.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user: caller },
  } = await supabase.auth.getUser();
  if (!caller) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json()) as Partial<SendLeadEmailBody>;
  const { to, subject, message, csv, filename } = body;

  if (!to || typeof to !== "string") {
    return NextResponse.json({ error: "A recipient email is required." }, { status: 400 });
  }
  if (!csv) {
    return NextResponse.json({ error: "Nothing to attach — there are no leads to send." }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "paste_your_resend_api_key_here") {
    return NextResponse.json(
      { error: "Email sending isn't configured yet. Add a real RESEND_API_KEY to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  const resend = new Resend(apiKey);

  try {
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "eventbuddy <onboarding@resend.dev>",
      to,
      subject: subject || "Attendee leads",
      text: message || "",
      attachments: [
        {
          filename: filename || "leads.csv",
          content: Buffer.from(csv, "utf-8").toString("base64"),
        },
      ],
    });

    if (error) {
      return NextResponse.json({ error: error.message || "Failed to send email." }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send email." }, { status: 500 });
  }
}
