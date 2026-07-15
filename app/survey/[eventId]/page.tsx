"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function SurveyPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const [eventTitle, setEventTitle] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    overall_rating: 0,
    would_return: null as boolean | null,
    feedback: "",
    age_range: "",
    gender: "",
    customer_email: "",
  });

  useEffect(() => {
    // Fetch event title for display
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((d) => { if (d?.title) setEventTitle(d.title); })
      .catch(() => {});
  }, [eventId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, ...form }),
      });
      if (res.ok) setSubmitted(true);
    } finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <h1 style={{ color: "#d0c290", fontSize: 28, margin: "0 0 12px", textAlign: "center" }}>Thank You!</h1>
          <p style={{ color: "rgba(255,255,255,0.6)", textAlign: "center", fontSize: 15 }}>
            Your feedback helps us make better shows. See you next time!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h1 style={{ color: "#d0c290", fontSize: 24, margin: "0 0 4px", textAlign: "center" }}>Post-Show Survey</h1>
        {eventTitle && <p style={{ color: "rgba(255,255,255,0.5)", textAlign: "center", fontSize: 14, margin: "0 0 24px" }}>{eventTitle}</p>}

        <form onSubmit={handleSubmit}>
          {/* Question 1: Rating */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>How was your experience?</label>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setForm({ ...form, overall_rating: n })}
                  style={{
                    width: 48, height: 48, borderRadius: "50%", border: "none", cursor: "pointer",
                    fontSize: 18, fontWeight: 700,
                    background: form.overall_rating >= n ? "#d0c290" : "rgba(255,255,255,0.08)",
                    color: form.overall_rating >= n ? "#0b0d1d" : "rgba(255,255,255,0.4)",
                    transition: "all 0.2s",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>1 = Poor, 5 = Amazing</p>
          </div>

          {/* Question 2: Would return */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Would you come to another show here?</label>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {[{ label: "Yes!", value: true }, { label: "Maybe", value: null }, { label: "No", value: false }].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setForm({ ...form, would_return: opt.value })}
                  style={{
                    padding: "10px 24px", borderRadius: 8, border: "none", cursor: "pointer",
                    fontSize: 14, fontWeight: 600,
                    background: form.would_return === opt.value ? "rgba(208,194,144,0.2)" : "rgba(255,255,255,0.05)",
                    color: form.would_return === opt.value ? "#d0c290" : "rgba(255,255,255,0.5)",
                    borderColor: form.would_return === opt.value ? "rgba(208,194,144,0.3)" : "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderStyle: "solid",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Question 3: Feedback */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Any feedback? (optional)</label>
            <textarea
              value={form.feedback}
              onChange={(e) => setForm({ ...form, feedback: e.target.value })}
              style={inputStyle}
              rows={3}
              placeholder="What did you love? What could be better?"
            />
          </div>

          {/* Optional demographics */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 20, marginBottom: 20 }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 1 }}>Optional</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ ...labelStyle, fontSize: 12 }}>Age Range</label>
                <select value={form.age_range} onChange={(e) => setForm({ ...form, age_range: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  <option value="18-24">18-24</option>
                  <option value="25-34">25-34</option>
                  <option value="35-44">35-44</option>
                  <option value="45-54">45-54</option>
                  <option value="55-64">55-64</option>
                  <option value="65+">65+</option>
                </select>
              </div>
              <div>
                <label style={{ ...labelStyle, fontSize: 12 }}>Gender</label>
                <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} style={inputStyle}>
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non_binary">Non-binary</option>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                </select>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || form.overall_rating === 0}
            style={{
              width: "100%", padding: "14px 0",
              background: form.overall_rating > 0 ? "linear-gradient(135deg, #d0c290, #b8a66e)" : "rgba(255,255,255,0.05)",
              color: form.overall_rating > 0 ? "#0b0d1d" : "rgba(255,255,255,0.3)",
              fontWeight: 700, fontSize: 14,
              border: "none", borderRadius: 8, cursor: form.overall_rating > 0 ? "pointer" : "default",
            }}
          >
            {loading ? "Submitting..." : "Submit Survey"}
          </button>
        </form>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0d1d",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const cardStyle: React.CSSProperties = {
  background: "#131629",
  border: "1px solid rgba(208,194,144,0.15)",
  borderRadius: 16,
  padding: "32px 28px",
  maxWidth: 480,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "rgba(255,255,255,0.6)",
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 8,
  textAlign: "center",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  color: "#fff",
  fontSize: 16,
  outline: "none",
  boxSizing: "border-box",
};
