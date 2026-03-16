"use client";

import { useDraggable } from "@dnd-kit/core";
import { LAYOUT_TOOLS, LayoutObjectType, PRICE_TIER_COLORS } from "@/lib/types/layout";

type Props = {
  onAddObject: (type: LayoutObjectType) => void;
};

function DraggableTool({ type, label, icon, description, onAddObject }: {
  type: LayoutObjectType;
  label: string;
  icon: string;
  description: string;
  onAddObject: (type: LayoutObjectType) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tool-${type}`,
    data: { type, source: "toolbar" },
  });

  const color = type === "stage" ? "#71717a" : PRICE_TIER_COLORS["standard"] || "#6366f1";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onAddObject(type)}
      style={{
        padding: "10px 12px",
        background: isDragging ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        cursor: "grab",
        display: "flex",
        alignItems: "center",
        gap: 10,
        opacity: isDragging ? 0.5 : 1,
        transition: "background 0.15s",
        userSelect: "none",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: type === "table" ? "50%" : 6,
          background: `${color}22`,
          border: `2px solid ${color}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: type === "row" ? 11 : 14,
          color,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#e5e7eb" }}>{label}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{description}</div>
      </div>
    </div>
  );
}

export default function SeatingToolbar({ onAddObject }: Props) {
  return (
    <div
      style={{
        width: 220,
        minWidth: 220,
        background: "rgba(255,255,255,0.02)",
        borderRight: "1px solid rgba(255,255,255,0.08)",
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        overflowY: "auto",
      }}
    >
      <h3
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "rgba(255,255,255,0.4)",
          textTransform: "uppercase",
          letterSpacing: 1,
          marginBottom: 4,
        }}
      >
        Seating Tools
      </h3>
      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>
        Drag or click to add objects
      </p>
      {LAYOUT_TOOLS.map((tool) => (
        <DraggableTool
          key={tool.type}
          type={tool.type}
          label={tool.label}
          icon={tool.icon}
          description={tool.description}
          onAddObject={onAddObject}
        />
      ))}
    </div>
  );
}
