"use client";

export type SendRow = {
  id: string;
  triggerType: string;
  eventTitle: string | null;
  sentAt: string;
  recipientCount: number;
  opens: number;
  clicks: number;
  openRate: number | null;
  clickRate: number | null;
  revenue: number;
};

const TRIGGER_LABELS: Record<string, string> = {
  new_event_announcement: "Event Announcement",
  upcoming_events_digest: "Upcoming Events Digest",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatPercent(n: number | null) {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

export default function SendTable({ sends }: { sends: SendRow[] }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.03)", textAlign: "left" }}>
            {["Sent", "Type", "Event", "Recipients", "Open Rate", "Click Rate", "Revenue"].map((h) => (
              <th key={h} style={{ padding: "10px 14px", color: "rgba(255,255,255,0.4)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sends.map((s) => (
            <tr key={s.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.7)" }}>{formatDate(s.sentAt)}</td>
              <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.7)" }}>{TRIGGER_LABELS[s.triggerType] ?? s.triggerType}</td>
              <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.7)" }}>{s.eventTitle ?? "—"}</td>
              <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.7)" }}>{s.recipientCount}</td>
              <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.7)" }}>{formatPercent(s.openRate)}</td>
              <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.7)" }}>{formatPercent(s.clickRate)}</td>
              <td style={{ padding: "10px 14px", color: "rgba(255,255,255,0.7)" }}>${s.revenue.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
