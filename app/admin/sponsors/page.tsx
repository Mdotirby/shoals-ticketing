"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Sponsor } from "@/lib/types/sponsor";

const TIER_LABELS: Record<string, string> = {
  title: "Title",
  presenting: "Presenting",
  supporting: "Supporting",
};

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE, delay: i * 0.06 },
  }),
  exit: { opacity: 0, y: -10, transition: { duration: 0.2 } },
};

export default function AdminSponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/sponsors")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSponsors(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this partner?")) return;
    const res = await fetch(`/api/sponsors/${id}`, { method: "DELETE" });
    if (res.ok) setSponsors((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="admin-form-page">
      <motion.div
        className="admin-page-header"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <h1 className="admin-page-title">Partners</h1>
        <Link href="/admin/sponsors/new" className="admin-header-btn">
          + New Partner
        </Link>
      </motion.div>

      {loading && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          Loading…
        </motion.p>
      )}

      {!loading && sponsors.length === 0 && (
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          No partners yet. Click &quot;+ New Partner&quot; to add one.
        </motion.p>
      )}

      {!loading && sponsors.length > 0 && (
        <div className="admin-sponsors-list">
          <AnimatePresence mode="popLayout">
            {sponsors.map((s, i) => (
              <motion.div
                key={s.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                layout
                className="admin-sponsor-card"
                whileHover={{ scale: 1.01, transition: { duration: 0.18 } }}
              >
                <div className="admin-sponsor-info">
                  {s.logo_url && (
                    <img
                      src={s.logo_url}
                      alt={s.sponsor_name}
                      className="admin-sponsor-logo"
                    />
                  )}
                  <div>
                    <h3 className="admin-sponsor-name">{s.sponsor_name}</h3>
                    {s.client_name && (
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", margin: "2px 0 0", fontStyle: "italic" }}>
                        {s.client_name}
                      </p>
                    )}
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
                    {s.display_on_homepage && (
                      <span style={{ display: "inline-block", marginLeft: 8, fontSize: 10, color: "#d0c290", fontWeight: 600 }}>
                        ● Homepage
                      </span>
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
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
