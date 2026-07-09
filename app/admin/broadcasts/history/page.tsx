"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SendTable, { type SendRow } from "../SendTable";

const PAGE_SIZE = 20;

export default function BroadcastsHistoryPage() {
  const [sends, setSends] = useState<SendRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/broadcasts/history?limit=${PAGE_SIZE}&offset=${offset}`)
      .then((r) => r.json())
      .then((data) => {
        setSends(data.sends ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [offset]);

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Send History</h1>
        <div className="admin-page-header-actions">
          <Link href="/admin/broadcasts" className="admin-header-btn admin-header-btn-outline">
            ← Back to Broadcasts
          </Link>
        </div>
      </div>

      {loading && <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>}
      {!loading && sends.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>No broadcasts sent yet.</p>
      )}
      {!loading && sends.length > 0 && (
        <>
          <SendTable sends={sends} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="admin-header-btn admin-header-btn-outline"
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={offset === 0}
                style={{ cursor: offset === 0 ? "default" : "pointer", opacity: offset === 0 ? 0.4 : 1 }}
              >
                ← Prev
              </button>
              <button
                className="admin-header-btn admin-header-btn-outline"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total}
                style={{ cursor: offset + PAGE_SIZE >= total ? "default" : "pointer", opacity: offset + PAGE_SIZE >= total ? 0.4 : 1 }}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
