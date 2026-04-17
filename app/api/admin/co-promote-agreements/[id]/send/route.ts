import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * POST /api/admin/co-promote-agreements/[id]/send
 * Send the agreement to the partner venue's email with a note.
 * Body: { note?: string, cc?: string[] }
 *
 * The PDF is generated client-side (via the UI's download button), so this
 * endpoint sends a simple email notification with a link back to view.
 * For MVP, the PDF attachment flow can be added later.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { note?: string; cc?: string[] };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const admin = createAdminClient();

  const { data: agreement, error } = await admin
    .from("co_promote_agreements")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !agreement) {
    return NextResponse.json({ error: "Agreement not found" }, { status: 404 });
  }

  if (!agreement.partner_email) {
    return NextResponse.json(
      { error: "Partner venue has no email on file" },
      { status: 400 }
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "contracts@venuecore.live";
  const note = body.note || "";
  const cc = body.cc ?? [];

  const subject = `Co-Promotion Agreement for ${agreement.event_name || agreement.event_date} — ${agreement.buyer_company_name}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#0b0d1d;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b0d1d;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#131629;border-radius:12px;overflow:hidden;border:1px solid rgba(208,194,144,0.15);">
        <tr><td style="background:#d0c290;padding:20px 28px;">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:2px;color:#0b0d1d;text-transform:uppercase;">Co-Promotion Agreement</p>
          <h1 style="margin:6px 0 0;font-size:20px;font-weight:800;color:#0b0d1d;">${agreement.event_name || "Event"}</h1>
        </td></tr>
        <tr><td style="padding:28px;">
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
            Hi ${agreement.partner_contact_name || "there"},
          </p>
          <p style="margin:0 0 16px;color:rgba(255,255,255,0.7);font-size:15px;line-height:1.6;">
            ${agreement.buyer_company_name} has prepared a co-promotion agreement for an event at
            ${agreement.partner_venue_name} on ${agreement.event_date}.
          </p>
          ${note ? `<div style="background:rgba(208,194,144,0.06);border-left:3px solid #d0c290;padding:14px 18px;margin:20px 0;border-radius:4px;"><p style="margin:0;color:rgba(255,255,255,0.8);font-size:14px;line-height:1.6;white-space:pre-wrap;">${note.replace(/</g, "&lt;")}</p></div>` : ""}
          <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.04);border-radius:10px;margin:20px 0;">
            <tr><td style="padding:16px 20px;">
              <p style="margin:0 0 6px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Agreement</p>
              <p style="margin:0;color:#fff;font-family:monospace;font-size:13px;">${agreement.agreement_number}</p>
              <p style="margin:12px 0 6px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Event Date</p>
              <p style="margin:0;color:#fff;font-size:14px;">${agreement.event_date}</p>
              ${agreement.expected_capacity ? `<p style="margin:12px 0 6px;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:1px;">Expected Capacity</p><p style="margin:0;color:#fff;font-size:14px;">${agreement.expected_capacity} attendees</p>` : ""}
            </td></tr>
          </table>
          <p style="margin:0;color:rgba(255,255,255,0.6);font-size:13px;line-height:1.6;">
            The full PDF agreement is attached separately. Please review the terms, deal structure,
            and signature blocks. Reach out with any questions or proposed revisions.
          </p>
          <p style="margin:24px 0 0;color:rgba(255,255,255,0.5);font-size:13px;">
            Thanks,<br/>
            ${agreement.buyer_signatory_name || agreement.buyer_company_name}
          </p>
        </td></tr>
        <tr><td style="padding:14px 28px;background:rgba(0,0,0,0.2);text-align:center;">
          <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.2);">Powered by VenueCore</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${agreement.buyer_company_name} <${fromEmail}>`,
      to: [agreement.partner_email],
      cc: cc.length > 0 ? cc : undefined,
      reply_to: agreement.buyer_email || undefined,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json(
      { error: "Failed to send email: " + err },
      { status: 500 }
    );
  }

  // Update status to 'sent' if still in draft
  if (agreement.status === "draft") {
    await admin
      .from("co_promote_agreements")
      .update({ status: "sent" })
      .eq("id", id);
  }

  return NextResponse.json({
    success: true,
    sentTo: agreement.partner_email,
    cc: cc.length > 0 ? cc : undefined,
  });
}
