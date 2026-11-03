"use client";

/** The Drawer tab: door totals, and counting the cash against float plus cash sales. */

import { useCallback, useEffect, useState } from "react";
import { DENOMINATIONS, countedCents, drawerVariance, type DenominationCounts } from "@/lib/pos/drawer";
import { money, type DoorTotals } from "../useBoxOffice";

const usd = (cents: number) => money(cents / 100);

type Saved = {
  opening_float: number | string | null;
  denominations: DenominationCounts | null;
  note: string | null;
  closed_at: string | null;
  closed_by: string | null;
};

export default function DrawerPanel({ eventId, door, onBack }: { eventId: string; door: DoorTotals | null; onBack?: () => void }) {
  const [migrated, setMigrated] = useState(true);
  const [cashSales, setCashSales] = useState(0);
  const [floatText, setFloatText] = useState("");
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [note, setNote] = useState("");
  const [closed, setClosed] = useState<{ at: string; by: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/box-office/drawer?event_id=${eventId}`);
    const out = await res.json().catch(() => null);
    if (!res.ok || !out) return;
    setMigrated(out.migrated !== false);
    setCashSales(out.cashSalesCents ?? 0);
    const d: Saved | null = out.drawer;
    if (d) {
      setFloatText(d.opening_float != null ? Number(d.opening_float).toFixed(2) : "");
      setCounts(d.denominations ?? {});
      setNote(d.note ?? "");
      setClosed(d.closed_at ? { at: d.closed_at, by: d.closed_by } : null);
    }
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  const floatCents = Math.max(0, Math.round((parseFloat(floatText) || 0) * 100));
  const counted = countedCents(counts);
  const { expected, variance, matches } = drawerVariance(floatCents, cashSales, counted);
  const anyCount = Object.values(counts).some((n) => Number(n) > 0);

  const save = async (close: boolean) => {
    setMessage(null);
    if (!matches && !note.trim()) {
      setMessage({ tone: "bad", text: "Add a note, since the count doesn't match." });
      return;
    }
    if (close && !window.confirm("Close the drawer for this show?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/box-office/drawer?event_id=${eventId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ floatCents, counts, note, close }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Couldn't save the count.");
      setClosed(out.drawer?.closed_at ? { at: out.drawer.closed_at, by: out.drawer.closed_by } : null);
      setMessage({ tone: "good", text: close ? "Drawer closed." : "Count saved." });
    } catch (e) {
      setMessage({ tone: "bad", text: e instanceof Error ? e.message : "Couldn't save the count." });
    } finally {
      setSaving(false);
    }
  };

  const bump = (key: string, by: number) =>
    setCounts((c) => ({ ...c, [key]: Math.max(0, (Number(c[key]) || 0) + by) }));

  return (
    <div className="pos-drawer">
      <div className="pos-drawer-col">
        <div className="pos-panel" style={{ flex: "none", overflow: "visible" }}>
          <div className="pos-eyebrow">Door totals · this show</div>
          <div className="pos-drawer-totals">
            <div className="pos-stat"><div>Card</div><div>{door ? money(door.card.amount) : "—"}</div></div>
            <div className="pos-stat"><div>Cash</div><div>{door ? money(door.cash.amount) : "—"}</div></div>
            <div className="pos-stat"><div>Tickets</div><div>{door?.doorTickets ?? "—"}</div></div>
          </div>
        </div>
        <div className="pos-panel" style={{ flex: "none", overflow: "visible", gap: 8 }}>
          <div className="pos-eyebrow">Cash in the drawer</div>
          <label className="pos-line" style={{ alignItems: "center" }}>
            <b>Opening float</b>
            <input
              className="pos-input"
              style={{ width: 130, height: 44, textAlign: "right" }}
              inputMode="decimal"
              placeholder="0.00"
              value={floatText}
              onChange={(e) => setFloatText(e.target.value)}
            />
          </label>
          <div className="pos-line"><b>Cash sales</b><span>+ {usd(cashSales)}</span></div>
          <div className="pos-line" style={{ borderBottom: 0 }}><b style={{ fontWeight: 800 }}>Expected in drawer</b><span style={{ fontSize: 24, fontWeight: 800 }}>{usd(expected)}</span></div>
        </div>
      </div>

      <div className="pos-panel pos-panel--sale" style={{ gap: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Count the drawer</div>
        {!migrated && <div className="pos-error">The count can&apos;t be saved yet. Run plans/box-office-drawer-migration.sql.</div>}
        {closed && <div className="pos-sub">Closed {new Date(closed.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{closed.by ? ` by ${closed.by}` : ""}. Saving reopens it.</div>}
        <div className="pos-denoms">
          {DENOMINATIONS.map((d) => (
            <div key={d.key} className="pos-denom">
              <b>{d.label}</b>
              <button type="button" aria-label={`One fewer ${d.label}`} onClick={() => bump(d.key, -1)}>−</button>
              <span>{Number(counts[d.key]) || 0}</span>
              <button type="button" aria-label={`One more ${d.label}`} onClick={() => bump(d.key, 1)}>+</button>
            </div>
          ))}
        </div>
        <div className="pos-change" style={{ minHeight: 64, flex: "none" }}>
          <b>Counted</b><span style={{ fontSize: 30, color: "#fff" }}>{usd(counted)}</span>
        </div>
        <div className="pos-change" data-state={!anyCount ? "empty" : matches ? "enough" : "short"} style={{ minHeight: 72, flex: "none" }}>
          <b>
            {!anyCount ? "Not counted yet" : matches ? "Drawer matches" : variance < 0 ? "Short" : "Over"}
            <small style={{ display: "block", fontSize: 13, fontWeight: 400, color: "rgba(255,255,255,0.70)", marginTop: 2 }}>Expected {usd(expected)}</small>
          </b>
          <span style={{ fontSize: 34 }}>{anyCount ? usd(Math.abs(variance)) : "—"}</span>
        </div>
        {anyCount && !matches && (
          <input className="pos-input" placeholder="Note for the manager (required when it doesn't match)" value={note} onChange={(e) => setNote(e.target.value)} />
        )}
        {message && <div className={message.tone === "bad" ? "pos-error" : "pos-sub"} style={message.tone === "good" ? { color: "var(--good)", fontWeight: 700 } : undefined}>{message.text}</div>}
        <span style={{ flex: 1 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10, flex: "none" }}>
          <button type="button" className="pos-pill" style={{ height: 60, borderRadius: 22, fontSize: 16 }} disabled={saving || !anyCount} onClick={() => save(false)}>Save count</button>
          <button type="button" className="pos-main" style={{ height: 60, borderRadius: 22, fontSize: 17 }} disabled={saving || !anyCount} onClick={() => save(true)}>Close drawer</button>
        </div>
        {onBack && <button type="button" className="pos-pill" style={{ minHeight: 52, flex: "none" }} onClick={onBack}>Back</button>}
      </div>
    </div>
  );
}
