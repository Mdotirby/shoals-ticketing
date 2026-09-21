"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCookie } from "@/lib/cookies";

/**
 * Command Center sections from handoff/screens/dashboard.dc.html that the
 * main dashboard didn't have: the next 14 nights with their sales pace,
 * receivables aging, and ancillary revenue. Data from
 * /api/admin/dashboard/extras, scoped to the same venue cookie the rest of
 * the dashboard uses. Styled with the page's own cc-* classes.
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

type Extras = {
  nights: Night[];
  aging: { label: string; value: number }[];
  ancillary: { merchSplits: number; merchEvents: number; feesRetained: number };
};

const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function DashExtras({ monthName }: { monthName: string }) {
  const [data, setData] = useState<Extras | null>(null);

  useEffect(() => {
    const venueId = getCookie("venue-id");
    fetch(`/api/admin/dashboard/extras${venueId ? `?venue_id=${venueId}` : ""}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return null;
  const agingMax = Math.max(1, ...data.aging.map((a) => a.value));
  const agingTotal = data.aging.reduce((t, a) => t + a.value, 0);

  return (
    <div className="cc-lower dx-row">
      {/* Next 14 nights — sales progress */}
      <div className="cc-card dx-nights">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="cc-eyebrow">Next 14 nights — sales progress</div>
          <span style={{ flex: 1 }} />
          <Link href="/admin/calendar" style={{ fontSize: 10.5, color: "var(--cc-w50)", textDecoration: "none" }}>
            Calendar →
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
        <div className="cc-note" style={{ marginTop: 12 }}>
          {agingTotal > 0 ? `${usd(agingTotal)} outstanding.` : "No open balances — every invoice is paid, void or not yet due."}
        </div>
        <Link href="/admin/invoices" style={{ fontSize: 10.5, color: "var(--cc-w50)", textDecoration: "none", display: "inline-block", marginTop: 8 }}>
          Invoices →
        </Link>
      </div>

      {/* Ancillary — native */}
      <div className="cc-card">
        <div className="cc-eyebrow">Ancillary — {monthName}</div>
        <div className="dx-anc">
          <div>
            <span className="cc-kpi-label">Merch splits</span>
            <strong>{usd(data.ancillary.merchSplits)}</strong>
            <em>{data.ancillary.merchEvents} settled show{data.ancillary.merchEvents === 1 ? "" : "s"}</em>
          </div>
          <div>
            <span className="cc-kpi-label">Fees retained</span>
            <strong>{usd(data.ancillary.feesRetained)}</strong>
            <em>service + facility, net of refunds</em>
          </div>
        </div>
        <div className="cc-note" style={{ marginTop: 12 }}>
          Bar and concession sales aren&apos;t recorded in the platform yet, so they&apos;re not shown here.
        </div>
      </div>
    </div>
  );
}
