import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { writeAudit } from "@/lib/auth/audit";
import { createAdminClient } from "@/lib/supabase-server";
import { eventInScope } from "@/lib/contacts/access";
import { defaultRecipients, loadShowContacts } from "@/lib/contacts/showContacts";
import { resolveRecipients } from "@/lib/email/recipients";
import { senderForDomain } from "@/lib/offers/agentEmail";
import { computeEventAudit } from "@/lib/settlement/audit";
import { defaultSalesMessage, salesSubject, salesUpdateEmailHtml, updatesAddress, type SalesFigures } from "@/lib/events/salesUpdateEmail";

export const runtime = "nodejs";
export const maxDuration = 30;

type Admin = ReturnType<typeof createAdminClient>;

/** Today's figures, from the same audit the settlement reads. */
async function figuresFor(admin: Admin, id: string): Promise<SalesFigures | null> {
  const { data: event } = await admin.from("events").select("title, venue, date").eq("id", id).maybeSingle();
  if (!event) return null;
  const audit = await computeEventAudit(admin, id);
  return {
    title: event.title,
    venue: event.venue,
    date: event.date,
    sold: audit.tickets_sold_count,
    capacity: audit.audit.reduce((n, r) => n + (r.capacity || 0), 0),
    gbor: audit.gbor,
  };
}

// GET /api/events/:id/sales-update — what the send box opens with.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("offers", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  if (!(await eventInScope(admin, guard.actor, id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const figures = await figuresFor(admin, id);
  if (!figures) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const { contacts } = await loadShowContacts(admin, id);
  const agent = contacts.find((c) => c.role === "agent");
  const { data: last } = await admin
    .from("audit_log")
    .select("created_at")
    .eq("action", "event.sales_update_sent")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    figures,
    ...defaultRecipients(contacts),
    subject: salesSubject(figures),
    message: defaultSalesMessage(figures, agent?.name),
    lastSentAt: last?.created_at ?? null,
  });
}

// POST /api/events/:id/sales-update — send it, to the agent and assistant only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("offers", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  if (!(await eventInScope(admin, guard.actor, id))) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const sender = senderForDomain(body.fromDomain);
  if (!sender) return NextResponse.json({ error: "Pick a sending domain." }, { status: 400 });

  const { contacts } = await loadShowContacts(admin, id);
  const { to: agentTo, cc: agentCc } = defaultRecipients(contacts);
  if (!body.test && !agentTo) {
    return NextResponse.json({ error: "This show has no agent email. Link its offer, or add one on the Contacts tab." }, { status: 400 });
  }
  const recipients = resolveRecipients({ to: agentTo, cc: agentCc, subject: body.subject, test: body.test }, guard.actor.email);
  if (!recipients.ok) return NextResponse.json({ error: recipients.error }, { status: 400 });
  const { to, cc, subject, test } = recipients;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  // Counted at send time, so it can't go out with numbers from when the box opened.
  const figures = await figuresFor(admin, id);
  if (!figures) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `${sender.copyright} <${updatesAddress(sender)}>`,
      to: [to],
      cc: cc.length ? cc : undefined,
      reply_to: guard.actor.email || undefined,
      subject,
      html: salesUpdateEmailHtml({ figures, sender, subject, message: String(body.message || "") }),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[events/sales-update] resend failed:", err);
    return NextResponse.json({ error: `Resend refused it: ${err}` }, { status: 502 });
  }

  if (!test) {
    await writeAudit(guard.actor, {
      action: "event.sales_update_sent",
      targetType: "event",
      targetId: id,
      detail: { to, cc, from: updatesAddress(sender), sold: figures.sold, gbor: figures.gbor },
    });
  }

  return NextResponse.json({ sent: true, test, to, cc, from: updatesAddress(sender), figures });
}
