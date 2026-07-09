"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TRANSACTIONAL_TEMPLATE_META, type TransactionalTemplateKey } from "@/lib/email/transactional-templates";

type SavedMeta = { key: string; updated_at: string; updated_by: string | null };

export default function TransactionalEmailsPage() {
  const [saved, setSaved] = useState<Record<string, SavedMeta>>({});

  useEffect(() => {
    const keys = Object.keys(TRANSACTIONAL_TEMPLATE_META) as TransactionalTemplateKey[];
    Promise.all(
      keys.map((key) =>
        fetch(`/api/email/transactional/${key}`)
          .then((r) => r.ok ? r.json() : null)
          .then((data) => data ? { key, ...data } : null),
      ),
    ).then((results) => {
      const map: Record<string, SavedMeta> = {};
      for (const r of results) {
        if (r) map[r.key] = r;
      }
      setSaved(map);
    });
  }, []);

  const keys = Object.keys(TRANSACTIONAL_TEMPLATE_META) as TransactionalTemplateKey[];

  return (
    <div className="admin-form-page">
      <Link href="/admin/broadcasts" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>
        ← Broadcasts
      </Link>
      <h1 className="admin-page-title" style={{ marginTop: 8 }}>Transactional Emails</h1>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, marginBottom: 28 }}>
        System-triggered emails sent automatically on key events. Edit the design here — changes take effect on the next send.
      </p>

      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {keys.map((key) => {
          const meta = TRANSACTIONAL_TEMPLATE_META[key];
          const s = saved[key];
          const isCustomized = !!s;

          return (
            <Link
              key={key}
              href={`/admin/broadcasts/transactional/${key}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                padding: "20px 22px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 12,
                cursor: "pointer",
                transition: "border-color 0.15s, background 0.15s",
              }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(208,194,144,0.35)";
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(208,194,144,0.04)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(255,255,255,0.08)";
                  (e.currentTarget as HTMLDivElement).style.background = "rgba(255,255,255,0.03)";
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <div style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>{meta.label}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                    padding: "3px 8px", borderRadius: 20,
                    background: isCustomized ? "rgba(208,194,144,0.15)" : "rgba(255,255,255,0.07)",
                    color: isCustomized ? "#d0c290" : "rgba(255,255,255,0.3)",
                    flexShrink: 0,
                  }}>
                    {isCustomized ? "Custom" : "Default"}
                  </span>
                </div>
                <p style={{ margin: "0 0 14px", color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.5 }}>
                  {meta.description}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
                  {meta.variables.map((v) => (
                    <code key={v} style={{
                      fontSize: 10, padding: "2px 6px", borderRadius: 4,
                      background: "rgba(208,194,144,0.08)", color: "rgba(208,194,144,0.7)",
                      fontFamily: "monospace",
                    }}>{v}</code>
                  ))}
                </div>
                {s?.updated_at && (
                  <p style={{ margin: 0, color: "rgba(255,255,255,0.25)", fontSize: 11 }}>
                    Last saved {new Date(s.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                )}
                <div style={{ marginTop: 14, color: "#d0c290", fontSize: 12, fontWeight: 600 }}>
                  Edit template →
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
