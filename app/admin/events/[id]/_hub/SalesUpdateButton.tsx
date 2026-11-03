"use client";

/**
 * Send sales update: tickets sold and GBOR to the show's agent, by hand.
 * The numbers are counted again when it sends.
 */

import { useState } from "react";
import { Button, Field, Modal, fmtUSD } from "@/app/components/admin/ui";
import { getCookie } from "@/lib/cookies";
import { EMAIL } from "@/lib/contacts/showContacts";
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
  /** The show's agent and assistant, to go back to. */
  defaults: { to: string; cc: string[] };
};

const CHIP: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 6px 5px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", fontSize: 13 };
const REMOVE: React.CSSProperties = { border: 0, background: "transparent", color: "inherit", cursor: "pointer", fontSize: 16, lineHeight: 1, minWidth: 28, minHeight: 28 };

export default function SalesUpdateButton({ eventId }: { eventId: string }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [opening, setOpening] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [sentNote, setSentNote] = useState("");
  const [ccInput, setCcInput] = useState("");

  const open = async () => {
    setOpening(true); setError(""); setNote(""); setSentNote("");
    try {
      const res = await fetch(`/api/events/${eventId}/sales-update`);
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Couldn't load the sales update.");
      let remembered = "";
      try { remembered = localStorage.getItem("offer-send-from") || ""; } catch { /* private window */ }
      const signedIn = OPERATORS[getCookie("operatorSlug") || ""]?.domain || OPERATORS.venuecore.domain;
      setCcInput("");
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

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  /** Add what's typed to the CC line. False if it isn't an address. */
  const addCc = () => {
    if (!draft) return true;
    const email = ccInput.trim();
    if (!email) return true;
    if (!EMAIL.test(email)) { setError(`"${email}" isn't a valid email address.`); return false; }
    setError("");
    if (!same(email, draft.to) && !draft.cc.some((c) => same(c, email))) setDraft({ ...draft, cc: [...draft.cc, email] });
    setCcInput("");
    return true;
  };

  const send = async (test: boolean) => {
    if (!draft) return;
    // An address typed but not added yet is still meant to get it.
    const typed = ccInput.trim();
    if (typed && !EMAIL.test(typed)) { setError(`"${typed}" isn't a valid email address.`); return; }
    const cc = typed && !draft.cc.some((c) => same(c, typed)) ? [...draft.cc, typed] : draft.cc;
    if (typed) { setDraft({ ...draft, cc }); setCcInput(""); }
    setSending(true); setError(""); setNote("");
    try {
      const res = await fetch(`/api/events/${eventId}/sales-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromDomain: draft.fromDomain, to: draft.to.trim(), cc, subject: draft.subject, message: draft.message, test }),
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
              <Button variant="primary" onClick={() => send(false)} disabled={sending || !draft.to.trim() || !draft.subject}>
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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="email"
                  aria-label="To"
                  style={{ flex: 1, minWidth: 0 }}
                  placeholder="name@agency.com"
                  value={draft.to}
                  onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                />
                {draft.to && (
                  <button type="button" aria-label="Remove the To address" style={REMOVE} onClick={() => setDraft({ ...draft, to: "" })}>×</button>
                )}
              </div>
            </Field>
            <Field label="CC" hint="You're always copied. Replies come back to you, not to updates@.">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {draft.cc.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {draft.cc.map((email) => (
                      <span key={email} style={CHIP}>
                        {email}
                        <button type="button" aria-label={`Remove ${email}`} style={REMOVE} onClick={() => setDraft({ ...draft, cc: draft.cc.filter((c) => c !== email) })}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="email"
                    aria-label="Add a CC address"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="Add an address"
                    value={ccInput}
                    onChange={(e) => setCcInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCc(); } }}
                  />
                  <Button onClick={addCc} disabled={!ccInput.trim()}>Add</Button>
                </div>
              </div>
            </Field>
            {(!same(draft.to, draft.defaults.to) || draft.cc.join() !== draft.defaults.cc.join()) && (
              <button type="button" style={{ alignSelf: "flex-start", background: "none", border: 0, padding: 0, color: "inherit", fontSize: 13, textDecoration: "underline", cursor: "pointer", minHeight: 24 }} onClick={() => setDraft({ ...draft, to: draft.defaults.to, cc: draft.defaults.cc })}>
                Go back to this show&apos;s agent and assistant
              </button>
            )}
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
