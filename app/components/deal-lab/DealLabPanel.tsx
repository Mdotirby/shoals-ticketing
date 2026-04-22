"use client";

/**
 * DealLabPanel — live simulation inside the offer form.
 *
 * Reads the offer's computed totals + deal terms via props, renders
 * inputs for the 4 deal structures (pre-filled from the offer), and
 * recomputes scenarios × structures on every keystroke using
 * `simulateInline()` (pure, synchronous, client-safe).
 *
 * Never writes. Every output is flagged SIMULATED ONLY.
 */

import { useEffect, useMemo, useState } from "react";
import {
  recommendInline,
  simulateInline,
  type DealInputs,
  type DealStructureKey,
  type InlineInputs,
  type ScenarioKey,
  type SimulationOutput,
} from "@/modules/deal-lab/client";

const SCENARIOS_ORDER: ScenarioKey[] = ["conservative", "expected", "optimistic"];
const SCENARIO_LABELS: Record<ScenarioKey, string> = {
  conservative: "Conservative · 50%",
  expected: "Expected · 70%",
  optimistic: "Optimistic · 90%",
};

const STRUCTURE_LABELS: Record<DealStructureKey, string> = {
  guarantee: "FLAT — Guarantee",
  guarantee_vs_backend: "VS — Guarantee vs Backend",
  guarantee_plus_backend: "PLUS — Guarantee + Backend",
  door_split: "Door Split",
  tiered_bonus: "Tiered Bonus",
};

export default function DealLabPanel({ inputs }: { inputs: InlineInputs }) {
  /* ── Deal-structure input state (pre-filled from offer) ── */
  const offerG = Math.max(0, Math.round(Number(inputs.offer_guarantee ?? 0)));
  const offerBackend = Number(inputs.offer_backend_percentage ?? 85);

  // FLAT (guarantee only)
  const [gVal, setGVal] = useState(String(offerG));
  // VS (max of G or backend%)
  const [vsG, setVsG] = useState(String(offerG));
  const [vsPct, setVsPct] = useState(String(offerBackend));
  // PLUS (G + backend%)
  const [gbVal, setGbVal] = useState(String(offerG));
  const [gbPct, setGbPct] = useState(String(offerBackend));
  // Door split
  const [doorPct, setDoorPct] = useState("80");
  const [tbGuarantee, setTbGuarantee] = useState(
    String(Math.round(Number(inputs.offer_guarantee ?? 0) * 0.7))
  );
  const [tiers, setTiers] = useState<Array<{ units: string; bonus: string }>>(() => {
    const cap = inputs.total_capacity || 0;
    if (cap <= 0) return [];
    return [
      { units: String(Math.round(cap * 0.5)), bonus: "1000" },
      { units: String(Math.round(cap * 0.75)), bonus: "2000" },
      { units: String(Math.round(cap * 0.9)), bonus: "4000" },
    ];
  });

  // Re-sync defaults when the offer's own guarantee changes materially
  useEffect(() => {
    if (inputs.offer_guarantee && Number(inputs.offer_guarantee) > 0) {
      const next = String(Math.round(Number(inputs.offer_guarantee)));
      setGVal(next);
      setVsG(next);
      setGbVal(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.offer_guarantee]);

  // Re-sync backend % when the offer's backend changes
  useEffect(() => {
    if (inputs.offer_backend_percentage !== null && inputs.offer_backend_percentage !== undefined) {
      const next = String(Number(inputs.offer_backend_percentage));
      setVsPct(next);
      setGbPct(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs.offer_backend_percentage]);

  /* ── Build the 5 structures ── */
  const structures: Array<{ structure: DealStructureKey; inputs: DealInputs }> = useMemo(
    () => [
      { structure: "guarantee", inputs: { guarantee: Number(gVal) || 0 } },
      {
        structure: "guarantee_vs_backend",
        inputs: {
          guarantee: Number(vsG) || 0,
          backend_percentage: Number(vsPct) || 0,
        },
      },
      {
        structure: "guarantee_plus_backend",
        inputs: {
          guarantee: Number(gbVal) || 0,
          backend_percentage: Number(gbPct) || 0,
        },
      },
      {
        structure: "door_split",
        inputs: { door_split_artist_pct: Number(doorPct) || 0 },
      },
      {
        structure: "tiered_bonus",
        inputs: {
          guarantee: Number(tbGuarantee) || 0,
          tiers: tiers
            .map((t) => ({ units: Number(t.units) || 0, bonus: Number(t.bonus) || 0 }))
            .filter((t) => t.units > 0),
        },
      },
    ],
    [gVal, vsG, vsPct, gbVal, gbPct, doorPct, tbGuarantee, tiers]
  );

  /* ── Synchronous simulation (no fetch) ── */
  const bundle = useMemo(
    () => simulateInline({ inputs, structures }),
    [inputs, structures]
  );

  const recommendation = useMemo(
    () => recommendInline(bundle, Number(inputs.offer_guarantee ?? 0)),
    [bundle, inputs.offer_guarantee]
  );

  /* ── Grouped for the comparison grid ── */
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        structure: DealStructureKey;
        inputs: Record<string, unknown>;
        by: Partial<Record<ScenarioKey, SimulationOutput>>;
      }
    >();
    for (const r of bundle.results) {
      const k = `${r.deal_structure}|${JSON.stringify(r.inputs)}`;
      if (!map.has(k))
        map.set(k, { structure: r.deal_structure, inputs: r.inputs, by: {} });
      map.get(k)!.by[r.scenario] = r;
    }
    return Array.from(map.values());
  }, [bundle.results]);

  return (
    <div style={{ padding: "8px 0" }}>
      {/* Permanent SIMULATED banner */}
      <div style={bannerStyle}>
        SIMULATED ONLY — live projections based on the current offer inputs. Not a factual revenue source.
      </div>

      {/* BLOCKERS */}
      {bundle.blockers.length > 0 && (
        <div style={{ ...cardStyle, borderColor: "#6b2323", background: "#2a1515", color: "#f88", fontSize: 13 }}>
          <strong>Cannot simulate yet.</strong>
          <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
            {bundle.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}

      {/* OFFER SNAPSHOT */}
      <Card title="Offer snapshot (live from form)">
        <div style={statGrid}>
          <Stat label="Capacity" value={String(inputs.total_capacity || 0)} />
          <Stat label="Gross @100%" value={money(inputs.gross_potential_full)} />
          <Stat label="Adj Gross" value={money(inputs.adj_gross_full)} />
          <Stat label="Net Potential" value={money(inputs.net_potential_full)} />
          <Stat label="Offer deal" value={inputs.offer_deal_type ?? "—"} />
          <Stat
            label="Offer guarantee"
            value={money(inputs.offer_guarantee)}
          />
        </div>
      </Card>

      {/* DEAL-STRUCTURE INPUTS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
        }}
      >
        <Card title="1 · FLAT — Guarantee">
          <Input label="Guarantee ($)" value={gVal} onChange={setGVal} />
          <div style={helperText}>artist = G · promoter = net − expenses − G</div>
        </Card>
        <Card title="2 · VS — Guarantee vs Backend">
          <div style={formRow}>
            <Input label="Guarantee ($)" value={vsG} onChange={setVsG} />
            <Input label="Backend %" value={vsPct} onChange={setVsPct} />
          </div>
          <div style={helperText}>artist = max(G, backend% × splitpoint)</div>
        </Card>
        <Card title="3 · PLUS — Guarantee + Backend">
          <div style={formRow}>
            <Input label="Guarantee ($)" value={gbVal} onChange={setGbVal} />
            <Input label="Backend %" value={gbPct} onChange={setGbPct} />
          </div>
          <div style={helperText}>artist = G + backend% × splitpoint</div>
        </Card>
        <Card title="4 · Door Split">
          <Input label="Artist % (post-expense net)" value={doorPct} onChange={setDoorPct} />
          <div style={helperText}>artist = splitpoint × artist%</div>
        </Card>
        <Card title="5 · Tiered Bonus">
          <Input label="Base guarantee ($)" value={tbGuarantee} onChange={setTbGuarantee} />
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>
            Cumulative thresholds (units sold ≥ → add bonus):
          </div>
          {tiers.map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <Input
                label="Units"
                value={t.units}
                onChange={(v) =>
                  setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, units: v } : x)))
                }
              />
              <Input
                label="Bonus ($)"
                value={t.bonus}
                onChange={(v) =>
                  setTiers((prev) => prev.map((x, j) => (j === i ? { ...x, bonus: v } : x)))
                }
              />
              <button
                type="button"
                style={{ ...btnSmall, alignSelf: "end" }}
                onClick={() => setTiers((prev) => prev.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            style={{ ...btnSmall, marginTop: 8 }}
            onClick={() => setTiers((prev) => [...prev, { units: "0", bonus: "0" }])}
          >
            + tier
          </button>
        </Card>
      </div>

      {/* RECOMMENDATION */}
      {bundle.blockers.length === 0 && (
        <Card title="Recommended structure (SIMULATED)">
          {recommendation.best ? (
            <>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                → {STRUCTURE_LABELS[recommendation.best.deal_structure]}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {recommendation.rationale}
              </div>
              {recommendation.alternatives.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
                  {recommendation.alternatives.map((a, i) => (
                    <div key={i}>
                      · Alt: {STRUCTURE_LABELS[a.sim.deal_structure]} — score {a.score.toFixed(2)}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ color: "#f88", fontSize: 13 }}>{recommendation.rationale}</div>
          )}
        </Card>
      )}

      {/* COMPARISON GRID */}
      {bundle.blockers.length === 0 && (
        <Card title="Scenario × structure comparison">
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Structure</th>
                  {SCENARIOS_ORDER.map((s) => (
                    <th key={s} style={thStyle}>{SCENARIO_LABELS[s]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <tr key={`${g.structure}`} style={{ borderTop: "1px solid #222" }}>
                    <td style={tdStyle}>
                      <strong>{STRUCTURE_LABELS[g.structure]}</strong>
                      <div style={{ opacity: 0.6, marginTop: 2, fontSize: 11 }}>
                        {formatInputs(g.structure, g.inputs)}
                      </div>
                    </td>
                    {SCENARIOS_ORDER.map((s) => {
                      const sim = g.by[s];
                      if (!sim) return <td key={s} style={tdStyle}>—</td>;
                      return (
                        <td key={s} style={tdStyle}>
                          <Row label="Artist" value={money(sim.artist_payout)} />
                          <Row
                            label="Promoter"
                            value={money(sim.promoter_profit)}
                            color={sim.promoter_profit >= 0 ? "#6f6" : "#f66"}
                          />
                          <Row
                            label="BE"
                            value={
                              sim.break_even_pct !== null
                                ? `${Math.round(sim.break_even_pct * 100)}% cap`
                                : "—"
                            }
                          />
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

/* ── formatting helpers ── */
function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return "$0";
  if (!Number.isFinite(Number(n))) return "$0";
  return `$${Math.round(Number(n)).toLocaleString()}`;
}
function formatInputs(s: DealStructureKey, i: Record<string, unknown>): string {
  if (s === "guarantee") return `G ${money(Number(i.guarantee ?? 0))}`;
  if (s === "guarantee_plus_backend")
    return `G ${money(Number(i.guarantee ?? 0))} + ${Number(i.backend_percentage ?? 0)}%`;
  if (s === "door_split") return `${Number(i.door_split_artist_pct ?? 0)}% to artist`;
  if (s === "tiered_bonus") {
    const arr = Array.isArray(i.tiers) ? (i.tiers as Array<{ units: number; bonus: number }>) : [];
    return `G ${money(Number(i.guarantee ?? 0))} + ${arr.length} tiers`;
  }
  return "";
}

/* ── tiny UI primitives (match offer page visual vocabulary) ── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ ...cardStyle, marginBottom: 12 }}>
      <h3 style={cardTitle}>{title}</h3>
      {children}
    </div>
  );
}
function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 4, minWidth: 100, flex: 1 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        style={{
          padding: "6px 8px",
          background: "#0b0d12",
          border: "1px solid #2a2f3a",
          borderRadius: 4,
          color: "#eee",
          fontSize: 13,
        }}
      />
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
function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ fontSize: 12, display: "flex", gap: 8 }}>
      <span style={{ opacity: 0.6, minWidth: 58 }}>{label}:</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

/* ── styles ── */
const cardStyle: React.CSSProperties = {
  background: "#0f1116",
  border: "1px solid #222",
  borderRadius: 8,
  padding: 14,
};
const cardTitle: React.CSSProperties = {
  fontSize: 12,
  margin: "0 0 10px",
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#d0c290",
};
const bannerStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "#3a2e0e",
  border: "1px solid #6b5c20",
  borderRadius: 6,
  fontSize: 12,
  color: "#f5d576",
  fontWeight: 500,
  textAlign: "center",
  letterSpacing: 0.5,
  marginBottom: 12,
};
const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 8,
};
const formRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};
const helperText: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.5,
  marginTop: 8,
  fontStyle: "italic",
};
const tableStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 12,
  borderCollapse: "collapse",
};
const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  fontWeight: 500,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  opacity: 0.6,
};
const tdStyle: React.CSSProperties = { padding: "10px", verticalAlign: "top" };
const btnSmall: React.CSSProperties = {
  padding: "4px 8px",
  background: "#222",
  color: "#eee",
  border: "1px solid #333",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
};
const riskPill: React.CSSProperties = {
  padding: "2px 6px",
  borderRadius: 8,
  fontSize: 10,
  background: "#3a1a1a",
  color: "#f88",
  textTransform: "uppercase",
};
