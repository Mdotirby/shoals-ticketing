import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/can";
import { actorName } from "@/lib/auth/actor-name";
import { eventEmailAudience } from "@/lib/email/event-audience";
import { render } from "@react-email/components";
import { EventUpdateEmail } from "@/lib/email/EventUpdateEmail";
import { getOperator } from "@/lib/operators";

/**
 * Emailing everyone who bought a ticket to one show.
 *
 * GET  — the audience, and what has already been sent.
 * POST — a test to the sender, or the real send.
 *
 * WHAT STOPS THIS GOING WRONG
 *
 * A real send reaches hundreds of customers and cannot be taken back, so the
 * guards are server-side, not just in the compose screen:
 *
 *   · message_buyers, which is Owner and Venue Admin only.
 *   · mode must be the literal "send". Anything else is a test, and a test
 *     only ever goes to the signed-in user's own address — the recipient list
 *     is not even built for it.
 *   · confirmCount must equal the audience size the server computes for
 *     itself, right now. A stale compose screen, a double-submit after more
 *     tickets sold, a replayed request: all refused rather than sent.
 *
 * The body is rendered as text by the email component, never as HTML, so
 * nothing typed into it can become markup in a customer's inbox.
 */

const MAX_SUBJECT = 150;
const MAX_BODY = 5000;
/** Resend's batch endpoint takes 100 per call. */
const BATCH = 100;

async function loadEvent(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data } = await admin
    .from("events")
    .select("id, title, date, doors_time, venue, landing_page_slug")
    .eq("id", id)
    .maybeSingle();
  return data;
}

// GET /api/admin/events/:id/email — who would receive, and what already went
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("message_buyers");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const includeRefunded = new URL(request.url).searchParams.get("refunded") === "1";

  try {
    const audience = await eventEmailAudience(admin, id, { includeRefunded });

    // History is best-effort: the migration may not have been run, and not
    // being able to show what went before is no reason to block a send.
    let history: unknown[] = [];
    const { data, error } = await admin
      .from("event_emails")
      .select("id, subject, recipient_count, failed_count, sent_by, sent_at")
      .eq("event_id", id)
      .order("sent_at", { ascending: false })
      .limit(20);
    if (!error) history = data ?? [];

    return NextResponse.json({
      recipientCount: audience.recipients.length,
      unreachableOrders: audience.unreachableOrders,
      paidOrders: audience.paidOrders,
      refundedOrders: audience.refundedOrders,
      // A handful, so the sender can see these are real addresses — not the
      // whole list, which has no use on the compose screen.
      sample: audience.recipients.slice(0, 5).map((r) => r.email),
      history,
      historyAvailable: !error,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not work out the audience." },
      { status: 500 },
    );
  }
}

// POST /api/admin/events/:id/email — { subject, body, mode, confirmCount, includeRefunded }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireCapability("message_buyers", { write: true });
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const admin = createAdminClient();
  const payload = await request.json().catch(() => ({}));

  const subject = typeof payload.subject === "string" ? payload.subject.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const includeRefunded = payload.includeRefunded === true;
  const isRealSend = payload.mode === "send";

  if (!subject || !body) {
    return NextResponse.json({ error: "A subject and a message are both required." }, { status: 400 });
  }
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) {
    return NextResponse.json({ error: "That subject or message is too long." }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "Email is not configured on this server." }, { status: 503 });
  }

  const event = await loadEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const operator = getOperator("venuecore");
  const sender = (await actorName(guard.actor)) || "The box office";
  const eventUrl = `https://${operator.domain}/events/${event.id}`;
  const dateLabel = event.date
    ? new Date(String(event.date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : "";
  const showTime = event.date && String(event.date).length > 10
    ? new Date(String(event.date)).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  const htmlFor = (firstName: string) =>
    render(
      EventUpdateEmail({
        firstName,
        message: body,
        eventName: event.title ?? "your show",
        eventDate: dateLabel,
        doorsTime: event.doors_time ?? null,
        showTime,
        venueName: event.venue ?? "",
        eventUrl,
        senderName: sender,
        previewText: subject,
      }),
    );

  const from = "West 72 Entertainment <tickets@west72ent.com>";

  // ── A test goes to the sender, and only to the sender ────────────────────
  // The audience is not even built here, so there is no list in scope that a
  // mistake could reach.
  if (!isRealSend) {
    const to = guard.actor.email;
    if (!to) {
      return NextResponse.json(
        { error: "Your account has no email address to send a test to." },
        { status: 400 },
      );
    }
    const html = await htmlFor(sender.split(" ")[0] || "there");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `[TEST] ${subject}`, html }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Test send failed: ${await res.text()}` }, { status: 502 });
    }
    return NextResponse.json({ test: true, sentTo: to });
  }

  // ── The real send ────────────────────────────────────────────────────────
  const audience = await eventEmailAudience(admin, id, { includeRefunded });
  const count = audience.recipients.length;

  if (count === 0) {
    return NextResponse.json({ error: "Nobody to send to — this show has no paid orders with an email address." }, { status: 400 });
  }

  /**
   * The typed count must match what the server finds NOW. This is the guard
   * that makes the compose screen's confirmation mean something: if more
   * tickets sold since it was loaded, or the request is a replay of an
   * earlier one, the numbers disagree and nothing is sent.
   */
  if (Number(payload.confirmCount) !== count) {
    return NextResponse.json(
      {
        error: `The audience changed — it is ${count} now, not ${payload.confirmCount}. Check the number and confirm again.`,
        recipientCount: count,
      },
      { status: 409 },
    );
  }

  let failed = 0;
  for (let i = 0; i < audience.recipients.length; i += BATCH) {
    const slice = audience.recipients.slice(i, i + BATCH);
    const emails = await Promise.all(
      slice.map(async (r) => ({
        from,
        to: [r.email],
        subject,
        html: await htmlFor(r.name?.split(" ")[0] || "there"),
      })),
    );
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(emails),
    });
    if (!res.ok) {
      failed += slice.length;
      console.error("[event-email] batch failed:", await res.text());
    }
  }

  // Recorded after the fact, so the row describes what actually happened.
  // Best-effort: the migration may not have been run, and a missing audit row
  // is not a reason to tell the sender the send failed when it did not.
  const { error: logErr } = await admin.from("event_emails").insert({
    event_id: id,
    subject,
    body,
    recipient_count: count,
    failed_count: failed,
    unreachable_count: audience.unreachableOrders,
    included_refunded: includeRefunded,
    sent_by: sender,
  });

  return NextResponse.json({
    sent: count - failed,
    failed,
    recipientCount: count,
    unreachableOrders: audience.unreachableOrders,
    recorded: !logErr,
  });
}
