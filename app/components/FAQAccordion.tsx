"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type FAQItem = {
  question: string;
  answer: string;
};

export const GLOBAL_FAQS: FAQItem[] = [
  {
    question: "What is your refund policy?",
    answer:
      "All sales are final. Refunds are only issued if the event is cancelled by the organizer. In the event of a cancellation, you will be automatically refunded to your original payment method within 5–10 business days.",
  },
  {
    question: "What time do doors open?",
    answer:
      "Doors typically open 1 hour before the scheduled show time. Check your specific event page for the exact door time.",
  },
  {
    question: "Can I transfer my ticket to someone else?",
    answer:
      "Yes, tickets can be transferred to another person up until the event start time. Log in to your ticket page and use the transfer option to send your ticket via email.",
  },
  {
    question: "Is there parking available?",
    answer:
      "Parking availability varies by venue. We recommend arriving early and checking the venue website for nearby parking options. Rideshare drop-off is available at all venues.",
  },
  {
    question: "Will I receive my ticket immediately?",
    answer:
      "Yes. After checkout you will receive a confirmation email with your QR code ticket(s) attached. Tickets are also accessible via your order confirmation link.",
  },
  {
    question: "Is this event age-restricted?",
    answer:
      "Age restrictions vary by event. Check the event details section above for any age requirements. Valid ID may be required at the door.",
  },
];

type FAQAccordionProps = {
  faqs?: FAQItem[];
};

export default function FAQAccordion({ faqs }: FAQAccordionProps) {
  const items = faqs && faqs.length > 0 ? faqs : GLOBAL_FAQS;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const midpoint = Math.ceil(items.length / 2);
  const leftColumn = items.slice(0, midpoint);
  const rightColumn = items.slice(midpoint);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const renderItem = (item: FAQItem, index: number) => (
    <div
      key={index}
      className={`faq-card ${openIndex === index ? "faq-card-open" : ""}`}
    >
      <button
        type="button"
        className="faq-card-question"
        onClick={() => toggle(index)}
        aria-expanded={openIndex === index}
      >
        <span className="faq-card-question-text">{item.question}</span>
        <svg
          className="faq-card-chevron"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <AnimatePresence initial={false}>
        {openIndex === index && (
          <motion.div
            className="faq-card-answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <p className="faq-card-answer-text">{item.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <section className="faq-section">
      <span className="faq-section-label">FAQ</span>
      <h2 className="faq-section-heading">Frequently Asked Questions</h2>
      <div className="faq-cards-grid">
        <div className="faq-cards-column">
          {leftColumn.map((item, i) => renderItem(item, i))}
        </div>
        <div className="faq-cards-column">
          {rightColumn.map((item, i) => renderItem(item, i + midpoint))}
        </div>
      </div>
    </section>
  );
}
