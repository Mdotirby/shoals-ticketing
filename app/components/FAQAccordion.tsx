"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

type FAQItem = {
  question: string;
  answer: string;
};

const defaultFAQs: FAQItem[] = [
  {
    question: "What is your refund policy?",
    answer:
      "We offer full refunds up to 30 days before the event. After that, tickets are non-refundable but may be transferred to another person. Please contact us at tickets@west72entertainment.com for refund requests.",
  },
  {
    question: "Are meals or refreshments included?",
    answer:
      "Food and beverages are available for purchase at the venue. VIP ticket holders receive complimentary drinks and access to the VIP lounge area with a dedicated bar and food options.",
  },
  {
    question: "Can I upgrade my ticket?",
    answer:
      "Yes! You can upgrade your ticket at any time before the event, subject to availability. Visit your ticket page or contact us to upgrade. You will only pay the price difference.",
  },
  {
    question: "What time do doors open?",
    answer:
      "Doors typically open 1 hour before the scheduled show time. VIP ticket holders may enter 30 minutes earlier. Check your specific event page for exact door times.",
  },
  {
    question: "Is there parking available?",
    answer:
      "Parking availability varies by venue. Most of our venues offer nearby paid parking lots and street parking. We recommend arriving early for the best spots. Rideshare drop-off areas are available at all venues.",
  },
  {
    question: "Can I transfer my ticket to someone else?",
    answer:
      "Yes, tickets can be transferred to another person up until the event start time. Log in to your ticket page and use the transfer option to send your ticket via email.",
  },
];

type FAQAccordionProps = {
  faqs?: FAQItem[];
};

export default function FAQAccordion({ faqs }: FAQAccordionProps) {
  const items = faqs || defaultFAQs;
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // Split into two columns for desktop
  const midpoint = Math.ceil(items.length / 2);
  const leftColumn = items.slice(0, midpoint);
  const rightColumn = items.slice(midpoint);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const renderItem = (item: FAQItem, index: number) => (
    <div
      key={index}
      className={`faq-item ${openIndex === index ? "faq-item-open" : ""}`}
    >
      <button
        type="button"
        className="faq-question"
        onClick={() => toggle(index)}
        aria-expanded={openIndex === index}
      >
        <span className="faq-question-text">{item.question}</span>
        <svg
          className="faq-chevron"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <AnimatePresence>
        {openIndex === index && (
          <motion.div
            className="faq-answer-wrapper"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            <p className="faq-answer">{item.answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <section className="faq-section">
      <div className="faq-border-wrapper">
        <h2 className="faq-heading">Frequently Asked Questions</h2>

        <div className="faq-columns">
          <div className="faq-column">
            {leftColumn.map((item, i) => renderItem(item, i))}
          </div>
          <div className="faq-column">
            {rightColumn.map((item, i) =>
              renderItem(item, i + midpoint)
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
