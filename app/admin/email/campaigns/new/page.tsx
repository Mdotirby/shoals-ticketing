"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import { v4 as uuid } from "uuid";
import { arrayMove } from "@dnd-kit/sortable";
import type { Block, BlockType, EmailDocument } from "@/emails/email-document";
import { getBlockMeta } from "@/emails/registry";
import { BuilderCanvas } from "./components/BuilderCanvas";
import { BlockPalette } from "./components/BlockPalette";
import { PropEditor } from "./components/PropEditor";

// ── Types ──────────────────────────────────────────────────────────

type Segment = { id: string; name: string; last_count: number | null };
type EventOption = { id: string; title: string; date: string };

type CampaignForm = {
  name: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  reply_to: string;
  segment_id: string;
  event_id: string;
  scheduled_at: string;
};

const DEFAULT_FORM: CampaignForm = {
  name: "",
  subject: "",
  preview_text: "",
  from_name: "",
  from_email: "",
  reply_to: "",
  segment_id: "",
  event_id: "",
  scheduled_at: "",
};

const DEFAULT_DOCUMENT: EmailDocument = {
  version: "block-v1",
  bg_color: "#111827",
  blocks: [],
};

// ── Page ───────────────────────────────────────────────────────────

export default function NewCampaignPage() {
  const router = useRouter();
  const venueId = getCookie("venue-id") || "";

  const [segments, setSegments] = useState<Segment[]>([]);
  const [events, setEvents] = useState<EventOption[]>([]);
  const [form, setForm] = useState<CampaignForm>(DEFAULT_FORM);
  const [doc, setDoc] = useState<EmailDocument>(DEFAULT_DOCUMENT);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Preview
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<560 | 375>(560);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load segments + events ──────────────────────────────────────
  useEffect(() => {
    const q = venueId ? `?venue_id=${venueId}` : "";
    Promise.all([
      fetch(`/api/email-engine/segments${q}`).then((r) => r.ok ? r.json() : []),
      fetch(`/api/events?all=1`).then((r) => r.ok ? r.json() : []),
    ]).then(([s, e]) => {
      if (Array.isArray(s)) setSegments(s);
      if (Array.isArray(e)) setEvents(e.map((ev: EventOption) => ({ id: ev.id, title: ev.title, date: ev.date })));
    });
  }, [venueId]);

  // ── Live preview (debounced 400ms) ─────────────────────────────
  const refreshPreview = useCallback((document: EmailDocument, eventId: string, subject: string) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (document.blocks.length === 0) { setPreviewHtml(""); return; }
    previewTimer.current = setTimeout(() => {
      setPreviewLoading(true);
      fetch("/api/email/render-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document, event_id: eventId || null, subject: subject || "Preview" }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((j) => { if (j?.html) setPreviewHtml(j.html); })
        .finally(() => setPreviewLoading(false));
    }, 400);
  }, []);

  useEffect(() => {
    refreshPreview(doc, form.event_id, form.subject);
  }, [doc, form.event_id, form.subject, refreshPreview]);

  // ── Block operations ────────────────────────────────────────────
  function addBlock(type: BlockType) {
    const meta = getBlockMeta(type);
    if (!meta) return;
    const block = { id: uuid(), type, props: { ...meta.defaultProps } } as Block;
    setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedBlockId(block.id);
  }

  function deleteBlock(id: string) {
    setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function reorderBlocks(oldIndex: number, newIndex: number) {
    setDoc((d) => ({ ...d, blocks: arrayMove(d.blocks, oldIndex, newIndex) }));
  }

  function updateBlock(updated: Block) {
    setDoc((d) => ({ ...d, blocks: d.blocks.map((b) => b.id === updated.id ? updated : b) }));
  }

  const selectedBlock = doc.blocks.find((b) => b.id === selectedBlockId) ?? null;

  // ── Save ────────────────────────────────────────────────────────
  async function handleSave(action: "draft" | "send_now") {
    if (!form.name || !form.subject) {
      alert("Campaign name and subject are required.");
      return;
    }
    if (doc.blocks.length === 0) {
      alert("Add at least one block before saving.");
      return;
    }
    if (action === "send_now" && !form.segment_id) {
      alert("Pick a segment before sending.");
      return;
    }
    setSaving(true);
    try {
      // Render blocks → HTML server-side for dispatch
      const renderRes = await fetch("/api/email/render-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: doc, event_id: form.event_id || null, subject: form.subject }),
      });
      const renderData = await renderRes.json();
      const content_html: string = renderData.html ?? "";

      const res = await fetch("/api/email-engine/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          venue_id: venueId || null,
          scheduled_at: form.scheduled_at || null,
          content_html,
          content_text: null,
          body_json: doc,
        }),
      });
      const campaign = await res.json();
      if (!res.ok) { alert(campaign.error || "Save failed"); return; }

      if (action === "send_now") {
        const s = await fetch(`/api/email-engine/campaigns/${campaign.id}/send`, { method: "POST" });
        const j = await s.json();
        if (!s.ok) { alert(j.error || "Send failed"); return; }
      }
      router.push(`/admin/email/campaigns/${campaign.id}`);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "10px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(0,0,0,0.3)", flexShrink: 0,
      }}>
        <Link href="/admin/email/campaigns" style={{ color: "rgba(208,194,144,0.6)", textDecoration: "none", fontSize: 12 }}>
          ← Campaigns
        </Link>
        <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Campaign name…"
          style={{ background: "none", border: "none", color: "#fff", fontSize: 14, fontWeight: 600, outline: "none", flex: 1, minWidth: 0 }}
        />
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => handleSave("draft")}
            disabled={saving}
            style={{ padding: "7px 16px", fontSize: 12, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}
          >
            {saving ? "Saving…" : "Save draft"}
          </button>
          <button
            onClick={() => handleSave("send_now")}
            disabled={saving}
            style={{ padding: "7px 16px", fontSize: 12, background: "#d0c290", color: "#111827", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}
          >
            Save & Send
          </button>
        </div>
      </div>

      {/* 3-column builder */}
      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr) 260px", flex: 1, overflow: "hidden" }}>

        {/* ── Left: palette + campaign settings ─────────────────── */}
        <div style={{
          borderRight: "1px solid rgba(255,255,255,0.07)",
          overflow: "auto",
          padding: "16px 14px",
          display: "flex", flexDirection: "column", gap: 20,
        }}>
          <BlockPalette onAdd={addBlock} />

          <div>
            <p style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
              Campaign
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Field label="Subject *">
                <input
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                  placeholder="Subject line…"
                  style={inputSt}
                />
              </Field>
              <Field label="Preview text">
                <input
                  value={form.preview_text}
                  onChange={(e) => setForm({ ...form, preview_text: e.target.value })}
                  placeholder="Inbox preview…"
                  style={inputSt}
                />
              </Field>
              <Field label="Segment *">
                <select value={form.segment_id} onChange={(e) => setForm({ ...form, segment_id: e.target.value })} style={inputSt}>
                  <option value="">— Pick segment —</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.last_count ? ` (~${s.last_count})` : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Event">
                <select value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })} style={inputSt}>
                  <option value="">—</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.date).toLocaleDateString()})</option>
                  ))}
                </select>
              </Field>
              <Field label="Schedule">
                <input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} style={inputSt} />
              </Field>
              <details style={{ marginTop: 2 }}>
                <summary style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>Sender overrides</summary>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  <Field label="From email">
                    <input value={form.from_email} onChange={(e) => setForm({ ...form, from_email: e.target.value })} style={inputSt} />
                  </Field>
                  <Field label="From name">
                    <input value={form.from_name} onChange={(e) => setForm({ ...form, from_name: e.target.value })} style={inputSt} />
                  </Field>
                  <Field label="Reply-to">
                    <input value={form.reply_to} onChange={(e) => setForm({ ...form, reply_to: e.target.value })} style={inputSt} />
                  </Field>
                </div>
              </details>
            </div>
          </div>

          {/* Background color */}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
              Email background
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={doc.bg_color}
                onChange={(e) => setDoc((d) => ({ ...d, bg_color: e.target.value }))}
                style={{ width: 32, height: 32, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", background: "none", padding: 2 }}
              />
              <input
                type="text"
                value={doc.bg_color}
                onChange={(e) => setDoc((d) => ({ ...d, bg_color: e.target.value }))}
                style={{ ...inputSt, fontFamily: "monospace", fontSize: 11, flex: 1 }}
              />
            </div>
          </div>
        </div>

        {/* ── Center: canvas ─────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
          {/* Canvas tab header */}
          <div style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            display: "flex", alignItems: "center", gap: 12,
            fontSize: 11, color: "rgba(255,255,255,0.35)",
          }}>
            <span style={{ textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
              Canvas · {doc.blocks.length} block{doc.blocks.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Canvas + preview split */}
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", overflow: "hidden" }}>
            {/* Block list */}
            <div style={{ overflow: "auto", padding: "14px 12px", borderRight: "1px solid rgba(255,255,255,0.07)" }}>
              <BuilderCanvas
                blocks={doc.blocks}
                selectedId={selectedBlockId}
                onSelect={setSelectedBlockId}
                onDelete={deleteBlock}
                onReorder={reorderBlocks}
              />
            </div>

            {/* Live preview */}
            <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{
                padding: "8px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
                display: "flex", alignItems: "center", gap: 10,
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Preview</span>
                {previewLoading && <span style={{ fontSize: 11, color: "rgba(208,194,144,0.5)" }}>rendering…</span>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  {([560, 375] as const).map((w) => (
                    <button
                      key={w}
                      onClick={() => setPreviewWidth(w)}
                      style={{
                        padding: "3px 8px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                        background: previewWidth === w ? "rgba(208,194,144,0.15)" : "rgba(255,255,255,0.04)",
                        color: previewWidth === w ? "#d0c290" : "rgba(255,255,255,0.35)",
                        border: `1px solid ${previewWidth === w ? "rgba(208,194,144,0.3)" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      {w === 560 ? "Desktop" : "Mobile"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, overflow: "auto", background: "#0b0d1a", padding: "16px 0", display: "flex", justifyContent: "center" }}>
                {previewHtml ? (
                  <iframe
                    title="email-preview"
                    srcDoc={previewHtml}
                    sandbox="allow-same-origin"
                    style={{ width: previewWidth, border: 0, background: "#111827", borderRadius: 12, flexShrink: 0, height: "100%" }}
                  />
                ) : (
                  <div style={{ color: "rgba(255,255,255,0.15)", fontSize: 13, alignSelf: "center" }}>
                    Add blocks to see a preview
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: prop editor ─────────────────────────────────── */}
        <div style={{
          borderLeft: "1px solid rgba(255,255,255,0.07)",
          overflow: "auto",
          padding: "16px 14px",
        }}>
          <PropEditor block={selectedBlock} onChange={updateBlock} />
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ───────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
  );
}

const inputSt: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  color: "#fff",
  fontSize: 12,
  padding: "6px 9px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};
