"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import { getCookie } from "@/lib/cookies";
import { GLOBAL_FAQS } from "@/app/components/FAQAccordion";

type FAQ = {
  id: string;
  venue_id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
};

const GOLD = "#d0c290";
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const card: React.CSSProperties = {
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(208,194,144,0.12)",
  borderRadius: 10,
  padding: "18px 20px",
};
const inp: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 16,
  boxSizing: "border-box",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600,
  color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
  letterSpacing: "0.5px", marginBottom: 6,
};
const btnPrimary: React.CSSProperties = {
  background: GOLD, color: "#0b0d1d", border: "none", borderRadius: 8,
  padding: "10px 20px", fontWeight: 700, cursor: "pointer", fontSize: 14,
};
const btnSecondary: React.CSSProperties = {
  background: "transparent", color: GOLD, border: `1px solid ${GOLD}`,
  borderRadius: 8, padding: "10px 20px", fontWeight: 600,
  cursor: "pointer", fontSize: 14,
};
const btnDanger: React.CSSProperties = {
  background: "transparent", color: "#ef4444",
  border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8,
  padding: "6px 14px", fontWeight: 600, cursor: "pointer", fontSize: 12,
};

function emptyForm() {
  return { question: "", answer: "" };
}

export default function AdminFAQsPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const venueId = getCookie("venue-id") || "";
  const reorderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = async () => {
    if (!venueId) return;
    const res = await fetch(`/api/faqs?venue_id=${venueId}`);
    if (res.ok) setFaqs(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (faq: FAQ) => {
    setEditingId(faq.id);
    setForm({ question: faq.question, answer: faq.answer });
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setError("");
  };

  const handleSave = async () => {
    if (!form.question.trim() || !form.answer.trim()) {
      setError("Both question and answer are required.");
      return;
    }
    setSaving(true); setError("");
    try {
      if (editingId) {
        const existing = faqs.find(f => f.id === editingId);
        await fetch(`/api/faqs/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, sort_order: existing?.sort_order ?? 0 }),
        });
      } else {
        await fetch("/api/faqs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venue_id: venueId, ...form, sort_order: faqs.length }),
        });
      }
      cancel();
      await load();
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this FAQ?")) return;
    await fetch(`/api/faqs/${id}`, { method: "DELETE" });
    setFaqs(prev => prev.filter(f => f.id !== id));
  };

  // Persist new order after drag
  const handleReorder = (newOrder: FAQ[]) => {
    setFaqs(newOrder);
    if (reorderTimeout.current) clearTimeout(reorderTimeout.current);
    reorderTimeout.current = setTimeout(async () => {
      await Promise.all(
        newOrder.map((faq, i) =>
          fetch(`/api/faqs/${faq.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: faq.question, answer: faq.answer, sort_order: i }),
          })
        )
      );
    }, 600);
  };

  const usingDefaults = faqs.length === 0;

  return (
    <div className="admin-form-page">
      <motion.div
        className="admin-page-header"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div>
          <h1 className="admin-page-title">FAQ Content</h1>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, margin: "4px 0 0" }}>
            {usingDefaults
              ? "No custom FAQs yet — global defaults are showing on your site."
              : `${faqs.length} custom FAQ${faqs.length !== 1 ? "s" : ""} — drag to reorder.`}
          </p>
        </div>
        {!showForm && (
          <motion.button
            onClick={openNew}
            style={btnPrimary}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            + Add FAQ
          </motion.button>
        )}
      </motion.div>

      {/* Global defaults notice */}
      {usingDefaults && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4, ease: EASE }}
          style={{ ...card, marginBottom: 20, borderColor: "rgba(208,194,144,0.2)" }}
        >
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, margin: "0 0 12px" }}>
            Your site currently shows these global defaults. Add a custom FAQ above to override them.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {GLOBAL_FAQS.map((faq, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600, margin: 0 }}>{faq.question}</p>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: "4px 0 0", lineHeight: 1.5 }}>{faq.answer}</p>
                </div>
                <motion.button
                  onClick={() => {
                    setForm({ question: faq.question, answer: faq.answer });
                    setEditingId(null);
                    setShowForm(true);
                  }}
                  style={{ ...btnSecondary, fontSize: 12, padding: "6px 14px", flexShrink: 0 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Customise
                </motion.button>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Add / Edit form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            style={{ overflow: "hidden", marginBottom: 20 }}
          >
            <div style={{ ...card, border: "1px solid rgba(208,194,144,0.3)" }}>
              <h3 style={{ color: GOLD, margin: "0 0 16px", fontSize: 15 }}>
                {editingId ? "Edit FAQ" : "New FAQ"}
              </h3>
              {error && (
                <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{error}</p>
              )}
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Question</label>
                <input
                  style={inp}
                  value={form.question}
                  onChange={e => setForm(p => ({ ...p, question: e.target.value }))}
                  placeholder="e.g. What is your refund policy?"
                  autoFocus
                />
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={lbl}>Answer</label>
                <textarea
                  style={{ ...inp, minHeight: 100, resize: "vertical", lineHeight: 1.6 }}
                  value={form.answer}
                  onChange={e => setForm(p => ({ ...p, answer: e.target.value }))}
                  placeholder="Write your answer here…"
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <motion.button
                  onClick={handleSave}
                  disabled={saving}
                  style={btnPrimary}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {saving ? "Saving…" : editingId ? "Update FAQ" : "Save FAQ"}
                </motion.button>
                <button onClick={cancel} style={{ ...btnSecondary, color: "rgba(255,255,255,0.5)", borderColor: "rgba(255,255,255,0.15)" }}>
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAQ list — draggable to reorder */}
      {loading && (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Loading…</p>
      )}

      {!loading && faqs.length > 0 && (
        <Reorder.Group axis="y" values={faqs} onReorder={handleReorder} style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <AnimatePresence>
            {faqs.map((faq, i) => (
              <Reorder.Item key={faq.id} value={faq} style={{ cursor: "grab" }}>
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.3, ease: EASE } }}
                  exit={{ opacity: 0, x: -20 }}
                  style={card}
                  whileHover={{ borderColor: "rgba(208,194,144,0.25)" }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {/* Drag handle */}
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: 18, lineHeight: 1, paddingTop: 2, flexShrink: 0, cursor: "grab" }}>
                      ⠿
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ color: "#fff", fontWeight: 600, fontSize: 14, margin: "0 0 6px", lineHeight: 1.4 }}>
                        {faq.question}
                      </p>
                      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                        {faq.answer}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => openEdit(faq)} style={{ ...btnSecondary, fontSize: 12, padding: "6px 14px" }}>Edit</button>
                      <button onClick={() => handleDelete(faq.id)} style={btnDanger}>Delete</button>
                    </div>
                  </div>
                </motion.div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
      )}
    </div>
  );
}
