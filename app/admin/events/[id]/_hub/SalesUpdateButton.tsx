"use client";

/**
 * Send sales update: tickets sold and GBOR to the show's agent, by hand.
 * The numbers are counted again when it sends.
 */

import { useState } from "react";
import { Button, Field, Modal, fmtUSD } from "@/app/components/admin/ui";
import { getCookie } from "@/lib/cookies";
import { updatesAddress, type SalesFigures } from "@/lib/events/salesUpdateEmail";
import { OPERATORS } from "@/lib/operators";

type Draft = {
  fromDomain: string;
  to: string;
  cc: string[];
  subject: string;
  message: string;
  figures: SalesFigures;
  lastSentAt: string | null;
};

export default function SalesUpdateButton({ eventId }: { eventId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opening, setOpening] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [sentNote, setSentNote] = useState("");

  const open = async () => {
    setOpening(true); setError(""); setNote(""); setSentNote("");
    try {
      const res = await fetch(`/api/events/${eventId}/sales-update`);
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Couldn't load the sales update.");
      let remembered = "";
      try { remembered = localStorage.getItem("offer-send-from") || ""; } catch { /* private window */ }
      const signedIn = OPERATORS[getCookie("operatorSlug") || ""]?.domain || OPERATORS.venuecore.domain;
      setDraft({
        ...out,
        fromDomain: Object.values(OPERATORS).some((o) => o.domain === remembered) ? remembered : signedIn,
      });
    } catch (e) {
      setSentNote(e instanceof Error ? e.message : "Couldn't load the sales update.");
    } finally {
      setOpening(false);
    }
  };

  const send = async (test: boolean) => {
    if (!draft) return;
    setSending(true); setError(""); setNote("");
    try {
      const res = await fetch(`/api/events/${eventId}/sales-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDomain: draft.fromDomain, subject: draft.subject, message: draft.message, test }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || `Send failed (${res.status})`);
      try { localStorage.setItem("offer-send-from", draft.fromDomain); } catch { /* fine */ }
      if (test) {
        setNote(`Test sent to ${out.to}. The agent didn't get anything.`);
        return;
      }
      setDraft(null);
      setSentNote(`Sales update sent to ${out.to}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {sentNote && <div className="hub-card-note">{sentNote}</div>}
      <Button onClick={open} disabled={opening}>{opening ? "Loading…" : "Send sales update"}</Button>
      {draft && (
        <Modal
          title="Send sales update"
          sub={draft.lastSentAt
            ? `Last sent ${new Date(draft.lastSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`
            : "Not sent for this show yet."}
          onClose={() => !sending && setDraft(null)}
          width={620}
          footer={
            <>
              <span className="filter-spacer" />
              <Button onClick={() => setDraft(null)} disabled={sending}>Cancel</Button>
              <Button onClick={() => send(true)} disabled={sending || !draft.subject}>Send test to me</Button>
              <Button variant="primary" onClick={() => send(false)} disabled={sending || !draft.to || !draft.subject}>
                {sending ? "Sending…" : `Send to ${draft.to || "agent"}`}
              </Button>
            </>
          }
        >
          <div className="ofb-send">
            <div className="ofb-send-attach">
              {draft.figures.sold.toLocaleString()} tickets sold · {fmtUSD(draft.figures.gbor)} GBOR. Counted again when it sends.
            </div>
            <Field label="From">
              <select value={draft.fromDomain} onChange={(e) => setDraft({ ...draft, fromDomain: e.target.value })}>
                {Object.values(OPERATORS).map((o) => (
                  <option key={o.domain} value={o.domain}>{o.copyright} &lt;{updatesAddress(o)}&gt;</option>
                ))}
              </select>
            </Field>
            <Field label="To">
              <div className="ofb-send-attach">{draft.to || "No agent on this show. Link its offer, or add one on the Contacts tab."}</div>
            </Field>
            <Field label="CC" hint="Replies come back to you, not to updates@.">
              <div className="ofb-send-attach">{[...draft.cc, "You"].join(", ")}</div>
            </Field>
            <Field label="Subject">
              <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </Field>
            <Field label="Message" hint="Tickets sold and GBOR are added above it.">
              <textarea rows={6} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} />
            </Field>
            {note && <div className="ofb-banner ofb-banner--good">{note}</div>}
            {error && <div className="ofb-banner ofb-banner--bad">{error}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}
