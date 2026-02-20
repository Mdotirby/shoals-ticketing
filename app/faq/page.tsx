"use client";

import FAQAccordion from "../components/FAQAccordion";
import Footer from "../components/Footer";

export default function FAQPage() {
  return (
    <>
      <main className="faq-page">
        {/* ── HERO BANNER ── */}
        <section className="contact-hero">
          <h1 className="contact-hero-title">FREQUENTLY ASKED QUESTIONS</h1>
        </section>

        {/* ── FAQ CONTENT ── */}
        <section className="faq-page-content">
          <div className="faq-page-inner">
            <FAQAccordion />
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
