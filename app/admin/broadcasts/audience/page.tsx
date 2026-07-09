"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function BroadcastAudiencePage() {
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [segmentId, setSegmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; total: number } | null>(null);
  const [error, setError] = useState("");

  function loadAudience() {
    setLoading(true);
    fetch("/api/broadcasts/audience")
      .then((r) => r.json())
      .then((data) => {
        setSubscriberCount(data.subscriberCount ?? 0);
        setSegmentId(data.segmentId ?? null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadAudience(); }, []);

  async function handleSync() {
    setSyncing(true);
    setError("");
    setSyncResult(null);
    try {
      const res = await fetch("/api/broadcasts/audience/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Sync failed");
        return;
      }
      setSyncResult(data);
      loadAudience();
    } catch {
      setError("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Audience</h1>
        <div className="admin-page-header-actions">
          <Link href="/admin/broadcasts" className="admin-header-btn admin-header-btn-outline">
            ← Back to Broadcasts
          </Link>
        </div>
      </div>

      <div style={{
        background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10, padding: "24px 26px", maxWidth: 480,
      }}>
        <p style={{ margin: "0 0 4px", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, color: "rgba(255,255,255,0.4)" }}>
          Newsletter Subscribers
        </p>
        <p style={{ margin: "0 0 18px", fontSize: 32, fontWeight: 700, color: "#fff" }}>
          {loading ? "…" : subscriberCount}
        </p>

        {segmentId && (
          <p style={{ margin: "0 0 18px", fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
            Resend segment: {segmentId}
          </p>
        )}

        <button
          onClick={handleSync}
          disabled={syncing}
          className="admin-header-btn"
          style={{ cursor: syncing ? "default" : "pointer" }}
        >
          {syncing ? "Syncing…" : "Sync Now"}
        </button>

        {syncResult && (
          <div className="admin-form-success" style={{ marginTop: 14 }}>
            Synced — {syncResult.created} created, {syncResult.updated} updated, {syncResult.total} total.
          </div>
        )}
        {error && (
          <div className="admin-form-error" style={{ marginTop: 14 }}>
            {error}
          </div>
        )}

        <p style={{ margin: "18px 0 0", fontSize: 12, color: "rgba(255,255,255,0.3)", lineHeight: 1.5 }}>
          Syncing pushes every subscribed newsletter contact into Resend. Unsubscribes are managed by Resend from there on — this only ever adds contacts.
        </p>
      </div>
    </div>
  );
}
