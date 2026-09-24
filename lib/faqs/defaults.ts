/**
 * The FAQ answers a venue gets before it writes its own.
 *
 * These lived inside app/components/FAQAccordion.tsx, a "use client"
 * component — so a server route that imported them got an unresolvable named
 * export and a 500 at runtime, not a build error. Data does not belong in a
 * client component; it belongs somewhere both sides can import.
 *
 * The admin adopts these into venue_faqs as editable rows
 * (POST /api/faqs/seed), after which a venue's own rows are the only source
 * and this is just the starting point.
 */
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
