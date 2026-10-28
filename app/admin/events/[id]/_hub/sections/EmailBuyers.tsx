"use client";

/**
 * Writing to everyone who bought a ticket to this show.
 *
 * Opened from Orders. There was no way to do this: the broadcast tools reach
 * one global newsletter segment, and the only per-buyer email was a one-order
 * ticket resend — so "doors moved to 7" meant exporting the orders and
 * pasting addresses into a mail client.
 *
 * THREE GATES, because a send to a few hundred people cannot be taken back:
 *
 *   1. Preview — the rendered email, as it will arrive.
 *   2. Test — one copy to your own address, so you see it in a real inbox
 *      before anyone else does.
 *   3. The count, typed. The Send button stays disabled until the number in
 *      the box matches the audience. The server checks it again against a
 *      freshly counted audience, so a screen left open while more tickets
 *      sold is refused rather than sent.
 */

import { useCallback, useEffect, useState } from "react";
import { useHub } from "../HubContext";

type Audience = {
  recipientCount: number;
  unreachableOrders: number;
  paidOrders: number;
  refundedOrders: number;
  sample: string[];
  history: Array<{ id: string; subject: string; recipient_count: number; failed_count: number; sent_by: string | null; sent_at: string }>;
  historyAvailable: boolean;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function EmailBuyers({ onClose }: { onClose: () => void }) {
  const hub = useHub();
  const { id } = hub;

  const [audience, setAudience] = useState<Audience | null>(null);
  const [includeRefunded, setIncludeRefunded] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"" | "test" | "send">("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<string>("");

  const load = useCallback(() => {
    fetch(`/api/admin/events/${id}/email?refunded=${includeRefunded ? "1" : "0"}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setAudience(d))
      .catch(() => {});
  }, [id, includeRefunded]);

  useEffect(() => { load(); }, [load]);

  const count = audience?.recipientCount ?? 0;
  const ready = subject.trim() !== "" && body.trim() !== "";
  // The typed number has to match. Not a checkbox: a checkbox is one click
  // whether you read the number or not.
  const armed = ready && count > 0 && confirm.trim() === String(count);

  const post = async (mode: "test" | "send") => {
    setBusy(mode);
    setError("");
    setResult("");
    const res = await fetch(`/api/admin/events/${id}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, mode, includeRefunded, confirmCount: count }),
    });
    setBusy("");
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(d.error || "That didn't send.");
      // The audience moved under us — show the new number.
      if (res.status === 409) { setConfirm(""); load(); }
      return;
    }
    if (mode === "test") {
      setResult(`Test sent to ${d.sentTo}. Check how it looks before sending to everyone.`);
      return;
    }
    setResult(`Sent to ${d.sent} ${d.sent === 1 ? "person" : "people"}${d.failed ? `, ${d.failed} failed` : ""}.`);
    setSubject(""); setBody(""); setConfirm("");
    load();
  };

  return (
    <div className="hub-card ebuy">
      <div className="hub-card-head">
        <div>
          <div className="hub-msg-title">Email everyone holding a ticket</div>
          <div className="hub-promo-sub">
            {audience === null
              ? "Working out who that is…"
              : count === 0
                ? "Nobody yet — this show has no paid orders with an email address on them."
                : <>
                    <b>{count}</b> {count === 1 ? "person" : "people"}, from {audience.paidOrders} paid{" "}
                    {audience.paidOrders === 1 ? "order" : "orders"}.
                    {audience.unreachableOrders > 0 && (
                      <> {audience.unreachableOrders} {audience.unreachableOrders === 1 ? "order has" : "orders have"} no
                      email on {audience.unreachableOrders === 1 ? "it" : "them"} — usually box office cash, and this
                      cannot reach {audience.unreachableOrders === 1 ? "them" : "those buyers"}.</>
                    )}
                  </>}
          </div>
        </div>
        <button type="button" className="hub-card-link" onClick={onClose}>Close</button>
      </div>

      {audience && audience.refundedOrders > 0 && (
        <label className="ebuy-refunded">
          <input type="checkbox" checked={includeRefunded} onChange={(e) => { setIncludeRefunded(e.target.checked); setConfirm(""); }} />
          <span>
            Include the {audience.refundedOrders} refunded {audience.refundedOrders === 1 ? "buyer" : "buyers"}.
            Off by default — they do not hold a ticket. Turn it on for a cancellation.
          </span>
        </label>
      )}

      <div className="ebuy-form">
        <label className="ebuy-field">
          <span>Subject</span>
          <input
            value={subject}
            maxLength={150}
            placeholder="A change to Saturday's doors time"
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="ebuy-field">
          <span>Message</span>
          <textarea
            rows={7}
            value={body}
            maxLength={5000}
            placeholder={"Doors are now at 7:00 rather than 8:00 — the set times have moved up with them.\n\nYour tickets are unchanged."}
            onChange={(e) => setBody(e.target.value)}
          />
          <small>
            The show&rsquo;s name, date, doors and venue are added underneath automatically, so you do not
            have to retype them. Signed with your name.
          </small>
        </label>
      </div>

      {error && <div className="ebuy-error">{error}</div>}
      {result && <div className="ebuy-ok">{result}</div>}

      <div className="ebuy-send">
        <button
          type="button"
          className="ebuy-test"
          disabled={!ready || busy !== ""}
          onClick={() => post("test")}
        >
          {busy === "test" ? "Sending…" : "Send a test to me"}
        </button>

        <div className="ebuy-confirm">
          <label>
            <span>Type {count} to confirm</span>
            <input
              value={confirm}
              inputMode="numeric"
              placeholder={String(count)}
              disabled={!ready || count === 0}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button
            type="button"
            className="ebuy-go"
            disabled={!armed || busy !== ""}
            onClick={() => {
              if (!confirm.trim()) return;
              if (!window.confirm(`Send "${subject}" to ${count} ${count === 1 ? "person" : "people"}? This cannot be undone.`)) return;
              post("send");
            }}
          >
            {busy === "send" ? "Sending…" : `Send to ${count}`}
          </button>
        </div>
      </div>

      {audience && audience.history.length > 0 && (
        <div className="ebuy-history">
          <div className="hub-promo-sub">Already sent about this show</div>
          <ul>
            {audience.history.map((h) => (
              <li key={h.id}>
                <b>{h.subject}</b>
                <span>
                  {h.recipient_count} {h.recipient_count === 1 ? "person" : "people"}
                  {h.failed_count ? `, ${h.failed_count} failed` : ""} · {when(h.sent_at)}
                  {h.sent_by ? ` · by ${h.sent_by}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {audience && !audience.historyAvailable && (
        <div className="hub-promo-sub ebuy-note">
          Run plans/event-emails-migration.sql to keep a record of what was sent.
        </div>
      )}
    </div>
  );
}
