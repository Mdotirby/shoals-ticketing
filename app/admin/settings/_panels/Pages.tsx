"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { getCookie } from "@/lib/cookies";
import { GLOBAL_FAQS } from "@/lib/faqs/defaults";
import { Button, Card, Field, Pill } from "@/app/components/admin/ui";

/**
 * FAQs — the questions on /faq and under every event page.
 *
 * ── What was wrong ───────────────────────────────────────────────────────
 * Six defaults shipped in TypeScript (GLOBAL_FAQS) and the storefront chose
 * between them and the database with `rows.length > 0 ? rows : defaults`.
 * All-or-nothing. So:
 *
 *   • The defaults could be READ in the admin but never edited — they were
 *     code, not data.
 *   • Customising ONE question silently removed the other five from the
 *     public site, because one row is "> 0" and the defaults stopped being
 *     used. Nothing warned about that.
 *
 * ── What it does now ─────────────────────────────────────────────────────
 * The defaults are adopted as real rows in one action, and from then on they
 * are ordinary editable FAQs — which is what "show the defaults and edit
 * them" has to mean. Until a venue adopts them it still sees exactly what its
 * visitors see, marked as defaults rather than pretending to be its own.
 *
 * Adding a one-off FAQ before adopting is still possible, and now says what
 * it will do to the other five instead of just doing it.
 */

type FAQ = {
  id: string;
  venue_id: string;
  question: string;
  answer: string;
  sort_order: number;
  created_at: string;
};

export default function AdminFAQsPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  /** Which row is expanded for editing, and its working copy. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ question: "", answer: "" });

  /** The "add your own" form. */
  const [adding, setAdding] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });

  /**
   * Which venue's FAQs these are.
   *
   * The cookie is not always set — this panel showed "pick a venue first" and
   * nothing else whenever it was missing, which is most of the time. So fall
   * back to the venue on the signed-in user's own row, and let an owner (who
   * has every venue) choose which site they are editing.
   */
  const [venueId, setVenueId] = useState<string>(getCookie("venue-id") || "");
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const reorderTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [usersRes, venuesRes, sb] = await Promise.all([
          fetch("/api/admin/users"),
          fetch("/api/venues"),
          import("@/lib/supabase-browser"),
        ]);
        const all = await usersRes.json().catch(() => []);
        const vs = await venuesRes.json().catch(() => []);
        const { data } = await sb.getSupabaseBrowser().auth.getUser();
        if (!live) return;
        if (Array.isArray(vs)) setVenues(vs.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name })));
        const me = Array.isArray(all)
          ? all.find((u: { email?: string | null }) => u.email && u.email === data?.user?.email)
          : null;
        if (!me) return;
        setIsOwner(me.role === "owner" || me.role === "super_admin");
        setVenueId((current) => current || me.venue_id || "");
      } catch {
        /* the picker below still lets an owner choose */
      }
    })();
    return () => { live = false; };
  }, []);

  const load = useCallback(async () => {
    if (!venueId) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/faqs?venue_id=${venueId}`);
      if (res.ok) setFaqs(await res.json());
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const usingDefaults = faqs.length === 0;

  const adoptDefaults = async () => {
    setBusy(true); setError(""); setNote("");
    try {
      const res = await fetch("/api/faqs/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venueId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Could not load the defaults."); return; }
      setNote(data.seeded ? `${data.seeded} default questions are now yours to edit.` : data.reason || "");
      await load();
    } catch {
      setError("Could not load the defaults.");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (f: FAQ) => {
    setEditingId(f.id);
    setDraft({ question: f.question, answer: f.answer });
    setError("");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    if (!draft.question.trim() || !draft.answer.trim()) { setError("A question needs both a question and an answer."); return; }
    setBusy(true); setError("");
    try {
      const existing = faqs.find((f) => f.id === editingId);
      const res = await fetch(`/api/faqs/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, sort_order: existing?.sort_order ?? 0 }),
      });
      if (!res.ok) { setError("Could not save that change."); return; }
      setEditingId(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const addOwn = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) { setError("A question needs both a question and an answer."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/faqs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ venue_id: venueId, ...newFaq, sort_order: faqs.length }),
      });
      if (!res.ok) { setError("Could not add that question."); return; }
      setNewFaq({ question: "", answer: "" });
      setAdding(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this question? It comes off the public site immediately.")) return;
    await fetch(`/api/faqs/${id}`, { method: "DELETE" });
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  };

  // Drag to reorder, persisted after a pause so a drag isn't 6 round trips.
  const handleReorder = (order: FAQ[]) => {
    setFaqs(order);
    if (reorderTimeout.current) clearTimeout(reorderTimeout.current);
    reorderTimeout.current = setTimeout(() => {
      order.forEach((faq, i) =>
        fetch(`/api/faqs/${faq.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: faq.question, answer: faq.answer, sort_order: i }),
        }).catch(() => {}),
      );
    }, 600);
  };

  if (loading) {
    return <Card title="Frequently asked questions"><p className="faq-note">Loading…</p></Card>;
  }

  const venuePicker =
    isOwner && venues.length > 1 ? (
      <label className="faq-venue">
        <span>Editing</span>
        <select value={venueId} onChange={(e) => { setVenueId(e.target.value); setEditingId(null); setNote(""); }}>
          <option value="">— pick a venue —</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </label>
    ) : null;

  if (!venueId) {
    return (
      <Card title="Frequently asked questions" sub="FAQs belong to one venue's site.">
        {venuePicker ?? <p className="faq-note">No venue is attached to your account yet.</p>}
      </Card>
    );
  }

  return (
    <div className="faq-panel">
      {venuePicker}
      {error && <div className="faq-alert faq-alert--bad">{error}</div>}
      {note && <div className="faq-alert">{note}</div>}

      {usingDefaults ? (
        <Card
          title="Frequently asked questions"
          actions={<Pill>showing defaults</Pill>}
          sub="These six ship with the platform and are what your visitors see today."
        >
          <p className="faq-note">
            They live in code, so they cannot be edited where they are. Adopt them and they become
            your own questions — same wording, now yours to change, reorder or delete.
          </p>

          <div className="faq-list faq-list--readonly">
            {GLOBAL_FAQS.map((f, i) => (
              <div key={i} className="faq-row">
                <div className="faq-q">{f.question}</div>
                <div className="faq-a">{f.answer}</div>
              </div>
            ))}
          </div>

          <div className="faq-actions">
            <Button onClick={adoptDefaults} disabled={busy}>
              {busy ? "Adopting…" : "Adopt these six and edit them"}
            </Button>
            <Button variant="ghost" onClick={() => setAdding((v) => !v)}>
              {adding ? "Cancel" : "Write my own instead"}
            </Button>
          </div>

          {adding && (
            <div className="faq-edit">
              {/* The trap, stated before it springs. */}
              <p className="faq-warn">
                Your site shows the six defaults only while you have none of your own. Add a single
                question here and it becomes the <strong>only</strong> one on the site — the other
                five disappear. Adopt them first if you want to keep them.
              </p>
              <Field label="Question">
                <input value={newFaq.question} onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })} placeholder="e.g. Where do I park?" />
              </Field>
              <Field label="Answer">
                <textarea rows={4} value={newFaq.answer} onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })} />
              </Field>
              <Button onClick={addOwn} disabled={busy}>{busy ? "Adding…" : "Add question"}</Button>
            </div>
          )}
        </Card>
      ) : (
        <Card
          title="Frequently asked questions"
          actions={<Pill>{faqs.length} live</Pill>}
          sub="Shown on /faq and under every event page. Drag to reorder."
        >
          <Reorder.Group axis="y" values={faqs} onReorder={handleReorder} className="faq-list">
            {faqs.map((f) => (
              <Reorder.Item key={f.id} value={f} className="faq-row faq-row--drag">
                {editingId === f.id ? (
                  <div className="faq-edit">
                    <Field label="Question">
                      <input value={draft.question} onChange={(e) => setDraft({ ...draft, question: e.target.value })} />
                    </Field>
                    <Field label="Answer">
                      <textarea rows={4} value={draft.answer} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} />
                    </Field>
                    <div className="faq-actions">
                      <Button onClick={saveEdit} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                      <Button variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="faq-grip" aria-hidden="true">⠿</span>
                    <div className="faq-body">
                      <div className="faq-q">{f.question}</div>
                      <div className="faq-a">{f.answer}</div>
                    </div>
                    <div className="faq-row-actions">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(f)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(f.id)}>Delete</Button>
                    </div>
                  </>
                )}
              </Reorder.Item>
            ))}
          </Reorder.Group>

          <div className="faq-actions">
            <Button variant="outline" onClick={() => setAdding((v) => !v)}>
              {adding ? "Cancel" : "+ Add a question"}
            </Button>
          </div>

          {adding && (
            <div className="faq-edit">
              <Field label="Question">
                <input value={newFaq.question} onChange={(e) => setNewFaq({ ...newFaq, question: e.target.value })} placeholder="e.g. Where do I park?" />
              </Field>
              <Field label="Answer">
                <textarea rows={4} value={newFaq.answer} onChange={(e) => setNewFaq({ ...newFaq, answer: e.target.value })} />
              </Field>
              <Button onClick={addOwn} disabled={busy}>{busy ? "Adding…" : "Add question"}</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
