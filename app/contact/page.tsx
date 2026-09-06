"use client";

import { useState } from "react";
import SfHeader from "@/app/components/SfHeader";
import SfFooter from "@/app/components/SfFooter";
import { useOperator } from "@/app/components/OperatorContext";

const REASON_OPTIONS = [
  "General Inquiry",
  "Event Booking",
  "Sponsorship",
  "Partnership",
  "Press / Media",
  "Other",
];

export default function ContactPage() {
  const operator = useOperator();
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    company: "",
    reason: "",
    message: "",
  });
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send message");
      }

      setStatus("success");
      setForm({ fullName: "", email: "", company: "", reason: "", message: "" });
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  /* Storefront glass rebuild (step 8/8). Mockup contact screen, lines
     1761-1818: "GET IN TOUCH" eyebrow over "Contact Us", then a two-column
     row — the message form on the left, the contact/social panel on the right.

     DATA LAYER UNCHANGED: the POST to /api/contact sends the same `form`
     object, and the status/error handling is byte-identical.

     One fix that isn't styling: the info panel hardcoded "YOUR DIRECT LINE TO
     WEST 72", which rendered West 72's name on venuecore.live. It now reads
     operator.name, the same way the footer and the rest of the storefront
     already resolve branding. */
  return (
    <div className="sf-page">
      <SfHeader />

      <div className="sf-detail-title">
        <div className="sf-eyebrow">Get in touch</div>
        <h1>Contact Us</h1>
      </div>

      <div className="sf-contact-grid">
        <div className="sf-glass sf-panel">
          <h2 className="sf-panel-title">Shoot Us a Message!</h2>

          {status === "success" && (
            <div className="sf-notice sf-notice--ok">
              Your message has been sent! We&apos;ll get back to you soon.
            </div>
          )}
          {status === "error" && <div className="sf-notice sf-notice--err">{errorMsg}</div>}

          <form onSubmit={handleSubmit} className="sf-fields">
            <div>
              <label className="sf-field-label" htmlFor="fullName">Full name</label>
              <input id="fullName" name="fullName" type="text" className="sf-input"
                placeholder="Your name" value={form.fullName} onChange={handleChange} required />
            </div>

            <div>
              <label className="sf-field-label" htmlFor="email">Email address</label>
              <input id="email" name="email" type="email" className="sf-input"
                placeholder="you@company.com" value={form.email} onChange={handleChange} required />
            </div>

            <div>
              <label className="sf-field-label" htmlFor="company">Company / organization (optional)</label>
              <input id="company" name="company" type="text" className="sf-input"
                placeholder="Company name" value={form.company} onChange={handleChange} />
            </div>

            <div>
              <label className="sf-field-label" htmlFor="reason">Reason for contacting us</label>
              <select id="reason" name="reason" className="sf-input"
                value={form.reason} onChange={handleChange} required>
                <option value="" disabled>Select…</option>
                {REASON_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="sf-field-label" htmlFor="message">Your message</label>
              <textarea id="message" name="message" className="sf-input sf-textarea"
                placeholder="Tell us briefly how we can help." rows={5}
                value={form.message} onChange={handleChange} required />
            </div>

            <button type="submit" className="sf-btn sf-btn--primary sf-btn--block"
              disabled={status === "sending"}>
              {status === "sending" ? "Sending..." : "Submit"}
            </button>
          </form>
        </div>

        <div className="sf-glass sf-panel">
          <div className="sf-eyebrow">Contact</div>
          <h2 className="sf-panel-title">Your direct line to {operator.name}</h2>

          <div className="sf-contact-method">
            <div className="sf-contact-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
            </div>
            <div>
              <h3 className="sf-contact-method-title">Email Us</h3>
              <p className="sf-contact-method-desc">
                We typically respond within 1&ndash;2 business days.
              </p>
              <a href={`mailto:${operator.contactEmail}`} className="sf-contact-link">
                {operator.contactEmail}
              </a>
            </div>
          </div>

          <div className="sf-social">
            <h3 className="sf-eyebrow">Other ways to connect</h3>
            <div className="sf-social-icons">
              <a href={operator.facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
              <a href={operator.instagramUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 100-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 11-2.882 0 1.441 1.441 0 012.882 0z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>

      <SfFooter />
    </div>
  );
}
