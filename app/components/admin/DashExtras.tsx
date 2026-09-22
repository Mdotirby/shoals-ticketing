"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

/**
 * Rows two to four of the Command Center, in handoff/screens/dashboard.dc.html
 * order: the cash-position KPIs; Money in motion beside Receivables aging; and
 * the next 14 nights beside Needs a decision and Ancillary. Data from
 * /api/admin/dashboard/extras, scoped to the same venue cookie the rest of the
 * dashboard uses. The decision queue is built by the page from its own data
 * and passed in.
 *
 * Every mockup slot keeps its place. Where nothing in the system records the
 * figure (unrestricted cash, earned-unbilled, banked, settlement payables,
 * deposit lag) the slot says "Not tracked yet" instead of estimating one.
 */

type Night = {
  id: string;
  title: string;
  date: string;
  kind: "Show" | "Rental" | "Hold";
  venue: string | null;
  deal: string | null;
  sold: number;
  capacity: number;
  pace: number | null;
  gross: number;
};

type Cash = {
  depositsHeld: number;
  depositEvents: number;
  receivables: number;
  receivableCount: number;
  collectible7: number;
  collectible7Count: number;
  avgDaysToCollect: number | null;
  paidInvoices: number;
};

type Extras = {
  nights: Night[];
  aging: { label: string; value: number }[];
  ancillary: { merchSplits: number; merchEvents: number; feesRetained: number };
  cash: Cash;
};

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export default function DashExtras({ monthName, decisions }: { monthName: string; decisions: React.ReactNode }) {
  const [data, setData] = useState<Extras | null>(null);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    fetch(`/api/admin/dashboard/extras${venueId ? `?venue_id=${venueId}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const cash = data.cash;
  const agingMax = Math.max(1, ...data.aging.map((a) => a.value));
  const agingTotal = data.aging.reduce((t, a) => t + a.value, 0);
  const aged60 = data.aging.slice(3).reduce((t, a) => t + a.value, 0);

  const kpis: Array<{ icon: string; label: string; value: string | null; delta?: string; note: string; bar?: number }> = [
    {
      icon: "$",
      label: "Unrestricted cash",
      value: null,
      note: "Needs a bank balance, which nothing in the platform reads yet.",
    },
    {
      icon: "◆",
      label: "Deposits held in trust",
      value: usd(cash.depositsHeld),
      delta: cash.depositEvents ? plural(cash.depositEvents, "event") : undefined,
      note: "Paid on invoices for events still ahead — held, not yet earned.",
    },
    {
      icon: "▣",
      label: "Receivables outstanding",
      value: usd(cash.receivables),
      delta: aged60 > 0 ? `${usd(aged60)} > 60d` : undefined,
      note: cash.receivableCount ? `${plural(cash.receivableCount, "open invoice")} with a balance.` : "No open balances on sent invoices.",
      bar: cash.receivables > 0 ? (cash.collectible7 / cash.receivables) * 100 : 0,
    },
    {
      icon: "✓",
      label: "Collectible in 7 days",
      value: usd(cash.collectible7),
      delta: cash.collectible7Count ? plural(cash.collectible7Count, "invoice") : undefined,
      note: "Open balances due in the next week, overdue included.",
      bar: cash.receivables > 0 ? (cash.collectible7 / cash.receivables) * 100 : 0,
    },
  ];

  const motionMax = Math.max(1, cash.depositsHeld, cash.receivables, cash.collectible7);
  const motion: Array<{ label: string; value: number | null; fill: string }> = [
    { label: "Deposits held", value: cash.depositsHeld, fill: "repeating-linear-gradient(115deg, rgba(255,255,255,0.55) 0 5px, rgba(255,255,255,0.26) 5px 10px)" },
    { label: "Earned, unbilled", value: null, fill: "" },
    { label: "Invoiced", value: cash.receivables, fill: "linear-gradient(90deg, rgba(255,255,255,0.72), rgba(255,255,255,0.4))" },
    { label: "Collectible ≤7d", value: cash.collectible7, fill: "linear-gradient(90deg, #8fd6a8, rgba(143,214,168,0.45))" },
    { label: "Banked this month", value: null, fill: "" },
  ];

  return (
    <>
      {/* ── Cash position ── */}
      <div className="cc-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="cc-card">
            <div className="cc-kpi-icon">{k.icon}</div>
            <div className="cc-kpi-label">{k.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
              {k.value === null ? (
                <div className="cc-kpi-value dx-untracked">Not tracked yet</div>
              ) : (
                <div className="cc-kpi-value">{k.value}</div>
              )}
              {k.delta && <div className="cc-kpi-delta" style={{ color: "var(--cc-w40)" }}>{k.delta}</div>}
            </div>
            <div className="cc-note" style={{ marginTop: 9 }}>{k.note}</div>
            {k.bar !== undefined && (
              <div className="cc-bar" style={{ marginTop: 12 }}>
                <span style={{ width: `${Math.min(100, Math.max(0, k.bar))}%`, background: "rgba(255,255,255,0.7)" }} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Money in motion + Receivables aging ── */}
      <div className="cc-lower dx-row2">
        <div className="cc-card">
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <div className="cc-eyebrow">Money in motion</div>
            <div style={{ fontSize: 10.5, color: "var(--cc-w32)" }}>held → earned → collectible → banked</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
            {motion.map((m) => (
              <div key={m.label} className="cc-motion-row">
                <div className="cc-motion-label">{m.label}</div>
                {m.value === null ? (
                  <div className="dx-untracked-track">Not tracked yet</div>
                ) : (
                  <div className="cc-motion-track">
                    <span style={{ width: `${Math.min(100, (m.value / motionMax) * 100)}%`, background: m.fill }} />
                  </div>
                )}
                <div className="cc-motion-value">{m.value === null ? "—" : usd(m.value)}</div>
              </div>
            ))}
          </div>
          <div className="cc-split" style={{ marginTop: 18, paddingTop: 15, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
            <div>
              <div className="cc-split-label">Settlement payables due</div>
              <div className="cc-split-value dx-untracked">Not tracked yet</div>
              <div className="cc-split-sub">artist payouts aren&apos;t recorded</div>
            </div>
            <div>
              <div className="cc-split-label">Avg days to collect</div>
              <div className="cc-split-value">{cash.avgDaysToCollect === null ? "—" : cash.avgDaysToCollect}</div>
              <div className="cc-split-sub">
                {cash.avgDaysToCollect === null ? "no paid invoices yet" : `sent → paid, ${plural(cash.paidInvoices, "invoice")}`}
              </div>
            </div>
            <div>
              <div className="cc-split-label">Deposit → earned lag</div>
              <div className="cc-split-value dx-untracked">Not tracked yet</div>
            </div>
          </div>
        </div>

        {/* Receivables aging */}
        <div className="cc-card">
          <div className="cc-eyebrow">Receivables aging</div>
          <div style={{ fontSize: 10.5, color: "var(--cc-w32)", marginTop: 3 }}>open invoice balances by days past due</div>
          <div className="dx-aging">
            {data.aging.map((a, i) => (
              <div key={a.label} className="dx-aging-col">
                <span className="dx-aging-val">{a.value ? usd(a.value) : "—"}</span>
                <span
                  className="dx-aging-bar"
                  style={{
                    height: `${Math.max(3, (a.value / agingMax) * 110)}px`,
                    background: i === 0 ? "linear-gradient(180deg, #8fd6a8, rgba(143,214,168,0.35))" : i >= 3 ? "repeating-linear-gradient(45deg, oklch(0.72 0.13 22) 0 4px, oklch(0.48 0.10 22) 4px 8px)" : "rgba(255,255,255,0.45)",
                    opacity: a.value ? 1 : 0.25,
                  }}
                />
                <span className="dx-aging-label">{a.label}</span>
              </div>
            ))}
          </div>
          <div className="dx-callout">
            {agingTotal > 0
              ? aged60 > 0
                ? `${usd(aged60)} has aged past 60 days of ${usd(agingTotal)} outstanding.`
                : `${usd(agingTotal)} outstanding, none of it past 60 days.`
              : "No open balances — every sent invoice is paid or void."}
          </div>
          <Link href="/admin/invoices" style={{ fontSize: 10.5, color: "var(--cc-w50)", textDecoration: "none", display: "inline-block", marginTop: 10 }}>
            Invoices →
          </Link>
        </div>
      </div>

      {/* ── Next 14 nights + Needs a decision / Ancillary ── */}
      <div className="cc-lower dx-row3">
        <div className="cc-card dx-nights">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="cc-eyebrow">Next 14 nights — sales progress</div>
            <span style={{ flex: 1 }} />
            <Link href="/admin/calendar" style={{ fontSize: 10.5, color: "var(--cc-w50)", textDecoration: "none" }}>
              View all →
            </Link>
          </div>
          {data.nights.length === 0 && <div className="cc-note" style={{ marginTop: 14 }}>Nothing on the books for the next two weeks.</div>}
          <div className="dx-night-list">
            {data.nights.map((n) => {
              const d = new Date(n.date);
              const pace = n.pace ?? 0;
              return (
                <Link key={n.id} href={`/admin/events/${n.id}`} className="dx-night">
                  <div className="dx-date">
                    <strong>{d.getDate()}</strong>
                    <span>{d.toLocaleDateString("en-US", { month: "short" })}</span>
                  </div>
                  <div className="dx-night-main">
                    <div className="dx-night-title">
                      <span>{n.title}</span>
                      <em className={`dx-kind dx-kind--${n.kind.toLowerCase()}`}>{n.kind}</em>
                    </div>
                    <div className="cc-twhen">{n.deal ?? (n.kind === "Rental" ? "Private rental" : "No signed offer linked")}</div>
                    {n.capacity > 0 && (
                      <div className="cc-bar" style={{ marginTop: 7 }}>
                        <span
                          style={{
                            width: `${Math.min(100, pace)}%`,
                            background: pace >= 85 ? "var(--cc-good)" : pace < 25 ? "var(--cc-warn)" : "rgba(255,255,255,0.7)",
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="dx-night-nums">
                    <div className="cc-tnum">{n.capacity > 0 ? `${n.sold.toLocaleString()} / ${n.capacity.toLocaleString()}` : "—"}</div>
                    <div className="cc-tgross">{n.gross ? usd(n.gross) : ""}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="dx-side">
          {decisions}

          {/* Ancillary — native */}
          <div className="cc-card">
            <div className="cc-eyebrow">Ancillary — {monthName}</div>
            <div className="cc-note" style={{ marginTop: 6 }}>
              Tickets sell in-house, so merch splits and fees post to the event ledger on their own.
            </div>
            <div className="dx-anc">
              <div>
                <span className="cc-kpi-label">Merch splits</span>
                <strong>{usd(data.ancillary.merchSplits)}</strong>
                <em>{plural(data.ancillary.merchEvents, "settled show")}</em>
              </div>
              <div>
                <span className="cc-kpi-label">Fees retained</span>
                <strong>{usd(data.ancillary.feesRetained)}</strong>
                <em>service + facility, net of refunds</em>
              </div>
              <div>
                <span className="cc-kpi-label">Bar &amp; concessions</span>
                <strong className="dx-untracked">Not tracked yet</strong>
                <em>no bar or concession sales are recorded</em>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
