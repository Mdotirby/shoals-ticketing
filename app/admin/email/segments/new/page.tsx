"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";

// Keep in sync with modules/email-engine/constants.ts SEGMENT_FIELDS
const FIELDS = [
  { key: "total_events_attended", label: "Events attended (count)",  type: "number" },
  { key: "total_orders",          label: "Total orders (count)",      type: "number" },
  { key: "total_spent",           label: "Lifetime spent ($)",        type: "number" },
  { key: "last_event_date",       label: "Last event attended (date)", type: "date" },
  { key: "last_order_at",         label: "Last order at (date)",      type: "date" },
  { key: "first_order_at",        label: "First order at (date)",     type: "date" },
  { key: "favorite_event_type",   label: "Favorite event type",       type: "string" },
  { key: "emails_received",       label: "Emails received",           type: "number" },
  { key: "emails_opened",         label: "Emails opened",             type: "number" },
  { key: "emails_clicked",        label: "Emails clicked",            type: "number" },
  { key: "open_rate",             label: "Email open rate (0-1)",     type: "number" },
  { key: "click_rate",            label: "Email click rate (0-1)",    type: "number" },
  { key: "last_email_opened_at",  label: "Last email opened (date)",  type: "date" },
  { key: "last_email_clicked_at", label: "Last email clicked (date)", type: "date" },
  { key: "lfv_segment",           label: "LFV segment",               type: "string" },
  { key: "is_fwb_subscriber",     label: "Is FWB subscriber",         type: "boolean" },
  { key: "has_cart_abandonment",  label: "Has pending cart",          type: "boolean" },
  { key: "zip_code",              label: "Zip code",                   type: "string" },
  { key: "primary_source",        label: "Signup source",              type: "string" },
  { key: "created_at",            label: "Signed up (date)",            type: "date" },
] as const;

const OPS_BY_TYPE: Record<string, { key: string; label: string; valueKind: "none" | "text" | "list" | "number" | "date" | "bool" }[]> = {
  number: [
    { key: "eq", label: "equals", valueKind: "number" },
    { key: "neq", label: "does not equal", valueKind: "number" },
    { key: "gt", label: "greater than", valueKind: "number" },
    { key: "gte", label: "≥", valueKind: "number" },
    { key: "lt", label: "less than", valueKind: "number" },
    { key: "lte", label: "≤", valueKind: "number" },
    { key: "is_null", label: "is empty", valueKind: "none" },
    { key: "is_not_null", label: "is set", valueKind: "none" },
  ],
  date: [
    { key: "within_last_days", label: "within the last N days", valueKind: "number" },
    { key: "older_than_days", label: "more than N days ago", valueKind: "number" },
    { key: "gte", label: "on or after", valueKind: "date" },
    { key: "lte", label: "on or before", valueKind: "date" },
    { key: "is_null", label: "never", valueKind: "none" },
    { key: "is_not_null", label: "any time", valueKind: "none" },
  ],
  string: [
    { key: "eq", label: "is", valueKind: "text" },
    { key: "neq", label: "is not", valueKind: "text" },
    { key: "contains", label: "contains", valueKind: "text" },
    { key: "not_contains", label: "does not contain", valueKind: "text" },
    { key: "in", label: "is any of (comma-separated)", valueKind: "list" },
    { key: "not_in", label: "is none of (comma-separated)", valueKind: "list" },
    { key: "is_null", label: "is empty", valueKind: "none" },
    { key: "is_not_null", label: "is set", valueKind: "none" },
  ],
  boolean: [
    { key: "eq", label: "is", valueKind: "bool" },
  ],
  uuid: [
    { key: "eq", label: "equals", valueKind: "text" },
    { key: "neq", label: "does not equal", valueKind: "text" },
    { key: "is_null", label: "is empty", valueKind: "none" },
    { key: "is_not_null", label: "is set", valueKind: "none" },
  ],
};

type Condition = { field: string; op: string; value: unknown };

function fieldType(key: string): string {
  return FIELDS.find((f) => f.key === key)?.type ?? "string";
}

// One-click preset segments. Each sets name, conditions, and match op.
const QUICK_PRESETS: {
  label: string;
  description: string;
  name: string;
  op: "AND" | "OR";
  conditions: Condition[];
}[] = [
  {
    label: "All Newsletter Subscribers",
    description: "Every contact in your list",
    name: "All Newsletter Subscribers",
    op: "AND",
    conditions: [], // empty → compiles to email.not.is.null → everyone
  },
  {
    label: "FWB Members",
    description: "Loyalty program subscribers only",
    name: "FWB Members",
    op: "AND",
    conditions: [{ field: "is_fwb_subscriber", op: "eq", value: true }],
  },
  {
    label: "Past Ticket Buyers",
    description: "Anyone who has placed at least one order",
    name: "Past Ticket Buyers",
    op: "AND",
    conditions: [{ field: "total_orders", op: "gt", value: 0 }],
  },
  {
    label: "VIPs ($500+ spent)",
    description: "High-value customers",
    name: "VIPs — $500+ Lifetime",
    op: "AND",
    conditions: [{ field: "total_spent", op: "gte", value: 500 }],
  },
  {
    label: "Lapsed (60+ days)",
    description: "Bought tickets but haven't been back in 60+ days",
    name: "Lapsed Buyers — 60 Days",
    op: "AND",
    conditions: [
      { field: "total_orders", op: "gt", value: 0 },
      { field: "last_order_at", op: "older_than_days", value: 60 },
    ],
  },
  {
    label: "Never Purchased",
    description: "On the list but never bought a ticket",
    name: "Never Purchased",
    op: "AND",
    conditions: [{ field: "total_orders", op: "eq", value: 0 }],
  },
];

export default function NewSegmentPage() {
  const router = useRouter();
  const venueId = getCookie("venue-id") || "";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [matchOp, setMatchOp] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<Condition[]>([
    { field: "total_events_attended", op: "gt", value: 0 },
  ]);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{ count: number; sample: { email: string; first_name: string | null }[] } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const rules = useMemo(() => ({ op: matchOp, conditions }), [matchOp, conditions]);

  const updateCond = (i: number, patch: Partial<Condition>) =>
    setConditions((cs) => cs.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const removeCond = (i: number) =>
    setConditions((cs) => cs.filter((_, idx) => idx !== i));
  const addCond = () =>
    setConditions((cs) => [...cs, { field: "total_orders", op: "gt", value: 0 }]);

  const handlePreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      const normalized = normalizeRules(rules);
      const r = await fetch("/api/email-engine/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: normalized }),
      });
      const j = await r.json();
      if (!r.ok) { setPreviewError(j.error || "preview failed"); return; }
      setPreview(j);
    } finally { setPreviewing(false); }
  };

  const handleSave = async () => {
    if (!name.trim()) { alert("Name is required"); return; }
    setSaving(true);
    try {
      const normalized = normalizeRules(rules);
      const r = await fetch("/api/email-engine/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venueId || null, name, description, rules: normalized }),
      });
      const j = await r.json();
      if (!r.ok) { alert(j.error || "Save failed"); return; }
      router.push("/admin/email/segments");
    } finally { setSaving(false); }
  };

  return (
    <div className="admin-form-page">
      <Link href="/admin/email/segments" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>← Segments</Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>New Segment</h1>

      <div className="admin-form">
        {/* ── Quick-start presets ── */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 8 }}>
            Start from a preset, then customize:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {QUICK_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                title={p.description}
                onClick={() => {
                  setName(p.name);
                  setMatchOp(p.op);
                  setConditions(p.conditions);
                  setPreview(null);
                }}
                style={{
                  padding: "6px 12px", fontSize: 12, cursor: "pointer", borderRadius: 6,
                  background: "rgba(208,194,144,0.08)", color: "#d0c290",
                  border: "1px solid rgba(208,194,144,0.25)", fontWeight: 500,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-form-grid">
          <label className="admin-form-label">Name *
            <input className="admin-form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VIPs · $500+ in last 12 months" />
          </label>
          <label className="admin-form-label">Description
            <input className="admin-form-input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>

        <div style={{ marginTop: 16, padding: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10 }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 10 }}>
            Match{" "}
            <select value={matchOp} onChange={(e) => setMatchOp(e.target.value as "AND" | "OR")}
              style={{ background: "rgba(255,255,255,0.06)", color: "#d0c290", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, padding: "2px 6px" }}>
              <option value="AND">ALL</option>
              <option value="OR">ANY</option>
            </select>{" "}of the following conditions:
          </div>

          {conditions.map((c, i) => {
            const type = fieldType(c.field);
            const ops = OPS_BY_TYPE[type] ?? OPS_BY_TYPE.string;
            const op = ops.find((o) => o.key === c.op) ?? ops[0];
            return (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center", flexWrap: "wrap" }}>
                <select value={c.field}
                  onChange={(e) => { const nf = e.target.value; const nt = fieldType(nf); updateCond(i, { field: nf, op: (OPS_BY_TYPE[nt] ?? OPS_BY_TYPE.string)[0].key, value: "" }); }}
                  className="admin-form-input" style={{ flex: "1 1 220px" }}>
                  {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>

                <select value={c.op} onChange={(e) => updateCond(i, { op: e.target.value, value: "" })}
                  className="admin-form-input" style={{ flex: "0 1 220px" }}>
                  {ops.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>

                {op.valueKind !== "none" && (
                  <ValueInput kind={op.valueKind} value={c.value} onChange={(v) => updateCond(i, { value: v })} />
                )}

                <button onClick={() => removeCond(i)}
                  style={{ padding: "6px 10px", fontSize: 12, background: "transparent", color: "rgba(255,100,100,0.6)", border: "1px solid rgba(255,100,100,0.2)", borderRadius: 6, cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            );
          })}

          <button onClick={addCond}
            style={{ padding: "6px 12px", fontSize: 12, background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", marginTop: 4 }}>
            + Add condition
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={handlePreview} disabled={previewing}
            style={{ padding: "10px 18px", fontSize: 13, background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer" }}>
            {previewing ? "Counting…" : "Preview count"}
          </button>
          <button onClick={handleSave} disabled={saving} className="admin-form-submit" style={{ padding: "10px 20px", fontSize: 13 }}>
            {saving ? "Saving…" : "Save segment"}
          </button>
          {preview && (
            <div style={{ color: "#d0c290", fontSize: 13 }}>
              <strong>{preview.count}</strong> contacts match
            </div>
          )}
          {previewError && <div style={{ color: "rgba(255,120,120,0.9)", fontSize: 12 }}>{previewError}</div>}
        </div>

        {preview && preview.sample.length > 0 && (
          <div style={{ marginTop: 14, padding: 12, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 6 }}>Sample (first 20):</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "monospace" }}>
              {preview.sample.map((s) => <div key={s.email}>{s.email} — {s.first_name ?? ""}</div>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ValueInput({ kind, value, onChange }: { kind: string; value: unknown; onChange: (v: unknown) => void }) {
  if (kind === "bool") {
    return (
      <select className="admin-form-input" style={{ flex: "0 1 140px" }}
        value={String(value)} onChange={(e) => onChange(e.target.value === "true")}>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  if (kind === "date") {
    return <input type="date" className="admin-form-input" style={{ flex: "0 1 180px" }} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <input
      className="admin-form-input"
      style={{ flex: "0 1 220px" }}
      placeholder={kind === "list" ? "a, b, c" : ""}
      type={kind === "number" ? "number" : "text"}
      value={String(value ?? "")}
      onChange={(e) => onChange(kind === "number" ? Number(e.target.value) : e.target.value)}
    />
  );
}

function normalizeRules(rules: { op: "AND" | "OR"; conditions: Condition[] }) {
  return {
    op: rules.op,
    conditions: rules.conditions
      .filter((c) => c.field && c.op)
      .map((c) => {
        const type = fieldType(c.field);
        const ops = OPS_BY_TYPE[type] ?? OPS_BY_TYPE.string;
        const meta = ops.find((o) => o.key === c.op);
        if (meta?.valueKind === "none") return { field: c.field, op: c.op };
        if (meta?.valueKind === "list") {
          return {
            field: c.field, op: c.op,
            value: String(c.value ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          };
        }
        return { field: c.field, op: c.op, value: c.value };
      }),
  };
}
