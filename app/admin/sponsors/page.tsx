"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sponsor } from "@/lib/types/sponsor";

const TIER_LABELS: Record<string, string> = {
  title: "🏆 Title",
  presenting: "⭐ Presenting",
  supporting: "🤝 Supporting",
};

export default function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sponsors")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSponsors(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this sponsor?")) return;

    const res = await fetch(`/api/sponsors/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSponsors((prev) => prev.filter((s) => s.id !== id));
    }
  };

  return (
    <div className="admin-form-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">Sponsors</h1>
        <Link href="/admin/sponsors/new" className="admin-header-btn">
          + New Sponsor
        </Link>
      </div>

      {loading && (
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      )}

      {!loading && sponsors.length === 0 && (
        <p style={{ color: "rgba(255,255,255,0.4)" }}>
          No sponsors yet. Click &quot;+ New Sponsor&quot; to add one.
        </p>
      )}

      {!loading && sponsors.length > 0 && (
        <div className="admin-sponsors-list">
          {sponsors.map((s) => (
            <div key={s.id} className="admin-sponsor-card">
              <div className="admin-sponsor-info">
                {s.logo_url && (
                  <img
                    src={s.logo_url}
                    alt={s.name}
                    className="admin-sponsor-logo"
                  />
                )}
                <div>
                  <h3 className="admin-sponsor-name">{s.name}</h3>
                  <span className="admin-sponsor-tier">
                    {TIER_LABELS[s.tier] || s.tier}
                  </span>
                  {s.website_url && (
                    <a
                      href={s.website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="admin-sponsor-url"
                    >
                      {s.website_url}
                    </a>
                  )}
                </div>
              </div>
              <div className="admin-sponsor-actions">
                <Link
                  href={`/admin/sponsors/${s.id}/edit`}
                  className="admin-sponsor-edit-btn"
                >
                  Edit
                </Link>
                <button
                  className="admin-sponsor-delete-btn"
                  onClick={() => handleDelete(s.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
