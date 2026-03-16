"use client";

import { useState } from "react";
import { getCookie } from "@/lib/cookies";
import jsPDF from "jspdf";

/* ------------------------------------------------------------------ */
/*  SOP Template Definitions                                           */
/* ------------------------------------------------------------------ */

type SOPStep = {
  title: string;
  details: string[];
};

type SOPTemplate = {
  id: string;
  title: string;
  category: string;
  description: string;
  icon: string;
  sections: {
    heading: string;
    steps: SOPStep[];
  }[];
};

const SOP_TEMPLATES: SOPTemplate[] = [
  {
    id: "venue-onboarding",
    title: "New Venue Onboarding",
    category: "Operations",
    description: "Step-by-step process for onboarding a new venue into the VenueCore platform.",
    icon: "",
    sections: [
      {
        heading: "Pre-Onboarding Preparation",
        steps: [
          { title: "Collect Venue Information", details: ["Venue name, address, and capacity", "Buyer/promoter contact name, phone, and email", "Tax ID and billing information", "Logo file (PNG or SVG, minimum 500x500px)", "Hero image for the venue's public page (1920x800px recommended)", "Social media URLs (Instagram, Facebook, website)"] },
          { title: "Create Venue Record", details: ["Navigate to Admin → Onboarding", "Fill in all venue details", "Set the venue slug (used for subdomain: slug.venuecore.live)", "Upload logo and hero images", "Set default ticketing fee, facility fee, and tax rate", "Click 'Create Venue'"] },
          { title: "Configure Branding", details: ["Go to Admin → Site Branding", "Select the new venue from the dropdown", "Set primary, secondary, and accent colors using the color picker", "Upload favicon", "Set homepage headline and tagline", "Save changes — the venue's public site updates immediately"] },
        ],
      },
      {
        heading: "User Account Setup",
        steps: [
          { title: "Create Admin User", details: ["Go to Admin → Permissions", "Click 'Add User'", "Enter the venue admin's email address", "Set role to 'venue_admin'", "Assign the user to the new venue", "The system sends an invitation email with login instructions"] },
          { title: "Verify Access", details: ["Confirm the venue admin can log in", "Verify they see the correct venue in the sidebar", "Confirm they can access Events, Booking, Sales, and Reports", "Walk through the dashboard and key features"] },
        ],
      },
      {
        heading: "Post-Onboarding Checklist",
        steps: [
          { title: "Verify Public Site", details: ["Visit slug.venuecore.live", "Confirm logo, colors, and hero image display correctly", "Verify events page shows no events (or test events)", "Test the contact page and newsletter signup"] },
          { title: "Create Test Event", details: ["Create a test event with a future date", "Add at least one ticket tier", "Verify the event appears on the public events page", "Test the checkout flow with a test Stripe payment"] },
        ],
      },
    ],
  },
  {
    id: "concert-event-flow",
    title: "Concert Event Creation — Offer to Live",
    category: "Events",
    description: "Complete workflow from creating an artist offer to having the event live on the homepage.",
    icon: "",
    sections: [
      {
        heading: "1. Create the Offer",
        steps: [
          { title: "Build the Artist Offer", details: ["Navigate to Admin → Booking → + New Offer", "Select the artist and enter deal terms", "Set guarantee amount, deal type (flat/vs/door), and backend percentage", "Add walk clause, deposit amount, and rider requirements", "Add any comp tickets, guest list allocations, and hospitality details", "Review all financial terms in the deal summary"] },
          { title: "Send the Offer", details: ["Click 'Generate PDF' to create a professional deal memo", "Review the PDF for accuracy", "Send the offer to the artist's agent via email or the agent portal", "Track the offer status (Draft → Sent → Accepted/Declined)"] },
        ],
      },
      {
        heading: "2. Offer Accepted — Create the Event",
        steps: [
          { title: "Create the Event", details: ["Once the offer is accepted, navigate to Admin → Events → + New Event", "Fill in event title, date, time, and venue", "Upload the event image (recommended: 1200x630px)", "Write the event description", "Link the event to the accepted offer (for settlement tracking)"] },
          { title: "Configure Ticket Tiers", details: ["Add ticket tiers (e.g., General Admission, VIP, Meet & Greet)", "Set price, quantity available, and sort order for each tier", "Configure any promo codes or early bird pricing", "Set the on-sale date if tickets should go live later"] },
          { title: "Generate the Contract", details: ["From the offer detail page, click 'Generate Contract'", "Review the auto-generated contract terms", "Send the contract for signature", "Track signature status"] },
        ],
      },
      {
        heading: "3. Pre-Show",
        steps: [
          { title: "Marketing & Promotion", details: ["Event automatically appears on the public events page", "Use Admin → Marketing to create email campaigns", "Share the event link on social media", "Monitor ticket sales in Admin → Sales and Admin → Marketing Hub"] },
          { title: "Day-of Preparation", details: ["Prepare the guest list in Admin → Guest Lists", "Set up the box office scanner in Admin → Scanner", "Brief door staff on the scanning process", "Enable Live Pulse for real-time event monitoring"] },
        ],
      },
      {
        heading: "4. Post-Show",
        steps: [
          { title: "Settlement", details: ["Navigate to Admin → Settlements", "Review ticket sales, expenses, and revenue", "Generate the settlement sheet PDF", "Send to the artist's agent for review and approval", "Process payment according to the deal terms"] },
        ],
      },
    ],
  },
  {
    id: "artist-setup",
    title: "Artist Setup & Event Assignment",
    category: "Artists",
    description: "How to create an artist account and assign them to events with proper portal access.",
    icon: "",
    sections: [
      {
        heading: "Create Artist Account",
        steps: [
          { title: "Add Artist User", details: ["Go to Admin → Permissions", "Click 'Add User'", "Enter the artist's email address", "Set role to 'artist'", "Upload the artist's avatar/photo (optional)", "The system sends a login invitation"] },
        ],
      },
      {
        heading: "Assign to Events",
        steps: [
          { title: "Link Artist to Offer/Event", details: ["When creating an offer, select the artist from the dropdown", "The artist is automatically linked when the offer is accepted", "The artist can view their events in the Artist Portal (Dashboard, Sales, Guest Lists)"] },
          { title: "Artist Portal Access", details: ["Artists log in at /admin and see a simplified sidebar", "They can view: Dashboard (their events), Sales (their ticket data), Guest Lists", "Artists cannot access booking, settlements, contracts, or admin settings", "All data is filtered to only show events they're assigned to"] },
        ],
      },
    ],
  },
  {
    id: "agent-setup",
    title: "Agent Setup & Event Routing",
    category: "Agents",
    description: "How to set up agents, assign artists, and route booking opportunities.",
    icon: "",
    sections: [
      {
        heading: "Create Agent Record",
        steps: [
          { title: "Add Agent", details: ["Navigate to Admin → Agents", "Click 'Add Agent'", "Enter agent name, company, email, and phone", "Add commission rate if applicable", "List the artists they represent"] },
        ],
      },
      {
        heading: "Route Opportunities",
        steps: [
          { title: "Agent Portal Access", details: ["Agents access the platform at /agent", "They can view offers routed to their artists", "They can accept or decline offers on behalf of artists", "All communication is tracked in the system"] },
          { title: "Assigning Events", details: ["When creating an offer, select the agent as the contact", "The agent receives notifications about offer status changes", "Settlement sheets can be sent directly to the agent's email"] },
        ],
      },
    ],
  },
  {
    id: "private-events",
    title: "Private Events — Full Workflow",
    category: "Private Events",
    description: "Complete process for private event management: client onboarding, contracts, billing, and policies.",
    icon: "",
    sections: [
      {
        heading: "1. Client Inquiry & Onboarding",
        steps: [
          { title: "Receive & Qualify Inquiry", details: ["Client submits inquiry via website contact form or direct email", "Collect: event type, preferred date, expected guest count, budget range", "Check venue availability on Admin → Calendar", "Confirm the venue can accommodate the request"] },
          { title: "Client Information Collection", details: ["Full name and organization/company name", "Phone number and email address", "Event type (wedding, corporate, birthday, fundraiser, etc.)", "Desired date and time (including setup/teardown windows)", "Expected guest count and any special requirements", "Catering preferences, AV needs, decor requirements"] },
        ],
      },
      {
        heading: "2. Proposal & Contract",
        steps: [
          { title: "Create Private Event", details: ["Navigate to Admin → Events → + New Event", "Set event type to 'Private'", "Fill in client details and event specifications", "Set the rental fee, catering costs, and any add-on services"] },
          { title: "Generate Contract", details: ["The system generates a rental contract with:", "- Venue rental fee and payment schedule", "- Deposit amount and due date", "- Cancellation policy and refund terms", "- Liability and insurance requirements", "- Setup/teardown time windows", "- Noise ordinance and occupancy limits", "- Catering and alcohol policies", "- Force majeure clause", "Send contract to client for review and signature"] },
        ],
      },
      {
        heading: "3. Billing & Payments",
        steps: [
          { title: "Invoice Generation", details: ["Create an invoice from the private event page", "Include: rental fee, deposit (if not yet paid), catering, AV rental, staffing", "Send the invoice via the built-in payment link (client pays via Stripe)", "Track payment status: Pending → Paid → Overdue"] },
          { title: "Payment Schedule", details: ["Typical schedule: 50% deposit upon contract signing", "Remaining 50% due 14 days before the event", "Any add-on services billed separately or added to the final invoice", "Refund policy per the contract terms"] },
        ],
      },
      {
        heading: "4. Event Execution",
        steps: [
          { title: "Pre-Event Checklist", details: ["Confirm all vendor arrangements (catering, AV, decor)", "Verify client's final guest count and seating requirements", "Coordinate setup timeline with venue staff", "Prepare any signage or branding materials"] },
          { title: "Day-of Management", details: ["Venue staff on-site for setup per contract timeline", "Client walkthrough before guests arrive", "Monitor event progress and handle any issues", "Teardown and venue inspection after event ends"] },
        ],
      },
      {
        heading: "5. Post-Event",
        steps: [
          { title: "Final Billing & Follow-up", details: ["Process any remaining charges or adjustments", "Send final invoice if applicable", "Request client feedback/review", "Document any venue damage or issues", "Archive event records for future reference"] },
        ],
      },
      {
        heading: "Attached Policies",
        steps: [
          { title: "Standard Policies to Include", details: ["Cancellation Policy: Full deposit refund if cancelled 60+ days out; 50% refund 30-59 days; no refund under 30 days", "Damage Deposit: $500-$2000 refundable deposit, returned within 14 days post-event pending inspection", "Insurance: Client must provide proof of event liability insurance ($1M minimum)", "Alcohol Policy: All alcohol service must go through approved vendors; no BYOB", "Noise Policy: Music must end by venue's noise ordinance time (typically 10-11 PM)", "Occupancy: Guest count may not exceed venue capacity per fire code", "Setup/Teardown: Client has access during contracted hours only; overtime billed hourly"] },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  PDF Export                                                         */
/* ------------------------------------------------------------------ */

async function exportSOPtoPDF(
  template: SOPTemplate,
  venueName: string,
  logoUrl: string | null,
  primaryColor: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const MARGIN = 18;
  const PAGE_W = 215.9;
  const PAGE_H = 279.4;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  // Parse primary color to RGB
  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };
  const brandRgb = hexToRgb(primaryColor || "#d0c290");

  // ── Helper: add page with header/footer ──
  const addPageHeader = () => {
    // White background
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");

    // Top accent line
    doc.setFillColor(...brandRgb);
    doc.rect(0, 0, PAGE_W, 3, "F");

    y = MARGIN + 5;
  };

  const addPageFooter = (pageNum: number) => {
    doc.setFontSize(8);
    doc.setTextColor(160, 160, 160);
    doc.text(`${venueName} — Standard Operating Procedure`, MARGIN, PAGE_H - 10);
    doc.text(`Page ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
    doc.text("Confidential — For Internal Use Only", PAGE_W / 2, PAGE_H - 10, { align: "center" });
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - 25) {
      addPageFooter(doc.getNumberOfPages());
      doc.addPage();
      addPageHeader();
    }
  };

  // ── Page 1: Cover ──
  addPageHeader();

  // Logo
  if (logoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = logoUrl;
      });
      if (img.complete && img.naturalWidth > 0) {
        const maxW = 50;
        const ratio = img.naturalWidth / img.naturalHeight;
        const w = Math.min(maxW, 50);
        const h = w / ratio;
        doc.addImage(img, "PNG", MARGIN, y, w, h);
        y += h + 8;
      }
    } catch { /* skip logo */ }
  }

  // Title
  doc.setFontSize(28);
  doc.setTextColor(...brandRgb);
  doc.setFont("helvetica", "bold");
  doc.text(template.title, MARGIN, y + 10);
  y += 18;

  // Subtitle
  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.setFont("helvetica", "normal");
  doc.text("Standard Operating Procedure", MARGIN, y);
  y += 8;

  // Description
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  const descLines = doc.splitTextToSize(template.description, CONTENT_W);
  doc.text(descLines, MARGIN, y);
  y += descLines.length * 5 + 8;

  // Meta info
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(`Organization: ${venueName}`, MARGIN, y);
  y += 5;
  doc.text(`Category: ${template.category}`, MARGIN, y);
  y += 5;
  doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, MARGIN, y);
  y += 5;
  doc.text(`Version: 1.0`, MARGIN, y);
  y += 12;

  // Divider
  doc.setDrawColor(...brandRgb);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // Table of Contents
  doc.setFontSize(14);
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.text("Table of Contents", MARGIN, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  template.sections.forEach((section, i) => {
    doc.setTextColor(...brandRgb);
    doc.text(`${i + 1}.`, MARGIN, y);
    doc.setTextColor(60, 60, 60);
    doc.text(section.heading, MARGIN + 8, y);
    y += 6;
  });

  addPageFooter(1);

  // ── Content Pages ──
  template.sections.forEach((section, sIdx) => {
    doc.addPage();
    addPageHeader();

    // Section heading
    doc.setFontSize(18);
    doc.setTextColor(...brandRgb);
    doc.setFont("helvetica", "bold");
    doc.text(`${sIdx + 1}. ${section.heading}`, MARGIN, y);
    y += 10;

    // Accent underline
    doc.setDrawColor(...brandRgb);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, y, MARGIN + 60, y);
    y += 8;

    section.steps.forEach((step, stepIdx) => {
      ensureSpace(20);

      // Step title
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.setFont("helvetica", "bold");
      doc.text(`${sIdx + 1}.${stepIdx + 1}  ${step.title}`, MARGIN, y);
      y += 7;

      // Step details
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "normal");
      step.details.forEach((detail) => {
        ensureSpace(8);
        doc.setTextColor(...brandRgb);
        doc.text("•", MARGIN + 4, y);
        doc.setTextColor(70, 70, 70);
        const lines = doc.splitTextToSize(detail, CONTENT_W - 12);
        doc.text(lines, MARGIN + 10, y);
        y += lines.length * 4.5 + 2;
      });

      y += 4;
    });

    addPageFooter(doc.getNumberOfPages());
  });

  // Save
  const fileName = `SOP_${template.id}_${venueName.replace(/\s+/g, "_")}.pdf`;
  doc.save(fileName);
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function SOPsPage() {
  const [generating, setGenerating] = useState<string | null>(null);
  const [selectedSOP, setSelectedSOP] = useState<SOPTemplate | null>(null);

  const handleExport = async (template: SOPTemplate) => {
    setGenerating(template.id);
    try {
      // Get venue info for branding
      const venueId = getCookie("venue-id");
      let venueName = "VenueCore";
      let logoUrl: string | null = null;
      let primaryColor = "#d0c290";

      if (venueId) {
        const res = await fetch("/api/venues");
        if (res.ok) {
          const venues = await res.json();
          const v = Array.isArray(venues) ? venues.find((x: Record<string, string>) => x.id === venueId) : null;
          if (v) {
            venueName = v.name || venueName;
            logoUrl = v.logo_url || null;
            primaryColor = v.primary_color || primaryColor;
          }
        }
      }

      await exportSOPtoPDF(template, venueName, logoUrl, primaryColor);
    } catch (e) {
      console.error("SOP export error:", e);
    } finally {
      setGenerating(null);
    }
  };

  const categories = [...new Set(SOP_TEMPLATES.map((t) => t.category))];

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: "var(--font-bayon), sans-serif", fontSize: "2rem", color: "var(--vc-gold)", margin: 0, lineHeight: 1.1 }}>
          Standard Operating Procedures
        </h1>
        <p style={{ color: "var(--vc-text-secondary)", fontSize: 14, margin: "6px 0 0" }}>
          Generate, review, and export SOPs for training and operations. All PDFs use your venue&apos;s branding.
        </p>
      </div>

      {/* SOP Grid by Category */}
      {categories.map((cat) => (
        <div key={cat}>
          <h2 style={{
            fontFamily: "var(--font-bayon), sans-serif",
            fontSize: 18,
            fontWeight: 400,
            color: "var(--vc-gold)",
            margin: "0 0 12px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            {cat}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {SOP_TEMPLATES.filter((t) => t.category === cat).map((template) => (
              <div
                key={template.id}
                style={{
                  background: "var(--vc-surface)",
                  backdropFilter: "var(--vc-blur)",
                  WebkitBackdropFilter: "var(--vc-blur)",
                  border: "1px solid var(--vc-border)",
                  boxShadow: "var(--vc-shadow-glass)",
                  borderRadius: "var(--vc-radius-xl)",
                  padding: 20,
                  cursor: "pointer",
                  transition: "border-color 200ms ease, transform 200ms ease",
                }}
                onClick={() => setSelectedSOP(selectedSOP?.id === template.id ? null : template)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--vc-border-hover)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--vc-border)"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{template.icon}</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--vc-text)" }}>
                      {template.title}
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--vc-text-secondary)", lineHeight: 1.5 }}>
                      {template.description}
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--vc-text-muted)" }}>
                    {template.sections.length} sections · {template.sections.reduce((s, sec) => s + sec.steps.length, 0)} steps
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleExport(template); }}
                    disabled={generating === template.id}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "var(--vc-radius-sm)",
                      border: "1px solid var(--vc-border-hover)",
                      background: "transparent",
                      color: "var(--vc-gold)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: generating === template.id ? "not-allowed" : "pointer",
                      opacity: generating === template.id ? 0.5 : 1,
                      fontFamily: "var(--font-urbanist), sans-serif",
                    }}
                  >
                    {generating === template.id ? "Generating..." : "Export PDF"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Expanded SOP Preview */}
      {selectedSOP && (
        <div style={{
          background: "var(--vc-surface)",
          backdropFilter: "var(--vc-blur)",
          WebkitBackdropFilter: "var(--vc-blur)",
          border: "1px solid var(--vc-border)",
          boxShadow: "var(--vc-shadow-glass)",
          borderRadius: "var(--vc-radius-xl)",
          padding: 28,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "var(--vc-text)" }}>
                {selectedSOP.icon} {selectedSOP.title}
              </h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--vc-text-secondary)" }}>
                {selectedSOP.description}
              </p>
            </div>
            <button
              onClick={() => handleExport(selectedSOP)}
              disabled={generating === selectedSOP.id}
              style={{
                padding: "10px 24px",
                borderRadius: "var(--vc-radius-sm)",
                border: "none",
                background: "var(--vc-gold)",
                color: "var(--vc-bg)",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-urbanist), sans-serif",
                flexShrink: 0,
              }}
            >
              {generating === selectedSOP.id ? "Generating..." : "Export PDF"}
            </button>
          </div>

          {selectedSOP.sections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: 24 }}>
              <h3 style={{
                fontSize: 16, fontWeight: 700, color: "var(--vc-gold)",
                margin: "0 0 12px",
                paddingBottom: 8,
                borderBottom: "1px solid var(--vc-border-subtle)",
              }}>
                {sIdx + 1}. {section.heading}
              </h3>
              {section.steps.map((step, stepIdx) => (
                <div key={stepIdx} style={{ marginBottom: 14, paddingLeft: 8 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: "var(--vc-text)", margin: "0 0 6px" }}>
                    {sIdx + 1}.{stepIdx + 1} {step.title}
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 20, listStyle: "disc" }}>
                    {step.details.map((detail, dIdx) => (
                      <li key={dIdx} style={{ fontSize: 13, color: "var(--vc-text-secondary)", lineHeight: 1.7, marginBottom: 2 }}>
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
