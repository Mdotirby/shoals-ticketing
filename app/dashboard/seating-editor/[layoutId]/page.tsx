"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { DndContext, DragEndEvent, DragOverlay, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { LayoutObject, LayoutObjectType, OBJECT_DEFAULTS, PRICE_TIER_COLORS, DEFAULT_PPF, inchesToFeet } from "@/lib/types/layout";
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

  // Room dimensions (feet)
  const [roomWidthFt, setRoomWidthFt] = useState(100);
  const [roomHeightFt, setRoomHeightFt] = useState(60);
  const [pixelsPerFoot, setPixelsPerFoot] = useState(DEFAULT_PPF);

  // Room setup modal (shown for new layouts)
  const [showRoomSetup, setShowRoomSetup] = useState(false);
  const [setupWidth, setSetupWidth] = useState("100");
  const [setupHeight, setSetupHeight] = useState("60");

  const pendingDropType = useRef<LayoutObjectType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Load layout
  useEffect(() => {
    if (layoutId === "new") {
      setLoading(false);
      setShowRoomSetup(true);
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
        setRoomWidthFt(data.room_width_ft || 100);
        setRoomHeightFt(data.room_height_ft || 60);
        setPixelsPerFoot(data.scale_pixels_per_foot || DEFAULT_PPF);
        setObjects(data.objects || []);
      })
      .catch(() => {
        alert("Failed to load layout");
        router.push("/admin/seating");
      })
      .finally(() => setLoading(false));
  }, [layoutId, router]);

  // Add object at position (in feet)
  const addObject = useCallback(
    (type: LayoutObjectType, xFt?: number, yFt?: number) => {
      const defaults = OBJECT_DEFAULTS[type];
      const w = defaults.width || 5;
      const h = defaults.height || 5;
      const newObj: LayoutObject = {
        id: generateId(),
        layout_id: layoutId === "new" ? "" : layoutId,
        type,
        x: xFt ?? (roomWidthFt / 2 - w / 2),
        y: yFt ?? (roomHeightFt / 2 - h / 2),
        width: w,
        height: h,
        diameter_inches: defaults.diameter_inches || 0,
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
    [layoutId, roomWidthFt, roomHeightFt]
  );

  const updateObject = useCallback((id: string, updates: Partial<LayoutObject>) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, ...updates } : obj))
    );
  }, []);

  const moveObject = useCallback((id: string, x: number, y: number) => {
    setObjects((prev) =>
      prev.map((obj) => (obj.id === id ? { ...obj, x, y } : obj))
    );
  }, []);

  const resizeObject = useCallback((id: string, width: number, height: number) => {
    setObjects((prev) =>
      prev.map((obj) => {
        if (obj.id !== id) return obj;
        const updates: Partial<LayoutObject> = { width, height };
        // For tables, also update diameter_inches
        if (obj.type === "table") {
          updates.diameter_inches = Math.round(Math.min(width, height) * 12);
        }
        return { ...obj, ...updates };
      })
    );
  }, []);

  const deleteObject = useCallback(
    (id: string) => {
      setObjects((prev) => prev.filter((obj) => obj.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId]
  );

  const duplicateObject = useCallback((id: string) => {
    setObjects((prev) => {
      const source = prev.find((obj) => obj.id === id);
      if (!source) return prev;
      const copy: LayoutObject = {
        ...source,
        id: generateId(),
        x: source.x + 2,
        y: source.y + 2,
        label: source.label + " (copy)",
      };
      setSelectedId(copy.id);
      return [...prev, copy];
    });
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!active || !over) return;
      const data = active.data.current;
      if (data?.source === "toolbar" && data?.type) {
        addObject(data.type as LayoutObjectType);
      }
    },
    [addObject]
  );

  const handleCanvasDrop = useCallback(
    (xFt: number, yFt: number) => {
      const type = pendingDropType.current;
      if (type) {
        addObject(type, xFt, yFt);
        pendingDropType.current = null;
      }
    },
    [addObject]
  );

  // Save
  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      let currentLayoutId = layoutId;

      if (layoutId === "new") {
        const res = await fetch("/api/layouts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: layoutName,
            room_width_ft: roomWidthFt,
            room_height_ft: roomHeightFt,
            scale_pixels_per_foot: pixelsPerFoot,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        currentLayoutId = data.id;
        window.history.replaceState(null, "", `/dashboard/seating-editor/${currentLayoutId}`);
      } else {
        await fetch(`/api/layouts/${layoutId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: layoutName,
            background_image_url: backgroundUrl,
            room_width_ft: roomWidthFt,
            room_height_ft: roomHeightFt,
            scale_pixels_per_foot: pixelsPerFoot,
          }),
        });
      }

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
  }, [layoutId, layoutName, backgroundUrl, roomWidthFt, roomHeightFt, pixelsPerFoot, objects]);

  const selectedObject = objects.find((o) => o.id === selectedId) || null;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center", color: "#a1a1aa", fontSize: 16 }}>
        Loading layout…
      </div>
    );
  }

  // Room setup modal
  if (showRoomSetup) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 16, padding: 32, maxWidth: 400, width: "100%",
        }}>
          <h2 style={{ color: "#e5e7eb", fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
            Room Dimensions
          </h2>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 24 }}>
            Enter the real-world dimensions of your venue space in feet.
          </p>

          <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, display: "block" }}>
                Width (ft)
              </label>
              <input
                type="number"
                value={setupWidth}
                onChange={(e) => setSetupWidth(e.target.value)}
                min={10}
                max={1000}
                style={{
                  width: "100%", padding: "10px 12px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8, color: "#e5e7eb", fontSize: 16,
                  outline: "none",
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, display: "block" }}>
                Height (ft)
              </label>
              <input
                type="number"
                value={setupHeight}
                onChange={(e) => setSetupHeight(e.target.value)}
                min={10}
                max={1000}
                style={{
                  width: "100%", padding: "10px 12px",
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 8, color: "#e5e7eb", fontSize: 16,
                  outline: "none",
                }}
              />
            </div>
          </div>

          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginBottom: 20 }}>
            Example: 100ft × 60ft = 6,000 sq ft venue
          </p>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => router.push("/admin/seating")}
              style={{
                flex: 1, padding: "10px 0",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8, color: "#a1a1aa",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const w = parseFloat(setupWidth) || 100;
                const h = parseFloat(setupHeight) || 60;
                setRoomWidthFt(w);
                setRoomHeightFt(h);
                setShowRoomSetup(false);
              }}
              style={{
                flex: 1, padding: "10px 0",
                background: "#6366f1",
                border: "none", borderRadius: 8, color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Create Layout
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0f", color: "#e5e7eb" }}>
        {/* Top bar */}
        <div
          style={{
            height: 50, borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", padding: "0 12px", gap: 10,
            background: "rgba(255,255,255,0.02)", flexShrink: 0,
          }}
        >
          <button
            onClick={() => router.push("/admin/seating")}
            style={{ background: "none", border: "none", color: "#a5b4fc", fontSize: 13, cursor: "pointer", padding: "4px 8px" }}
          >
            ← Back
          </button>

          <input
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6, color: "#e5e7eb", fontSize: 13, fontWeight: 600,
              padding: "4px 10px", width: 200, outline: "none",
            }}
          />

          {/* Room dims display */}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", padding: "0 4px" }}>
            {roomWidthFt}×{roomHeightFt} ft
          </div>

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
              padding: "6px 18px", background: saving ? "rgba(99,102,241,0.3)" : "#6366f1",
              border: "none", borderRadius: 6, color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save Layout"}
          </button>
        </div>

        {/* Main editor */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <SeatingToolbar
            onAddObject={(type) => {
              pendingDropType.current = type;
              addObject(type);
            }}
          />

          <SeatingCanvas
            objects={objects}
            backgroundUrl={backgroundUrl}
            selectedId={selectedId}
            roomWidthFt={roomWidthFt}
            roomHeightFt={roomHeightFt}
            pixelsPerFoot={pixelsPerFoot}
            onSelectObject={setSelectedId}
            onMoveObject={moveObject}
            onResizeObject={resizeObject}
            onDropNewObject={handleCanvasDrop}
          />

          <ObjectInspector
            selected={selectedObject}
            onUpdate={updateObject}
            onDelete={deleteObject}
            onDuplicate={duplicateObject}
          />
        </div>
      </div>

      <DragOverlay>{null}</DragOverlay>
    </DndContext>
  );
}
