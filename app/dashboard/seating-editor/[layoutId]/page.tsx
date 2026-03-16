"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { LayoutObject, LayoutObjectType, OBJECT_DEFAULTS, PRICE_TIER_COLORS } from "@/lib/types/layout";
import SeatingCanvas from "@/app/components/seating-editor/SeatingCanvas";
import SeatingToolbar from "@/app/components/seating-editor/SeatingToolbar";
import ObjectInspector from "@/app/components/seating-editor/ObjectInspector";
import PDFUploader from "@/app/components/seating-editor/PDFUploader";

function generateId(): string {
  return crypto.randomUUID();
}

export default function SeatingEditorPage() {
  const params = useParams();
  const router = useRouter();
  const layoutId = params.layoutId as string;

  const [layoutName, setLayoutName] = useState("Untitled Layout");
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [objects, setObjects] = useState<LayoutObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");
  const [canvasWidth] = useState(1200);
  const [canvasHeight] = useState(800);

  // Pending toolbar drop type
  const pendingDropType = useRef<LayoutObjectType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Load layout from Supabase
  useEffect(() => {
    if (layoutId === "new") {
      setLoading(false);
      return;
    }
    fetch(`/api/layouts/${layoutId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          alert("Layout not found");
          router.push("/admin/seating");
          return;
        }
        setLayoutName(data.name || "Untitled Layout");
        setBackgroundUrl(data.background_image_url || null);
        setObjects(data.objects || []);
      })
      .catch(() => {
        alert("Failed to load layout");
        router.push("/admin/seating");
      })
      .finally(() => setLoading(false));
  }, [layoutId, router]);

  // Add a new object at given position
  const addObject = useCallback(
    (type: LayoutObjectType, x?: number, y?: number) => {
      const defaults = OBJECT_DEFAULTS[type];
      const newObj: LayoutObject = {
        id: generateId(),
        layout_id: layoutId === "new" ? "" : layoutId,
        type,
        x: x ?? 100 + Math.random() * 200,
        y: y ?? 100 + Math.random() * 200,
        width: defaults.width || 100,
        height: defaults.height || 100,
        rotation: 0,
        label: defaults.label || type,
        capacity: defaults.capacity || 0,
        seat_count: defaults.seat_count || 0,
        price_tier: defaults.price_tier || "standard",
        color: defaults.color || PRICE_TIER_COLORS["standard"] || "#6366f1",
        metadata: {},
      };
      setObjects((prev) => [...prev, newObj]);
      setSelectedId(newObj.id);
    },
    [layoutId]
  );

  // Update an object
  const updateObject = useCallback((id: string, updates: Partial<LayoutObject>) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj))
    );
  }, []);

  // Move an object
  const moveObject = useCallback((id: string, x: number, y: number) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, x, y } : obj))
    );
  }, []);

  // Resize an object
  const resizeObject = useCallback((id: string, width: number, height: number) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, width, height } : obj))
    );
  }, []);

  // Delete an object
  const deleteObject = useCallback(
    (id: string) => {
      setObjects((prev) => prev.filter((obj) => obj.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  // Duplicate an object
  const duplicateObject = useCallback((id: string) => {
    setObjects((prev) => {
      const source = prev.find((obj) => obj.id === id);
      if (!source) return prev;
      const copy: LayoutObject = {
        ...source,
        id: generateId(),
        x: source.x + 30,
        y: source.y + 30,
        label: source.label + " (copy)",
      };
      setSelectedId(copy.id);
      return [...prev, copy];
    });
  }, []);

  // Handle dnd-kit drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!active || !over) return;

      const data = active.data.current;
      if (data?.source === "toolbar" && data?.type) {
        // Dropped from toolbar onto canvas — create object at center
        addObject(data.type as LayoutObjectType, canvasWidth / 2 - 50, canvasHeight / 2 - 50);
      }
    },
    [addObject, canvasWidth, canvasHeight]
  );

  // Handle native drop onto canvas (for toolbar items dragged via HTML5)
  const handleCanvasDrop = useCallback(
    (x: number, y: number) => {
      const type = pendingDropType.current;
      if (type) {
        addObject(type, x, y);
        pendingDropType.current = null;
      }
    },
    [addObject]
  );

  // Save layout to Supabase
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      let currentLayoutId = layoutId;

      // If new layout, create it first
      if (layoutId === "new") {
        const res = await fetch("/api/layouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: layoutName }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        currentLayoutId = data.id;
        // Update URL without full reload
        window.history.replaceState(null, "", `/dashboard/seating-editor/${currentLayoutId}`);
      } else {
        // Update layout metadata
        await fetch(`/api/layouts/${layoutId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: layoutName,
            background_image_url: backgroundUrl,
            canvas_width: canvasWidth,
            canvas_height: canvasHeight,
          }),
        });
      }

      // Save all objects
      await fetch(`/api/layouts/${currentLayoutId}/objects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objects }),
      });

      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(""), 3000);
    } catch (err) {
      console.error("Save failed:", err);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [layoutId, layoutName, backgroundUrl, canvasWidth, canvasHeight, objects]);

  const selectedObject = objects.find((o) => o.id === selectedId) || null;

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0a0a0f",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#a1a1aa",
          fontSize: 16,
        }}
      >
        Loading layout…
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        style={{
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "#0a0a0f",
          color: "#e5e7eb",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            height: 52,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            padding: "0 16px",
            gap: 12,
            background: "rgba(255,255,255,0.02)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={() => router.push("/admin/seating")}
            style={{
              background: "none",
              border: "none",
              color: "#a5b4fc",
              fontSize: 13,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ← Back
          </button>

          <input
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6,
              color: "#e5e7eb",
              fontSize: 14,
              fontWeight: 600,
              padding: "5px 12px",
              width: 260,
              outline: "none",
            }}
          />

          <PDFUploader
            layoutId={layoutId}
            onBackgroundSet={(url) => setBackgroundUrl(url)}
          />

          <div style={{ flex: 1 }} />

          {saveStatus === "saved" && (
            <span style={{ fontSize: 12, color: "#4ade80" }}>✓ Saved</span>
          )}
          {saveStatus === "error" && (
            <span style={{ fontSize: 12, color: "#f87171" }}>Save failed</span>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "7px 20px",
              background: saving ? "rgba(99,102,241,0.3)" : "#6366f1",
              border: "none",
              borderRadius: 6,
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save Layout"}
          </button>
        </div>

        {/* Main editor area */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left sidebar — tools */}
          <SeatingToolbar
            onAddObject={(type) => {
              pendingDropType.current = type;
              addObject(type);
            }}
          />

          {/* Center canvas */}
          <SeatingCanvas
            objects={objects}
            backgroundUrl={backgroundUrl}
            selectedId={selectedId}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            onSelectObject={setSelectedId}
            onMoveObject={moveObject}
            onResizeObject={resizeObject}
            onDropNewObject={handleCanvasDrop}
          />

          {/* Right sidebar — inspector */}
          <ObjectInspector
            selected={selectedObject}
            onUpdate={updateObject}
            onDelete={deleteObject}
            onDuplicate={duplicateObject}
          />
        </div>
      </div>

      <DragOverlay>
        {null /* Visual feedback handled by dnd-kit internally */}
      </DragOverlay>
    </DndContext>
  );
}
