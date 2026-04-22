"use client";

/**
 * Deal Lab — event-scoped simulation UI.
 * All outputs visually labeled SIMULATED ONLY.
 */
import Link from "next/link";
import { use, useCallback, useState } from "react";

type DealStructureKey = "guarantee" | "guarantee_plus_backend" | "door_split" | "tiered_bonus";
type ScenarioKey = "conservative" | "expected" | "optimistic";

type SimOut = {
  scenario: ScenarioKey;
  sell_through_pct: number;
  deal_structure: DealStructureKey;
  inputs: Record<string, unknown>;
  projected_gross: number;
  projected_net: number;
  projected_expenses: number;
  artist_payout: number;
  promoter_profit: number;
  break_even_units: number | null;
  break_even_pct: number | null;
  risk_score: number;
  risk_flags: string[];
};

type Bundle = {
  session_id: string | null;
  event_id: string;
  core_snapshot: {
    complete: boolean;
    missing: string[];
    offer_id: string | null;
    gross_potential: number | null;
    net_potential: number | null;
    total_expenses: number | null;
    guarantee: number | null;
    deal_type: string | null;
    actual_revenue: number;
    actual_source: string;
  };
  pricing: { total_capacity: number; avg_price: number | null };
  results: SimOut[];
  blockers: string[];
};

type Recommendation = {
  best: SimOut | null;
  rationale: string;
  alternatives: Array<{ sim: SimOut; score: number; rationale: string }>;
};

const SCENARIOS: ScenarioKey[] = ["conservative", "expected", "optimistic"];
const LABELS: Record<ScenarioKey, string> = {
  conservative: "50% sell-through",
  expected: "70% sell-through",
  optimistic: "90% sell-through",
};

export default function DealLabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Inputs for the 4 deal structures
  const [guarantee, setGuarantee] = useState("10000");
  const [gPlusG, setGPlusG] = useState("8000");
  const [gPlusPct, setGPlusPct] = useState("85");
  const [doorPct, setDoorPct] = useState("80");
  const [tierG, setTierG] = useState("5000");
  const [tiers, setTiers] = useState<Array<{ units: string; bonus: string }>>([
    { units: "300", bonus: "1000" },
    { units: "450", bonus: "2000" },
    { units: "600", bonus: "4000" },
  ]);

  const runSim = useCallback(async () => {
    setRunning(true);
    setErr(null);
    const structures = [
      { structure: "guarantee" as const, inputs: { guarantee: Number(guarantee) } },
      {
        structure: "guarantee_plus_backend" as const,
        inputs: { guarantee: Number(gPlusG), backend_percentage: Number(gPlusPct) },
      },
      { structure: "door_split" as const, inputs: { door_split_artist_pct: Number(doorPct) } },
      {
        structure: "tiered_bonus" as const,
        inputs: {
          guarantee: Number(tierG),
          tiers: tiers
            .map((t) => ({ units: Number(t.units), bonus: Number(t.bonus) }))
            .filter((t) => t.units > 0),
        },
      },
    ];
    const res = await fetch(`/api/deal-lab/events/${eventId}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structures, persist: false }),
    });
    const out = await res.json();
    setRunning(false);
    if (!res.ok) { setErr(out.error ?? "failed"); return; }
    setBundle(out.bundle as Bundle);
    setRec(out.recommendation as Recommendation | null);
  }, [eventId, guarantee, gPlusG, gPlusPct, doorPct, tierG, tiers]);

  const blockers = bundle?.blockers ?? [];

  /* ---- render ---- */

  return (
    <div style={{ maxWidth: 1200, padding: 24, color: "#eee" }}>
      <div style={banner}>
        SIMULATED ONLY — these figures are projections. Never use as a factual revenue source.
      </div>
      <div style={{ fontSize: 12, marginTop: 16, opacity: 0.7 }}>
        <Link href={`/admin/events/${eventId}/edit`} style={{ color: "#d0c290", textDecoration: "none" }}>
          ← Back to event
        </Link>
        <span style={{ margin: "0 8px", opacity: 0.4 }}>·</span>
        <Link href={`/admin/events/${eventId}/ads`} style={{ color: "#d0c290", textDecoration: "none" }}>
          📣 Ad Engine
        </Link>
      </div>
      <h1 style={{ fontSize: 22, margin: "8px 0 4px" }}>Deal Lab</h1>
      <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 20 }}>
        Scenario + deal-structure simulator. Pulls live numbers from the linked Offer (read-only).
      </div>

      {/* INPUTS */}
      <Card title="1 · Guarantee">
        <Input label="Guarantee ($)" value={guarantee} onChange={(v) => setGuarantee(v)} />
      </Card>

      <Card title="2 · Guarantee + Backend">
        <div style={grid}>
          <Input label="Guarantee ($)" value={gPlusG} onChange={(v) => setGPlusG(v)} />
          <Input label="Backend %" value={gPlusPct} onChange={(v) => setGPlusPct(v)} />
        </div>
      </Card>

      <Card title="3 · Door Split">
        <Input label="Artist % of post-expense net" value={doorPct} onChange={(v) => setDoorPct(v)} />
      </Card>

      <Card title="4 · Tiered Bonus">
        <div style={grid}>
          <Input label="Guarantee ($)" value={tierG} onChange={(v) => setTierG(v)} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>Tiers (cumulative):</div>
        {tiers.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <Input label="≥ Units" value={t.units} onChange={(v) => setTiers((prev) => prev.map((x, j) => j === i ? { ...x, units: v } : x))} />
            <Input label="Bonus ($)" value={t.bonus} onChange={(v) => setTiers((prev) => prev.map((x, j) => j === i ? { ...x, bonus: v } : x))} />
            <button style={btnSmall} onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button style={{ ...btnSmall, marginTop: 8 }} onClick={() => setTiers((prev) => [...prev, { units: "0", bonus: "0" }])}>+ tier</button>
      </Card>

      <button onClick={runSim} disabled={running} style={{ ...btnStyle, opacity: running ? 0.5 : 1, marginBottom: 16 }}>
        {running ? "Simulating…" : "Run simulation"}
      </button>

      {err && <div style={{ ...banner, background: "#3a1a1a", color: "#f88" }}>{err}</div>}

      {/* BLOCKERS */}
      {blockers.length > 0 && (
        <Card title="Cannot simulate">
          <ul style={{ color: "#f88", fontSize: 13 }}>
            {blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <div style={{ opacity: 0.6, fontSize: 12, marginTop: 6 }}>
            Fix: ensure the event has a linked Offer with completed financials (gross, adj, net, tax_rate, expenses).
          </div>
        </Card>
      )}

      {/* CORE SNAPSHOT */}
      {bundle && bundle.core_snapshot.complete && (
        <Card title="Core snapshot (read-only — source of truth)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, fontSize: 13 }}>
            <Stat label="Capacity" value={String(bundle.pricing.total_capacity)} />
            <Stat label="Offer gross @100%" value={`$${fmt(bundle.core_snapshot.gross_potential)}`} />
            <Stat label="Net potential @100%" value={`$${fmt(bundle.core_snapshot.net_potential)}`} />
            <Stat label="Total expenses" value={`$${fmt(bundle.core_snapshot.total_expenses)}`} />
            <Stat label="Offer deal" value={bundle.core_snapshot.deal_type ?? "—"} />
            <Stat label="Offer guarantee" value={`$${fmt(bundle.core_snapshot.guarantee)}`} />
            <Stat label="Actuals source" value={bundle.core_snapshot.actual_source} />
            <Stat label="Actual revenue" value={`$${fmt(bundle.core_snapshot.actual_revenue)}`} />
          </div>
        </Card>
      )}

      {/* RECOMMENDATION */}
      {rec && (
        <Card title="Recommended structure (SIMULATED)">
          {rec.best ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                → {labelOf(rec.best.deal_structure)} ({fmtInputs(rec.best.deal_structure, rec.best.inputs)})
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{rec.rationale}</div>
              <div style={{ marginTop: 10 }}>
                {rec.alternatives.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, opacity: 0.8 }}>
                    · Alt: {labelOf(a.sim.deal_structure)} — score {a.score.toFixed(2)} — {a.rationale}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: "#f88" }}>{rec.rationale}</div>
          )}
        </Card>
      )}

      {/* COMPARISON TABLE */}
      {bundle && bundle.results.length > 0 && (
        <Card title="Scenario × Deal structure comparison">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.6 }}>
                  <th style={thStyle}>Structure</th>
                  {SCENARIOS.map((s) => (<th key={s} style={thStyle}>{LABELS[s]}</th>))}
                </tr>
              </thead>
              <tbody>
                {groupByStructure(bundle.results).map((grp) => (
                  <tr key={grp.key} style={{ borderTop: "1px solid #222" }}>
                    <td style={tdStyle}>
                      <strong>{labelOf(grp.structure)}</strong>
                      <div style={{ opacity: 0.6, marginTop: 2 }}>{fmtInputs(grp.structure, grp.inputs)}</div>
                    </td>
                    {SCENARIOS.map((s) => {
                      const sim = grp.by[s];
                      if (!sim) return <td key={s} style={tdStyle}>—</td>;
                      return (
                        <td key={s} style={tdStyle}>
                          <div>Artist: <strong>${fmt(sim.artist_payout)}</strong></div>
                          <div>Promoter: <strong style={{ color: sim.promoter_profit >= 0 ? "#6f6" : "#f66" }}>${fmt(sim.promoter_profit)}</strong></div>
                          <div style={{ opacity: 0.7 }}>
                            BE: {sim.break_even_pct !== null ? `${Math.round(sim.break_even_pct * 100)}%` : "—"} cap
                          </div>
                          {sim.risk_flags.length > 0 && (
                            <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {sim.risk_flags.map((f) => (
                                <span key={f} style={riskPill}>{f}</span>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ── helpers ── */

function groupByStructure(results: SimOut[]) {
  const map = new Map<string, { key: string; structure: DealStructureKey; inputs: Record<string, unknown>; by: Partial<Record<ScenarioKey, SimOut>> }>();
  for (const r of results) {
    const k = `${r.deal_structure}|${JSON.stringify(r.inputs)}`;
    if (!map.has(k)) map.set(k, { key: k, structure: r.deal_structure, inputs: r.inputs, by: {} });
    map.get(k)!.by[r.scenario] = r;
  }
  return Array.from(map.values());
}
function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "0";
  return Math.round(v).toLocaleString();
}
function labelOf(s: DealStructureKey) {
  switch (s) {
    case "guarantee": return "Guarantee";
    case "guarantee_plus_backend": return "Guarantee + Backend";
    case "door_split": return "Door Split";
    case "tiered_bonus": return "Tiered Bonus";
  }
}
function fmtInputs(s: DealStructureKey, i: Record<string, unknown>): string {
  if (s === "guarantee") return `G $${fmt(Number(i.guarantee ?? 0))}`;
  if (s === "guarantee_plus_backend") return `G $${fmt(Number(i.guarantee ?? 0))} + ${Number(i.backend_percentage ?? 0)}%`;
  if (s === "door_split") return `${Number(i.door_split_artist_pct ?? 0)}% to artist`;
  if (s === "tiered_bonus") {
    const arr = Array.isArray(i.tiers) ? (i.tiers as Array<{ units: number; bonus: number }>) : [];
    return `G $${fmt(Number(i.guarantee ?? 0))} + ${arr.length} tiers`;
  }
  return "";
}

/* ── UI primitives (match ads page look) ── */
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, alignItems: "end" };
const thStyle: React.CSSProperties = { padding: "8px 10px", fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 };
const tdStyle: React.CSSProperties = { padding: "10px", verticalAlign: "top" };
const btnStyle: React.CSSProperties = {
  padding: "10px 18px", background: "#d0c290", color: "#111", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600,
};
const btnSmall: React.CSSProperties = {
  padding: "4px 8px", background: "#222", color: "#eee", border: "1px solid #333", borderRadius: 4, cursor: "pointer", fontSize: 11,
};
const banner: React.CSSProperties = {
  padding: "8px 12px",
  background: "#3a2e0e",
  border: "1px solid #6b5c20",
  borderRadius: 6,
  fontSize: 12,
  color: "#f5d576",
  fontWeight: 500,
  textAlign: "center",
  letterSpacing: 0.5,
};
const riskPill: React.CSSProperties = {
  padding: "2px 6px", borderRadius: 8, fontSize: 10, background: "#3a1a1a", color: "#f88", textTransform: "uppercase",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f1116", border: "1px solid #222", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1, color: "#d0c290" }}>{title}</h3>
      {children}
    </div>
  );
}
function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4, minWidth: 140 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 8px", background: "#111", border: "1px solid #333", borderRadius: 4, color: "#eee" }} />
    </label>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#0b0d12", padding: 10, borderRadius: 6 }}>
      <div style={{ opacity: 0.6, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{value}</div>
    </div>
  );
}
