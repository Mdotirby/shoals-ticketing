"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";

type Segment = { id: string; name: string; last_count: number | null };
type EventOption = { id: string; title: string; date: string };
type TemplateSummary = {
  key: string; name: string; category: string; description: string; subject: string;
  suggested_trigger: string | null;
};
type TemplateFull = TemplateSummary & {
  preview_text: string; content_html: string; content_text: string;
};

// ───────── Default sections composer state ─────────
type Composer = {
  hero_image: string;
  headline: string;
  subheading: string;
  body: string;
  cta_label: string;
  cta_url: string;
};

const BLANK_COMPOSER: Composer = {
  hero_image: "",
  headline: "Just announced — {{event_name}}",
  subheading: "{{event_date}} · {{venue_name}}",
  body: "Hi {{first_name}}, we're excited to share this one with you. Tickets are on sale now.",
  cta_label: "Get tickets",
  cta_url: "https://venuecore.live/events/{{event_id}}",
};

function buildHtml(c: Composer): string {
  const hero = c.hero_image
    ? `<tr><td><img src="${escAttr(c.hero_image)}" alt="" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`
    : c.headline.includes("{{event_image}}") ? "" : // fallback: no hero block
        "";
  const bodyParas = c.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;color:#333;font-size:15px;line-height:1.6">${escText(p.trim())}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f7f6f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1b1b1b;line-height:1.55">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f6f2;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
${hero}
<tr><td style="padding:28px 28px 0;color:#111;font-size:22px;font-weight:700;line-height:1.25">${escText(c.headline)}</td></tr>
${c.subheading ? `<tr><td style="padding:4px 28px 0;color:#666;font-size:13px">${escText(c.subheading)}</td></tr>` : ""}
<tr><td style="padding:24px 28px 4px;color:#1b1b1b;font-size:15px">
${bodyParas}
</td></tr>
<tr><td align="center" style="padding:8px 24px 32px">
  <a href="${escAttr(c.cta_url)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.2px">${escText(c.cta_label)}</a>
</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// ───────────────────────────────────────────────────────────────────────
export default function NewCampaignPage() {
  const router = useRouter();
  const venueId = getCookie("venue-id") || "";

  const [mode, setMode] = useState<"sections" | "html">("sections");
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [showGallery, setShowGallery] = useState(true);

  const [form, setForm] = useState({
    name: "",
    subject: "Just announced: {{event_name}}",
    preview_text: "",
    from_name: "",
    from_email: "",
    reply_to: "",
    segment_id: "",
    event_id: "",
    scheduled_at: "",
  });
  const [composer, setComposer] = useState<Composer>(BLANK_COMPOSER);
  const [html, setHtml] = useState<string>("");
  const [text, setText] = useState<string>("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = venueId ? `?venue_id=${venueId}` : "";
    Promise.all([
      fetch(`/api/email-engine/segments${q}`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/events?all=1`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/email-engine/templates`).then((r) => r.ok ? r.json() : []),
    ]).then(([s, e, t]) => {
      if (Array.isArray(s)) setSegments(s);
      if (Array.isArray(e)) setEvents(e.map((ev: EventOption) => ({ id: ev.id, title: ev.title, date: ev.date })));
      if (Array.isArray(t)) setTemplates(t);
    });
  }, [venueId]);

  // Derive the "source of truth" HTML based on mode
  const effectiveHtml = useMemo(
    () => mode === "sections" ? buildHtml(composer) : html,
    [mode, composer, html],
  );

  // Server-side render preview — calls /api/email-engine/render-preview which
  // runs the exact same loadEventContext() + renderEmail() pipeline used at
  // send time, so what you see here = what the recipient gets. Debounced
  // so we don't hammer the endpoint on every keystroke.
  const [renderedPreview, setRenderedPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (!form.subject || !effectiveHtml) { setRenderedPreview(null); return; }
    const t = setTimeout(() => {
      setPreviewLoading(true);
      fetch("/api/email-engine/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: form.subject,
          content_html: effectiveHtml,
          content_text: text || null,
          event_id: form.event_id || null,
          first_name: "Alex",
          email: "preview@venuecore.live",
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((p) => { if (p?.html) setRenderedPreview({ subject: p.subject, html: p.html }); })
        .finally(() => setPreviewLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [form.subject, form.event_id, effectiveHtml, text]);

  const applyTemplate = async (key: string) => {
    const res = await fetch(`/api/email-engine/templates?key=${key}`);
    if (!res.ok) return;
    const t: TemplateFull = await res.json();
    setForm((f) => ({
      ...f,
      name: f.name || t.name,
      subject: t.subject,
      preview_text: t.preview_text,
    }));
    setHtml(t.content_html);
    setText(t.content_text);
    setMode("html"); // templates ship as hand-tuned HTML → open in HTML mode for editing
    setShowGallery(false);
  };

  const handleCreate = async (action: "draft" | "send_now") => {
    if (!form.name || !form.subject || !effectiveHtml) {
      alert("Name, subject, and content are required");
      return;
    }
    if (action === "send_now" && !form.segment_id) {
      alert("Pick a segment before sending.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/email-engine/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          venue_id: venueId || null,
          scheduled_at: form.scheduled_at || null,
          content_html: effectiveHtml,
          content_text: text || null,
          body_json: mode === "sections" ? composer : null,
        }),
      });
      const campaign = await res.json();
      if (!res.ok) { alert(campaign.error || "Save failed"); return; }
      if (action === "send_now") {
        const s = await fetch(`/api/email-engine/campaigns/${campaign.id}/send`, { method: "POST" });
        const j = await s.json();
        if (!s.ok) alert(j.error || "Send failed");
      }
      router.push(`/admin/email/campaigns/${campaign.id}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="admin-form-page" style={{ maxWidth: 1200 }}>
      <Link href="/admin/email/campaigns" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Campaigns</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>New Campaign</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
        Start from a template or build from scratch. Variables supported:{" "}
        <code style={{ color: "#d0c290" }}>{"{{first_name}}"}</code>,{" "}
        <code style={{ color: "#d0c290" }}>{"{{event_name}}"}</code>,{" "}
        <code style={{ color: "#d0c290" }}>{"{{event_date}}"}</code>,{" "}
        <code style={{ color: "#d0c290" }}>{"{{venue_name}}"}</code>,{" "}
        <code style={{ color: "#d0c290" }}>{"{{event_image}}"}</code>.
      </p>

      {/* Template gallery */}
      <div style={{ marginBottom: 16 }}>
        <button
          onClick={() => setShowGallery((v) => !v)}
          style={{ padding: "6px 12px", fontSize: 12, background: "rgba(208,194,144,0.1)", color: "#d0c290", border: "1px solid rgba(208,194,144,0.25)", borderRadius: 6, cursor: "pointer" }}
        >
          {showGallery ? "Hide template gallery" : "Choose a template"}
        </button>
        {showGallery && (
          <div style={{
            display: "grid", gap: 10, marginTop: 10,
            gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
          }}>
            {templates.map((t) => (
              <button key={t.key} onClick={() => applyTemplate(t.key)}
                style={{
                  textAlign: "left", padding: "12px 14px", cursor: "pointer",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10, color: "#fff",
                }}>
                <div style={{ color: "#d0c290", fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, margin: "4px 0 6px" }}>{t.category.replace(/_/g, " ")}</div>
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, lineHeight: 1.45 }}>{t.description}</div>
              </button>
            ))}
            <button onClick={() => { setMode("sections"); setComposer(BLANK_COMPOSER); setHtml(""); setShowGallery(false); }}
              style={{
                textAlign: "left", padding: "12px 14px", cursor: "pointer",
                background: "rgba(208,194,144,0.08)",
                border: "1px dashed rgba(208,194,144,0.3)",
                borderRadius: 10, color: "#d0c290",
              }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Start from scratch (Sections)</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                Fill in hero + headline + body + CTA. No HTML required.
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Two-column: editor + live preview */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 20 }}>
        {/* ── Editor pane ───────────────────────────────────────── */}
        <div className="admin-form" style={{ minWidth: 0 }}>
          <div className="admin-form-grid">
            <label className="admin-form-label">Campaign name *
              <input className="admin-form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Spring Show Announce" />
            </label>
            <label className="admin-form-label">Subject *
              <input className="admin-form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            </label>
            <label className="admin-form-label">Preview text
              <input className="admin-form-input" value={form.preview_text} onChange={(e) => setForm({ ...form, preview_text: e.target.value })} />
            </label>
            <label className="admin-form-label">Segment *
              <select className="admin-form-input" value={form.segment_id} onChange={(e) => setForm({ ...form, segment_id: e.target.value })}>
                <option value="">— Select segment —</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name} {s.last_count !== null ? `(~${s.last_count})` : ""}</option>)}
              </select>
            </label>
            <label className="admin-form-label">Event
              <select className="admin-form-input" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
                <option value="">—</option>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.date).toLocaleDateString()})</option>)}
              </select>
            </label>
            <label className="admin-form-label">Schedule (optional)
              <input type="datetime-local" className="admin-form-input" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
            </label>
          </div>

          {/* Mode toggle */}
          <div style={{ display: "flex", gap: 6, marginTop: 18, marginBottom: 10 }}>
            <button onClick={() => setMode("sections")}
              style={{
                padding: "6px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                background: mode === "sections" ? "rgba(208,194,144,0.2)" : "rgba(255,255,255,0.04)",
                color: mode === "sections" ? "#d0c290" : "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.15)", fontWeight: 600,
              }}>Sections</button>
            <button onClick={() => setMode("html")}
              style={{
                padding: "6px 12px", fontSize: 12, borderRadius: 6, cursor: "pointer",
                background: mode === "html" ? "rgba(208,194,144,0.2)" : "rgba(255,255,255,0.04)",
                color: mode === "html" ? "#d0c290" : "rgba(255,255,255,0.6)",
                border: "1px solid rgba(255,255,255,0.15)", fontWeight: 600,
              }}>HTML</button>
          </div>

          {mode === "sections" ? (
            <>
              <label className="admin-form-label">Hero image URL (optional)
                <input className="admin-form-input" value={composer.hero_image} onChange={(e) => setComposer({ ...composer, hero_image: e.target.value })} placeholder="https://..." />
              </label>
              <label className="admin-form-label">Headline
                <input className="admin-form-input" value={composer.headline} onChange={(e) => setComposer({ ...composer, headline: e.target.value })} />
              </label>
              <label className="admin-form-label">Sub-heading
                <input className="admin-form-input" value={composer.subheading} onChange={(e) => setComposer({ ...composer, subheading: e.target.value })} />
              </label>
              <label className="admin-form-label">Body (blank lines = new paragraph)
                <textarea className="admin-form-input" style={{ minHeight: 160 }}
                  value={composer.body} onChange={(e) => setComposer({ ...composer, body: e.target.value })} />
              </label>
              <div className="admin-form-grid">
                <label className="admin-form-label">CTA label
                  <input className="admin-form-input" value={composer.cta_label} onChange={(e) => setComposer({ ...composer, cta_label: e.target.value })} />
                </label>
                <label className="admin-form-label">CTA URL
                  <input className="admin-form-input" value={composer.cta_url} onChange={(e) => setComposer({ ...composer, cta_url: e.target.value })} />
                </label>
              </div>
            </>
          ) : (
            <>
              <label className="admin-form-label">
                HTML body
                <textarea className="admin-form-input" style={{ minHeight: 340, fontFamily: "monospace", fontSize: 12 }}
                  value={html} onChange={(e) => setHtml(e.target.value)} />
              </label>
              <label className="admin-form-label">
                Plain-text fallback (auto-generated if blank)
                <textarea className="admin-form-input" style={{ minHeight: 80, fontFamily: "monospace", fontSize: 12 }}
                  value={text} onChange={(e) => setText(e.target.value)} />
              </label>
            </>
          )}

          <details style={{ marginTop: 14 }}>
            <summary style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer" }}>Sender details (optional)</summary>
            <div className="admin-form-grid" style={{ marginTop: 8 }}>
              <label className="admin-form-label">From email
                <input className="admin-form-input" value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} />
              </label>
              <label className="admin-form-label">From name
                <input className="admin-form-input" value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} />
              </label>
              <label className="admin-form-label">Reply-to
                <input className="admin-form-input" value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} />
              </label>
            </div>
          </details>

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            <button onClick={() => handleCreate("draft")} disabled={saving} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13 }}>
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button onClick={() => handleCreate("send_now")} disabled={saving}
              style={{ padding: "10px 20px", fontSize: 13, background: "rgba(208,194,144,0.9)", color: "#111", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
              {saving ? "Saving…" : "Save & send now"}
            </button>
          </div>
        </div>

        {/* ── Live preview pane ────────────────────────────────── */}
        <div style={{ minWidth: 0 }}>
          <div style={{
            position: "sticky", top: 16,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, overflow: "hidden",
          }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, display: "flex", gap: 8, alignItems: "center" }}>
                Live preview
                {previewLoading && <span style={{ color: "rgba(208,194,144,0.6)", textTransform: "none", letterSpacing: 0 }}>rendering…</span>}
              </div>
              <div style={{ color: "#fff", fontSize: 14, marginTop: 4, fontWeight: 600 }}>
                {renderedPreview?.subject || form.subject || "(no subject)"}
              </div>
              {form.preview_text && (
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>
                  {form.preview_text}
                </div>
              )}
            </div>
            <iframe
              title="preview"
              srcDoc={renderedPreview?.html ?? "<body style='background:#111827;color:#9aa2b4;font-family:sans-serif;padding:24px'>Fill in a subject and HTML to see a live preview…</body>"}
              sandbox="allow-same-origin"
              style={{ width: "100%", height: 720, border: 0, background: "#111827", display: "block" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
