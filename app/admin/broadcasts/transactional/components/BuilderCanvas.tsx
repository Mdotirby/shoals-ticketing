"use client";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Block } from "@/emails/email-document";
import { getBlockMeta } from "@/emails/registry";

type Props = {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
};

function SortableBlock({ block, selected, onSelect, onDelete }: {
  block: Block;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const meta = getBlockMeta(block.type);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const summary = blockSummary(block);

  return (
    <div ref={setNodeRef} style={style}>
      <div
        onClick={onSelect}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 8,
          border: selected
            ? "1px solid rgba(255, 255, 255, 0.6)"
            : "1px solid rgba(255,255,255,0.08)",
          background: selected ? "rgba(255, 255, 255, 0.07)" : "rgba(255,255,255,0.02)",
          cursor: "pointer",
          userSelect: "none",
          marginBottom: 6,
        }}
      >
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          style={{ cursor: "grab", color: "rgba(255,255,255,0.25)", fontSize: 14, padding: "0 2px", flexShrink: 0 }}
          title="Drag to reorder"
        >
          ⋮⋮
        </div>

        {/* Icon + labels */}
        <div style={{ fontSize: 18, flexShrink: 0 }}>{meta?.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: selected ? "#ffffff" : "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600 }}>
            {meta?.label}
          </div>
          {summary && (
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {summary}
            </div>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.2)", fontSize: 16, cursor: "pointer", padding: "0 2px", flexShrink: 0, lineHeight: 1 }}
          title="Remove block"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function BuilderCanvas({ blocks, selectedId, onSelect, onDelete, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
  }

  if (blocks.length === 0) {
    return (
      <div style={{
        padding: "40px 16px",
        textAlign: "center",
        color: "rgba(255,255,255,0.2)",
        fontSize: 13,
        border: "1px dashed rgba(255,255,255,0.1)",
        borderRadius: 10,
      }}>
        Add blocks from the palette on the left
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block) => (
          <SortableBlock
            key={block.id}
            block={block}
            selected={block.id === selectedId}
            onSelect={() => onSelect(block.id)}
            onDelete={() => onDelete(block.id)}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

function blockSummary(block: Block): string {
  switch (block.type) {
    case "image":      return block.props.src ? block.props.alt || block.props.src.split("/").pop() || "image" : "no src";
    case "heading":    return block.props.text;
    case "hero":       return block.props.title;
    case "text":       return block.props.content.slice(0, 60);
    case "button":     return `${block.props.label} → ${block.props.url}`;
    case "event_card": return block.props.title;
    case "info_card":  return block.props.heading;
    case "countdown":  return `${block.props.days}d ${block.props.hours}h ${block.props.minutes}m`;
    case "divider":    return "";
    case "spacer":     return `${block.props.height}px`;
    case "footer":     return block.props.venue_name;
  }
}
