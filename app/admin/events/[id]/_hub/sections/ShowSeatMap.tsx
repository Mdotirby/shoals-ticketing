"use client";

/**
 * Show mode — holds and kills painted onto one show's room.
 *
 * Built to handoff/screens/seatmap-builder.dc.html. The room is locked here:
 * the five tools mark seats for THIS show and never touch the saved layout.
 * The rules live in lib/seating/showMarks.ts and are enforced again by the
 * API, so a seat this refuses to paint is refused there too.
 *
 * Sold seats are locked. A section that sells first-come or standing refuses
 * the brush entirely and says to hold by count instead — which is what the
 * Holds panel above already does, through event_holds.
 *
 * Only the Show half of the design. Room layout — placing and dragging rows,
 * tables, zones, levels, templates — is the other mode and is not built yet;
 * the saved room still comes from dashboard/layout-builder.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHub } from "../HubContext";

/** The design's own palette. */
const AMBER = "oklch(0.86 0.12 85)";
const PROD = "oklch(0.72 0.14 300)";
const COMP = "oklch(0.80 0.10 190)";
const RED = "oklch(0.72 0.17 25)";
const UNAV = "rgba(255,255,255,0.13)";
const GREEN = "#8fd6a8";

type Tool = "select" | "artist" | "production" | "house_comp" | "kill" | "release";

const TOOLS: Array<{ id: Tool; icon: string; label: string; key: string; hint: string; tone?: string }> = [
  { id: "select", icon: "↖", label: "Inspect", key: "V", hint: "Click a seat to see what it is." },
  { id: "artist", icon: "●", label: "Artist hold", key: "H", tone: AMBER, hint: "Click seats to hold them for the artist. Table sections hold the whole table." },
  { id: "production", icon: "●", label: "Production", key: "P", tone: PROD, hint: "Click seats to hold them for production." },
  { id: "house_comp", icon: "●", label: "Comp", key: "C", tone: COMP, hint: "Click seats to set them aside as comps." },
  { id: "kill", icon: "✕", label: "Kill", key: "K", tone: RED, hint: "Click seats to kill them for this show only — sightline or equipment." },
  { id: "release", icon: "○", label: "Release", key: "E", hint: "Click held or killed seats to put them back on sale." },
];

const KEY_TO_TOOL: Record<string, Tool> = {
  v: "select", h: "artist", p: "production", c: "house_comp", k: "kill", e: "release",
};

type Seat = { id: string; x_ft?: number; y_ft?: number; status?: string; section_id?: string; object_id?: string; row_label?: string; seat_number?: number };
type Section = { id: string; name: string; seats?: Seat[]; color?: string; seating_mode?: string | null; sells_as_table?: boolean | null; type?: string | null };

const MARK_COLOR: Record<string, string> = {
  artist: AMBER, production: PROD, house_comp: COMP,
};

export default function ShowSeatMap() {
  const hub = useHub();
  const { id, event } = hub;

  const [sections, setSections] = useState<Section[] | null>(null);
  const [room, setRoom] = useState<{ w: number; h: number }>({ w: 100, h: 60 });
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [migrated, setMigrated] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [inspect, setInspect] = useState<string>("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // ── The room, from the same endpoint the storefront draws ───────────────
  useEffect(() => {
    let live = true;
    fetch(`/api/seating/events/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!live || !d?.enabled || !d.layout) { setSections([]); return; }
        setSections(d.layout.sections ?? []);
        setRoom({ w: d.layout.room_width_ft || 100, h: d.layout.room_height_ft || 60 });
      })
      .catch(() => live && setSections([]));
    return () => { live = false; };
  }, [id]);

  const loadMarks = useCallback(() => {
    fetch(`/api/admin/events/${id}/seat-marks`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setMigrated(d.migrated !== false);
        const next: Record<string, string> = {};
        for (const m of d.marks ?? []) next[m.seat_id] = m.mark;
        setMarks(next);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => { loadMarks(); }, [loadMarks]);

  // ── Keyboard, as the design specifies ───────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      const next = KEY_TO_TOOL[e.key.toLowerCase()];
      if (next) { setTool(next); setNote(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const allSeats = useMemo(
    () => (sections ?? []).flatMap((s) => (s.seats ?? []).map((seat) => ({ ...seat, section_id: seat.section_id ?? s.id }))),
    [sections],
  );
  const sectionOf = useCallback(
    (seat: Seat) => (sections ?? []).find((s) => s.id === seat.section_id) ?? null,
    [sections],
  );

  const counts = useMemo(() => {
    const c = { artist: 0, production: 0, house_comp: 0, kill: 0, sold: 0 };
    for (const seat of allSeats) {
      if (seat.status === "sold") { c.sold++; continue; }
      const m = marks[seat.id];
      if (m && m in c) c[m as keyof typeof c]++;
    }
    return c;
  }, [allSeats, marks]);

  // Capacity drops by kills only — a held seat still has a body in it.
  const capacity = allSeats.length - counts.kill;
  const fireLimit = Number((event as unknown as { fire_code_limit?: number })?.fire_code_limit) || allSeats.length;
  const firePct = Math.min(100, Math.round((capacity / Math.max(1, fireLimit)) * 100));
  const fireTone = capacity > fireLimit ? RED : capacity > fireLimit * 0.92 ? AMBER : GREEN;

  const paint = async (seat: Seat) => {
    if (busy) return;
    const sec = sectionOf(seat);

    if (tool === "select") {
      const m = marks[seat.id];
      setInspect(
        `${sec?.name ?? "Section"} · ${seat.row_label ?? "–"}${seat.seat_number ?? ""} — ` +
        (seat.status === "sold" ? "sold" : m ? `held: ${m.replace("house_comp", "comp")}` : "on sale"),
      );
      return;
    }

    setBusy(true);
    setNote("");
    try {
      if (tool === "release") {
        const r = await fetch(`/api/admin/events/${id}/seat-marks?seatId=${seat.id}`, { method: "DELETE" });
        if (!r.ok) { setNote((await r.json().catch(() => ({}))).error || "Couldn't release that."); return; }
      } else {
        const r = await fetch(`/api/admin/events/${id}/seat-marks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seatId: seat.id, mark: tool }),
        });
        if (!r.ok) { setNote((await r.json().catch(() => ({}))).error || "Couldn't hold that."); return; }
      }
      loadMarks();
    } finally {
      setBusy(false);
    }
  };

  if (sections === null) return null;
  if (sections.length === 0) {
    return (
      <div className="hub-card ssm-none">
        <div className="hub-msg-title">No seat map on this show</div>
        <div className="hub-promo-sub">
          Attach a room under Inventory &amp; seating to hold particular seats. Until then, hold by
          count with the Holds panel.
        </div>
      </div>
    );
  }

  // Fit the room to the panel, as the storefront map does.
  const PPF = 7;
  const activeTool = TOOLS.find((t) => t.id === tool)!;

  return (
    <div className="hub-card ssm">
      <div className="hub-card-head">
        <div>
          <div className="hub-msg-title">Holds &amp; kills on the map</div>
          <div className="hub-promo-sub">
            The room is locked here. What you mark applies to this show and does not change the
            saved room.
          </div>
        </div>
      </div>

      <div className="ssm-tools" role="toolbar" aria-label="Seat tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ssm-tool${tool === t.id ? " is-on" : ""}`}
            title={`${t.label} (${t.key})`}
            onClick={() => { setTool(t.id); setNote(""); }}
          >
            <span className="ssm-tool-icon" style={t.tone ? { color: t.tone } : undefined}>{t.icon}</span>
            <span className="ssm-tool-label">{t.label}</span>
            <kbd>{t.key}</kbd>
          </button>
        ))}
      </div>
      <div className="ssm-hint">{activeTool.hint}</div>

      {!migrated && (
        <div className="ssm-warn">
          Run plans/show-seat-marks-migration.sql before holding seats — there is nowhere to record
          them yet.
        </div>
      )}
      {note && <div className="ssm-warn">{note}</div>}
      {inspect && tool === "select" && <div className="ssm-inspect">{inspect}</div>}

      <div className="ssm-canvas-wrap" ref={wrapRef}>
        <div className="ssm-canvas" style={{ width: room.w * PPF, height: room.h * PPF }}>
          {allSeats.map((seat) => {
            const m = marks[seat.id];
            const sold = seat.status === "sold";
            const killed = m === "kill";
            const bg = sold ? UNAV : killed ? "rgba(0,0,0,0.7)" : m ? MARK_COLOR[m] : "rgba(255,255,255,0.5)";
            return (
              <button
                key={seat.id}
                type="button"
                className={`ssm-seat${sold ? " is-sold" : ""}`}
                style={{
                  left: (seat.x_ft ?? 0) * PPF,
                  top: (seat.y_ft ?? 0) * PPF,
                  background: bg,
                  border: killed ? `1.5px solid ${RED}` : "0",
                  cursor: tool === "select" ? "pointer" : sold ? "not-allowed" : "crosshair",
                }}
                title={`${seat.row_label ?? ""}${seat.seat_number ?? ""}`}
                onClick={() => paint(seat)}
              />
            );
          })}
        </div>
      </div>

      <div className="ssm-fire">
        <div className="ssm-fire-bar"><span style={{ width: `${firePct}%`, background: fireTone }} /></div>
        <span className="ssm-fire-label">{capacity} / {fireLimit} fire code</span>
      </div>

      <div className="ssm-summary">
        {[
          { label: "Artist holds", value: counts.artist, swatch: AMBER },
          { label: "Production holds", value: counts.production, swatch: PROD },
          { label: "Comps", value: counts.house_comp, swatch: COMP },
          { label: "Killed seats", value: counts.kill, swatch: "rgba(0,0,0,0.7)", ring: RED },
          { label: "Already sold", value: counts.sold, swatch: UNAV },
        ].map((r) => (
          <div key={r.label} className="ssm-sum-row">
            <span className="ssm-sw" style={{ background: r.swatch, border: r.ring ? `1.5px solid ${r.ring}` : "0" }} />
            <span className="ssm-sum-label">{r.label}</span>
            <b>{r.value}</b>
          </div>
        ))}
      </div>

      <div className="ssm-shortcuts">H artist · P production · C comp · K kill · E release · sold seats are locked</div>
    </div>
  );
}
