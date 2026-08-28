"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { suggestReminderStage, parseNaiveLocalDate } from "@/standalone-emails/lib/reminderStage";
import type { ReminderStage } from "@/standalone-emails/templates/EventAnnouncementEmail";

const REMINDER_STAGE_OPTIONS: { value: ReminderStage | ""; label: string }[] = [
  { value: "", label: "Normal announcement" },
  { value: "week", label: "One Week Away" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "tonight", label: "Tonight's the Night" },
];

// Only the 2 triggers with a real template/mapper/send-fn today. Reading from
// standalone-emails/lib/triggers.ts's TRIGGERS is deliberately NOT done here —
// most of that list is reserved-but-unbuilt, and showing them would let an
// admin pick a trigger with no template behind it. Add to this list one line
// at a time as each new trigger actually ships.
const LIVE_TRIGGERS = [
  { value: "new_event_announcement", label: "New Event Announcement", description: "Announce a show — presale/on-sale aware." },
  { value: "upcoming_events_digest", label: "Upcoming Events Digest", description: "A short list of what's coming up next." },
];

type EventOption = { id: string; title: string; date: string };

export default function NewBroadcastPage() {
  const router = useRouter();
  const [trigger, setTrigger] = useState("");
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState("");
  const [limit, setLimit] = useState(3);
  const [reminderStage, setReminderStage] = useState<ReminderStage | "">("");
  const [customMessage, setCustomMessage] = useState("");
  const [digestMode, setDigestMode] = useState<"auto" | "choose">("auto");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);

  const [previewHtml, setPreviewHtml] = useState("");
  const [previewSubject, setPreviewSubject] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState("");

  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  useEffect(() => {
    fetch("/api/events").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setEvents(data);
    }).catch(() => {});

    getSupabaseBrowser().auth.getUser().then((result: { data: { user: { email?: string } | null } }) => {
      const email = result.data?.user?.email;
      if (email) setTestTo(email);
    });

    fetch("/api/broadcasts/audience").then((r) => r.json()).then((data) => {
      setSubscriberCount(data.subscriberCount ?? null);
    }).catch(() => {});
  }, []);

  const paramsReady =
    trigger === "new_event_announcement"
      ? !!eventId
      : trigger === "upcoming_events_digest"
        ? digestMode === "auto" || selectedEventIds.length > 0
        : false;

  async function handlePreview() {
    setPreviewLoading(true);
    setPreviewError("");
    setPreviewHtml("");
    try {
      const res = await fetch("/api/broadcasts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger,
          eventId: eventId || undefined,
          limit,
          reminderStage: reminderStage || undefined,
          customMessage: customMessage.trim() || undefined,
          eventIds: digestMode === "choose" ? selectedEventIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || "Failed to render preview");
        return;
      }
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
    } catch {
      setPreviewError("Failed to render preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleTestSend() {
    if (!testTo) return;
    setTestSending(true);
    setTestError("");
    setTestResult("");
    try {
      const res = await fetch("/api/broadcasts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger,
          eventId: eventId || undefined,
          limit,
          to: testTo,
          reminderStage: reminderStage || undefined,
          customMessage: customMessage.trim() || undefined,
          eventIds: digestMode === "choose" ? selectedEventIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error || "Failed to send test");
        return;
      }
      setTestResult(`Test sent to ${testTo}.`);
    } catch {
      setTestError("Failed to send test");
    } finally {
      setTestSending(false);
    }
  }

  async function handleBroadcastSend() {
    const count = subscriberCount ?? 0;
    const confirmed = confirm(
      `Send "${previewSubject}" to all ${count} newsletter subscribers? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSending(true);
    setSendError("");
    try {
      const res = await fetch("/api/broadcasts/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger,
          eventId: eventId || undefined,
          limit,
          confirm: true,
          reminderStage: reminderStage || undefined,
          customMessage: customMessage.trim() || undefined,
          eventIds: digestMode === "choose" ? selectedEventIds : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error || "Failed to send broadcast");
        return;
      }
      setTimeout(() => router.push("/admin/broadcasts/history"), 1200);
    } catch {
      setSendError("Failed to send broadcast");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">New Broadcast</h1>
      </div>

      {/* Step 1 — Trigger */}
      <Section title="1. What are you sending?">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {LIVE_TRIGGERS.map((t) => (
            <button
              key={t.value}
              onClick={() => { setTrigger(t.value); setPreviewHtml(""); setTestResult(""); setReminderStage(""); setCustomMessage(""); setDigestMode("auto"); setSelectedEventIds([]); }}
              style={{
                textAlign: "left", padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                minWidth: 220, background: trigger === t.value ? "rgba(208,194,144,0.12)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${trigger === t.value ? "rgba(208,194,144,0.4)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: trigger === t.value ? "#d0c290" : "#fff" }}>{t.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{t.description}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Step 2 — Params */}
      {trigger && (
        <Section title="2. Details">
          {trigger === "new_event_announcement" && (
            <div>
              <label className="admin-form-label">Event</label>
              <select
                className="admin-form-input"
                value={eventId}
                onChange={(e) => {
                  const id = e.target.value;
                  setEventId(id);
                  setPreviewHtml("");
                  setTestResult("");
                  const picked = events.find((ev) => ev.id === id);
                  setReminderStage(picked ? suggestReminderStage(parseNaiveLocalDate(picked.date)) ?? "" : "");
                }}
                style={{ maxWidth: 420 }}
              >
                <option value="">Select an event…</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title} — {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </option>
                ))}
              </select>

              {eventId && (
                <div style={{ marginTop: 16 }}>
                  <label className="admin-form-label">Reminder Stage</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {REMINDER_STAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value || "normal"}
                        type="button"
                        onClick={() => { setReminderStage(opt.value); setPreviewHtml(""); setTestResult(""); }}
                        style={{
                          padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                          background: reminderStage === opt.value ? "rgba(208,194,144,0.14)" : "rgba(255,255,255,0.03)",
                          border: `1px solid ${reminderStage === opt.value ? "rgba(208,194,144,0.4)" : "rgba(255,255,255,0.08)"}`,
                          color: reminderStage === opt.value ? "#d0c290" : "rgba(255,255,255,0.75)",
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                    Auto-suggested from the event date — override anytime before sending. &quot;Normal announcement&quot; keeps the existing Just Announced/On Sale Now banner.
                  </p>

                  <div style={{ marginTop: 20 }}>
                    <label className="admin-form-label">Custom Message (optional)</label>
                    <textarea
                      className="admin-form-input"
                      rows={3}
                      value={customMessage}
                      onChange={(e) => { setCustomMessage(e.target.value); setPreviewHtml(""); setTestResult(""); }}
                      placeholder="Leave blank to use the automatic on-sale/reminder message"
                      style={{ maxWidth: 480, resize: "vertical" }}
                    />
                    <p style={{ margin: "8px 0 0", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      Plain text only — replaces the paragraph above the ticket button for this send. Leave blank to use the automatic on-sale/reminder message above.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
          {trigger === "upcoming_events_digest" && (
            <div>
              <label className="admin-form-label">Which events?</label>
              <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                {([["auto", "Auto (next N events)"], ["choose", "Choose events"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setDigestMode(val); setPreviewHtml(""); setTestResult(""); }}
                    style={{
                      padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13,
                      background: digestMode === val ? "rgba(208,194,144,0.14)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${digestMode === val ? "rgba(208,194,144,0.4)" : "rgba(255,255,255,0.08)"}`,
                      color: digestMode === val ? "#d0c290" : "rgba(255,255,255,0.75)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {digestMode === "auto" ? (
                <div>
                  <label className="admin-form-label"># of events to include</label>
                  <input
                    type="number" min={1} max={10} className="admin-form-input"
                    value={limit} onChange={(e) => { setLimit(parseInt(e.target.value, 10) || 3); setPreviewHtml(""); setTestResult(""); }}
                    style={{ maxWidth: 120 }}
                  />
                </div>
              ) : (
                <div>
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                    {selectedEventIds.length} selected. Listed in the email sorted by date, regardless of check order.
                  </p>
                  <div style={{ maxHeight: 260, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "4px 12px" }}>
                    {events.map((e) => {
                      const checked = selectedEventIds.includes(e.id);
                      return (
                        <label key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 13, cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedEventIds((prev) => checked ? prev.filter((id) => id !== e.id) : [...prev, e.id]);
                              setPreviewHtml("");
                              setTestResult("");
                            }}
                          />
                          {e.title} — {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </label>
                      );
                    })}
                    {events.length === 0 && (
                      <p style={{ margin: "10px 0", fontSize: 12, color: "rgba(255,255,255,0.35)" }}>No upcoming events found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Step 3 — Preview */}
      {trigger && paramsReady && (
        <Section title="3. Preview">
          <button onClick={handlePreview} disabled={previewLoading} className="admin-header-btn admin-header-btn-outline" style={{ cursor: previewLoading ? "default" : "pointer", marginBottom: 14 }}>
            {previewLoading ? "Rendering…" : "Generate Preview"}
          </button>
          {previewError && <div className="admin-form-error">{previewError}</div>}
          {previewHtml && (
            <div>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8 }}>Subject: {previewSubject}</p>
              <iframe
                title="broadcast-preview"
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                style={{ width: 640, maxWidth: "100%", height: 700, border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, background: "#0b0d1a" }}
              />
            </div>
          )}
        </Section>
      )}

      {/* Step 4 — Test send */}
      {previewHtml && (
        <Section title="4. Send a test">
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="email" className="admin-form-input" placeholder="you@example.com"
              value={testTo} onChange={(e) => setTestTo(e.target.value)}
              style={{ maxWidth: 280 }}
            />
            <button onClick={handleTestSend} disabled={testSending || !testTo} className="admin-header-btn admin-header-btn-outline" style={{ cursor: testSending ? "default" : "pointer" }}>
              {testSending ? "Sending…" : "Send Test"}
            </button>
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
            Test sends are not recorded in send history.
          </p>
          {testResult && <div className="admin-form-success" style={{ marginTop: 10 }}>{testResult}</div>}
          {testError && <div className="admin-form-error" style={{ marginTop: 10 }}>{testError}</div>}
        </Section>
      )}

      {/* Step 5 — Broadcast */}
      {previewHtml && (
        <Section title="5. Send to everyone">
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "rgba(255,255,255,0.55)" }}>
            This will send to all {subscriberCount ?? "…"} newsletter subscribers and cannot be undone.
          </p>
          <button onClick={handleBroadcastSend} disabled={sending} className="admin-header-btn" style={{ cursor: sending ? "default" : "pointer" }}>
            {sending ? "Sending…" : "Send Broadcast"}
          </button>
          {sendError && <div className="admin-form-error" style={{ marginTop: 10 }}>{sendError}</div>}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
