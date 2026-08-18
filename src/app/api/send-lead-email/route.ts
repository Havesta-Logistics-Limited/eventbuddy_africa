import { NextResponse } from "next/server";
import { Resend } from "resend";

type SendLeadEmailBody = {
  to: string;
  subject: string;
  message: string;
  csv: string;
  filename: string;
};

export async function POST(request: Request) {
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
      from: process.env.RESEND_FROM_EMAIL || "UniLink <onboarding@resend.dev>",
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
