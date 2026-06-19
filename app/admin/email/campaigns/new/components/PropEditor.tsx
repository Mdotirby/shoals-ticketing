"use client";

import type { Block } from "@/emails/email-document";
import { getBlockMeta } from "@/emails/registry";

type Props = {
  block: Block | null;
  onChange: (updated: Block) => void;
};

export function PropEditor({ block, onChange }: Props) {
  if (!block) {
    return (
      <div style={{ padding: "24px 0", color: "rgba(255,255,255,0.2)", fontSize: 13, textAlign: "center" }}>
        Select a block to edit its properties
      </div>
    );
  }

  const meta = getBlockMeta(block.type);
  if (!meta) return null;

  function updateProp(key: string, value: unknown) {
    onChange({ ...block!, props: { ...(block!.props as Record<string, unknown>), [key]: value } } as Block);
  }

  const props = block.props as Record<string, unknown>;

  return (
    <div>
      <p style={{ margin: "0 0 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
        {meta.icon} {meta.label}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {meta.fields.map((field) => {
          const value = props[field.key];

          if (field.type === "checkbox") {
            return (
              <label key={field.key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => updateProp(field.key, e.target.checked)}
                  style={{ accentColor: "#d0c290", width: 14, height: 14 }}
                />
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{field.label}</span>
              </label>
            );
          }

          if (field.type === "select") {
            return (
              <label key={field.key} style={labelStyle}>
                <span style={labelTextStyle}>{field.label}</span>
                <select
                  value={String(value ?? "")}
                  onChange={(e) => updateProp(field.key, e.target.value)}
                  style={inputStyle}
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            );
          }

          if (field.type === "textarea") {
            return (
              <label key={field.key} style={labelStyle}>
                <span style={labelTextStyle}>{field.label}</span>
                <textarea
                  value={String(value ?? "")}
                  onChange={(e) => updateProp(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={5}
                  style={{ ...inputStyle, resize: "vertical", minHeight: 80, fontFamily: "inherit" }}
                />
              </label>
            );
          }

          if (field.type === "color") {
            return (
              <label key={field.key} style={{ ...labelStyle, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <input
                  type="color"
                  value={cssColorToHex(String(value ?? "#ffffff"))}
                  onChange={(e) => updateProp(field.key, e.target.value)}
                  style={{ width: 32, height: 32, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, cursor: "pointer", background: "none", padding: 2 }}
                />
                <span style={labelTextStyle}>{field.label}</span>
                <input
                  type="text"
                  value={String(value ?? "")}
                  onChange={(e) => updateProp(field.key, e.target.value)}
                  style={{ ...inputStyle, flex: 1, fontFamily: "monospace", fontSize: 11 }}
                />
              </label>
            );
          }

          if (field.type === "number") {
            return (
              <label key={field.key} style={labelStyle}>
                <span style={labelTextStyle}>{field.label}</span>
                <input
                  type="number"
                  value={Number(value ?? 0)}
                  min={field.min}
                  max={field.max}
                  onChange={(e) => updateProp(field.key, Number(e.target.value))}
                  style={inputStyle}
                />
              </label>
            );
          }

          // text / url
          return (
            <label key={field.key} style={labelStyle}>
              <span style={labelTextStyle}>{field.label}</span>
              <input
                type={field.type === "url" ? "text" : "text"}
                value={String(value ?? "")}
                onChange={(e) => updateProp(field.key, e.target.value)}
                placeholder={field.placeholder}
                style={inputStyle}
              />
            </label>
          );
        })}
      </div>

      {/* Variable hint */}
      <div style={{ marginTop: 20, padding: "10px 12px", background: "rgba(208,194,144,0.05)", border: "1px solid rgba(208,194,144,0.12)", borderRadius: 8 }}>
        <p style={{ margin: "0 0 6px", color: "rgba(208,194,144,0.7)", fontSize: 10, textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Variables</p>
        <p style={{ margin: 0, color: "rgba(255,255,255,0.35)", fontSize: 10, lineHeight: 1.6 }}>
          {"{{"}<span style={{ color: "rgba(208,194,144,0.6)" }}>first_name</span>{"}}"}
          {" · "}
          {"{{"}<span style={{ color: "rgba(208,194,144,0.6)" }}>event_name</span>{"}}"}
          {" · "}
          {"{{"}<span style={{ color: "rgba(208,194,144,0.6)" }}>event_date</span>{"}}"}
          {" · "}
          {"{{"}<span style={{ color: "rgba(208,194,144,0.6)" }}>venue_name</span>{"}}"}
          {" · "}
          {"{{"}<span style={{ color: "rgba(208,194,144,0.6)" }}>event_url</span>{"}}"}
        </p>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

const labelTextStyle: React.CSSProperties = {
  color: "rgba(255,255,255,0.5)",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  color: "#fff",
  fontSize: 13,
  padding: "7px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

function cssColorToHex(value: string): string {
  if (value.startsWith("#")) return value;
  // Fallback for rgba/named colors — color input needs a hex
  return "#d0c290";
}
