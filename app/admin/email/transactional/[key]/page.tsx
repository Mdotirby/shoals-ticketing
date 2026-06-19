"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { v4 as uuid } from "uuid";
import { arrayMove } from "@dnd-kit/sortable";
import type { Block, BlockType, EmailDocument } from "@/emails/email-document";
import { getBlockMeta } from "@/emails/registry";
import {
  TRANSACTIONAL_TEMPLATE_META,
  DEFAULT_DOCUMENTS,
  SAMPLE_DATA,
  type TransactionalTemplateKey,
} from "@/lib/email/transactional-templates";
import { BuilderCanvas } from "../../campaigns/new/components/BuilderCanvas";
import { BlockPalette } from "../../campaigns/new/components/BlockPalette";
import { PropEditor } from "../../campaigns/new/components/PropEditor";

export default function TransactionalEditorPage(props: { params: Promise<{ key: string }> }) {
  const { key } = use(props.params);
  const templateKey = key as TransactionalTemplateKey;
  const meta = TRANSACTIONAL_TEMPLATE_META[templateKey];

  const [doc, setDoc] = useState<EmailDocument | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewWidth, setPreviewWidth] = useState<560 | 375>(560);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved template or fall back to default
  useEffect(() => {
    fetch(`/api/email/transactional/${templateKey}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setDoc((data?.body_json as EmailDocument) ?? DEFAULT_DOCUMENTS[templateKey]);
        if (data?.updated_at) setSavedAt(data.updated_at);
      });
  }, [templateKey]);

  // Live preview with sample data substituted
  const refreshPreview = useCallback((document: EmailDocument) => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (document.blocks.length === 0) { setPreviewHtml(""); return; }
    const sample = SAMPLE_DATA[templateKey] ?? {};
    previewTimer.current = setTimeout(() => {
      setPreviewLoading(true);
      fetch("/api/email/render-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          document,
          subject: meta?.label ?? templateKey,
          // Pass sample values as fake event context — the render route substitutes {{vars}}
          sample_vars: sample,
        }),
      })
        .then((r) => r.ok ? r.json() : null)
        .then((j) => { if (j?.html) setPreviewHtml(applySampleVars(j.html, sample)); })
        .finally(() => setPreviewLoading(false));
    }, 400);
  }, [templateKey, meta]);

  useEffect(() => {
    if (doc) refreshPreview(doc);
  }, [doc, refreshPreview]);

  // Block operations
  function addBlock(type: BlockType) {
    const blockMeta = getBlockMeta(type);
    if (!blockMeta) return;
    const block = { id: uuid(), type, props: { ...blockMeta.defaultProps } } as Block;
    setDoc((d) => d ? { ...d, blocks: [...d.blocks, block] } : d);
    setSelectedBlockId(block.id);
  }

  function deleteBlock(id: string) {
    setDoc((d) => d ? { ...d, blocks: d.blocks.filter((b) => b.id !== id) } : d);
    if (selectedBlockId === id) setSelectedBlockId(null);
  }

  function reorderBlocks(oldIndex: number, newIndex: number) {
    setDoc((d) => d ? { ...d, blocks: arrayMove(d.blocks, oldIndex, newIndex) } : d);
  }

  function updateBlock(updated: Block) {
    setDoc((d) => d ? { ...d, blocks: d.blocks.map((b) => b.id === updated.id ? updated : b) } : d);
  }

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/email/transactional/${templateKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: meta?.label ?? templateKey, body_json: doc }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || "Save failed"); return; }
      setSavedAt(j.updated_at);
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!confirm("Reset to the built-in default layout? Your customizations will be lost.")) return;
    setDoc(DEFAULT_DOCUMENTS[templateKey]);
    setSelectedBlockId(null);
  }

  if (!doc) {
    return <div style={{ padding: 32, color: "rgba(255,255,255,0.4)" }}>Loading…</div>;
  }

  if (!meta) {
    return <div style={{ padding: 32, color: "rgba(255,255,255,0.4)" }}>Unknown template key: {key}</div>;
  }

  const selectedBlock = doc.blocks.find((b) => b.id === selectedBlockId) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* Top bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: "10px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(0,0,0,0.3)", flexShrink: 0,
      }}>
        <Link href="/admin/email/transactional" style={{ color: "rgba(208,194,144,0.6)", textDecoration: "none", fontSize: 12 }}>
          ← Transactional Emails
        </Link>
        <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
        <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>{meta.label}</span>
        {savedAt && (
          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>
            Saved {new Date(savedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={handleReset}
            style={{ padding: "7px 14px", fontSize: 11, background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer" }}
          >
            Reset to default
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: "7px 18px", fontSize: 12, background: "#d0c290", color: "#111827", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 700 }}
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </div>

      {/* 3-column builder */}
      <div style={{ display: "grid", gridTemplateColumns: "220px minmax(0,1fr) 260px", flex: 1, overflow: "hidden" }}>

        {/* Left: palette + variable reference */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.07)", overflow: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 20 }}>
          <BlockPalette onAdd={addBlock} />

          {/* Available variables */}
          <div>
            <p style={{ margin: "0 0 8px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
              Available variables
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {meta.variables.map((v) => (
                <code key={v} style={{
                  fontSize: 11, padding: "3px 7px", borderRadius: 4, display: "block",
                  background: "rgba(208,194,144,0.07)", color: "rgba(208,194,144,0.75)",
                  fontFamily: "monospace", cursor: "default",
                }}>
                  {v}
                </code>
              ))}
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 10, color: "rgba(255,255,255,0.2)", lineHeight: 1.5 }}>
              Preview shows sample data. Real values are substituted at send time.
            </p>
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
                onChange={(e) => setDoc((d) => d ? { ...d, bg_color: e.target.value } : d)}
                style={{ width: 32, height: 32, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", background: "none", padding: 2 }}
              />
              <input
                type="text"
                value={doc.bg_color}
                onChange={(e) => setDoc((d) => d ? { ...d, bg_color: e.target.value } : d)}
                style={{ ...inputSt, fontFamily: "monospace", fontSize: 11, flex: 1 }}
              />
            </div>
          </div>
        </div>

        {/* Center: canvas + preview */}
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>
            Canvas · {doc.blocks.length} block{doc.blocks.length !== 1 ? "s" : ""}
          </div>
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

            {/* Preview */}
            <div style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Preview</span>
                {previewLoading && <span style={{ fontSize: 11, color: "rgba(208,194,144,0.5)" }}>rendering…</span>}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginLeft: 4 }}>sample data</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  {([560, 375] as const).map((w) => (
                    <button key={w} onClick={() => setPreviewWidth(w)} style={{
                      padding: "3px 8px", fontSize: 10, borderRadius: 4, cursor: "pointer",
                      background: previewWidth === w ? "rgba(208,194,144,0.15)" : "rgba(255,255,255,0.04)",
                      color: previewWidth === w ? "#d0c290" : "rgba(255,255,255,0.35)",
                      border: `1px solid ${previewWidth === w ? "rgba(208,194,144,0.3)" : "rgba(255,255,255,0.08)"}`,
                    }}>
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

        {/* Right: prop editor */}
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.07)", overflow: "auto", padding: "16px 14px" }}>
          <PropEditor block={selectedBlock} onChange={updateBlock} />
        </div>
      </div>
    </div>
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

function applySampleVars(html: string, vars: Record<string, string>): string {
  let out = html;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}
