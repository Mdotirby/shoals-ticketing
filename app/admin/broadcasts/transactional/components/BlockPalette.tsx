"use client";

import { BLOCK_REGISTRY } from "@/emails/registry";
import type { BlockType } from "@/emails/email-document";

type Props = {
  onAdd: (type: BlockType) => void;
};

export function BlockPalette({ onAdd }: Props) {
  return (
    <div>
      <p style={{ margin: "0 0 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
        Blocks
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {BLOCK_REGISTRY.map((meta) => (
          <button
            key={meta.type}
            onClick={() => onAdd(meta.type)}
            title={meta.description}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 7,
              cursor: "pointer",
              textAlign: "left",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>{meta.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 600 }}>{meta.label}</div>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {meta.description}
              </div>
            </div>
            <span style={{ marginLeft: "auto", color: "rgba(255, 255, 255, 0.5)", fontSize: 16, flexShrink: 0 }}>+</span>
          </button>
        ))}
      </div>
    </div>
  );
}
