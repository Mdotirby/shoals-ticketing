"use client";

import { useState } from "react";
import { getCookie } from "@/lib/cookies";
import jsPDF from "jspdf";
import { loadVenueLogo } from "@/lib/pdf/pdf-header";

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
        heading: "2. Offer Accepted — Calendar to Live",
        steps: [
          { title: "Block the Date on the Calendar", details: ["Navigate to Admin → Calendar", "Click + New Show and set booking_status to Confirmed, event type to Hard Ticket or Co-Promote", "Fill in title, date/time, and any contact info", "The event pill appears immediately on the calendar in green (confirmed)"] },
          { title: "Open the Event Panel", details: ["Click the event pill on the calendar to open the Event Panel (right-side drawer)", "The Details tab shows all editable event metadata inline", "Switch to the Offers tab — link or create the artist offer directly from the panel", "Switch to Contracts to generate and track the artist contract"] },
          { title: "Configure Ticket Sales", details: ["From the Event Panel, open the Ticket Sales tab to see real-time sales data", "To set up ticket tiers, use the full event editor linked from the Details tab", "Add tiers (GA, VIP, Meet & Greet), prices, quantities, and on-sale dates", "Event goes live on the public site once status is set to Published"] },
        ],
      },
      {
        heading: "3. Pre-Show",
        steps: [
          { title: "Marketing & Promotion", details: ["Event automatically appears on the public events page", "Use Admin → Marketing to create email campaigns", "Share the event link on social media", "Monitor ticket sales live in the Event Panel → Ticket Sales tab"] },
          { title: "Day-of Preparation", details: ["Prepare the guest list in Admin → Guest Lists", "Set up the box office scanner in Admin → Scanner", "Brief door staff on the scanning process", "Enable Live Pulse for real-time event monitoring"] },
        ],
      },
      {
        heading: "4. Post-Show",
        steps: [
          { title: "Settlement", details: ["Click the event pill on the calendar to open the Event Panel", "Switch to the Settlement tab — all ticket revenue is auto-calculated", "Review expenses, artist guarantee, and backend split", "Generate the settlement PDF and send to the artist's agent", "Process payment according to deal terms"] },
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
          { title: "Create Private Event", details: ["Navigate to Admin → Calendar", "Click '+ New Show', set event type to 'Private', and fill in client name, date, and notes", "Or use '+ Quick Hold' to block the date while you gather details — upgrade to a full event later", "The event is created immediately and appears as a purple pill on the calendar", "Click the event pill to open the Event Panel — use the Client, Quote, and Invoice tabs to manage the full lifecycle"] },
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
  {
    id: "marketing-hub",
    title: "Marketing Hub — Campaigns & Audiences",
    category: "Marketing",
    description: "How to use the Marketing Hub to create email campaigns, build audiences, and track performance.",
    icon: "",
    sections: [
      {
        heading: "Marketing Hub Overview",
        steps: [
          { title: "Access the Marketing Hub", details: ["Navigate to Admin → Growth → Marketing", "The Marketing Hub is the central place for all email campaigns, audience management, and newsletter subscribers", "The dashboard shows recent campaigns, subscriber count, and open/click rates"] },
        ],
      },
      {
        heading: "Building Audiences",
        steps: [
          { title: "Understanding Audiences", details: ["Audiences are groups of contacts segmented for targeted email campaigns", "VenueCore automatically builds audiences from: ticket buyers, newsletter signups, FWB loyalty members, and imported contacts", "Each audience can be filtered by event attendance, purchase history, or custom tags"] },
          { title: "Creating a New Audience", details: ["From the Marketing page, click the 'Audiences' tab", "Click '+ New Audience' to create a segment", "Name the audience (e.g., 'VIP Ticket Buyers', 'Country Music Fans', 'Local Regulars')", "Set filters: events attended, ticket tier purchased, date range, location", "Save the audience — it auto-updates as new contacts match the criteria"] },
          { title: "Importing Contacts", details: ["Go to Marketing → FWB Import (or Audience Import)", "Upload a CSV file with columns: name, email, phone (optional)", "Map the CSV columns to VenueCore fields", "Choose which audience to add imported contacts to", "Duplicates are automatically detected and merged by email address"] },
        ],
      },
      {
        heading: "Creating Email Campaigns",
        steps: [
          { title: "Start a New Campaign", details: ["From the Marketing page, click '+ New Campaign'", "Enter the campaign name (internal reference only)", "Select the target audience or 'All Subscribers'", "Choose the email template or start from scratch"] },
          { title: "Compose the Email", details: ["Set the subject line — keep it under 50 characters for best open rates", "Set the preview text — this appears after the subject in email clients", "Write the email body using the rich text editor", "Add images, links, and call-to-action buttons", "Use merge tags like {{first_name}} for personalization", "Preview the email on desktop and mobile views before sending"] },
          { title: "Schedule or Send", details: ["Click 'Send Now' to deliver immediately", "Or click 'Schedule' to set a future date and time", "Best send times: Tuesday-Thursday, 10 AM or 7 PM local time", "After sending, the campaign appears in the 'Sent' tab with delivery stats"] },
        ],
      },
      {
        heading: "Tracking Campaign Performance",
        steps: [
          { title: "View Campaign Analytics", details: ["Click on any sent campaign to view performance metrics", "Key metrics: Delivered count, Open rate, Click rate, Unsubscribe rate", "Industry benchmarks: 20-25% open rate, 2-5% click rate for entertainment", "Use these metrics to refine future campaigns — higher open rates mean better subject lines, higher click rates mean better content"] },
        ],
      },
      {
        heading: "Newsletter Subscribers",
        steps: [
          { title: "Managing Subscribers", details: ["The Newsletters tab shows all email subscribers", "Subscribers come from: website signup form, ticket purchases (with opt-in), CSV imports", "Each subscriber has: name, email, signup date, and source", "Unsubscribed users are automatically excluded from future campaigns", "Export subscriber list as CSV for external use"] },
        ],
      },
    ],
  },
  {
    id: "market-radar",
    title: "Market Radar — Competitive Intelligence",
    category: "Marketing",
    description: "How to use Market Radar to track competing events, routing opportunities, and market trends.",
    icon: "",
    sections: [
      {
        heading: "Market Radar Overview",
        steps: [
          { title: "Access Market Radar", details: ["Navigate to Admin → Growth → Market Radar", "Market Radar scans Ticketmaster, Bandsintown, and venue websites for events in your market area", "It helps you: spot competing shows, find routing opportunities, and identify trending artists"] },
        ],
      },
      {
        heading: "Event Discovery",
        steps: [
          { title: "Browse Discovered Events", details: ["The main table shows all discovered events in your market", "Each row shows: artist, venue, date, source, and distance from your venue", "Sort by date, distance, or artist name to find relevant shows", "Click on any event to see full details including ticket price ranges"] },
          { title: "Filter & Search", details: ["Use the search bar to find specific artists or venues", "Filter by date range to focus on upcoming competition", "Filter by distance to see only nearby events", "Filter by source (Ticketmaster, Bandsintown, etc.)"] },
        ],
      },
      {
        heading: "Competition Analysis",
        steps: [
          { title: "Identify Competing Shows", details: ["Events on the same date or within 3 days of your shows are flagged as competition", "The Competition Panel highlights conflicts with your scheduled events", "Use this to adjust marketing spend or pricing when competing with major shows"] },
          { title: "Routing Detection", details: ["When artists are playing nearby venues within a week of being in your area, Market Radar flags them as routing opportunities", "These artists are already traveling through your region — perfect candidates for booking", "Click 'View Routing' to see the artist's tour schedule and gap dates"] },
        ],
      },
      {
        heading: "Trend Monitoring",
        steps: [
          { title: "Track Market Trends", details: ["The Trend Panel shows genre popularity and ticket price trends in your market", "Identify which genres are selling well locally", "Spot emerging artists before they become too expensive to book", "Compare your ticket prices with regional averages"] },
        ],
      },
    ],
  },
  {
    id: "sales-orders",
    title: "Sales & Order Management",
    category: "Revenue",
    description: "How to view, search, and manage ticket orders and sales data in VenueCore.",
    icon: "",
    sections: [
      {
        heading: "Sales Dashboard",
        steps: [
          { title: "View Sales Overview", details: ["Navigate to Admin → Business → Sales", "The Sales page shows all ticket orders across all events", "Each order shows: buyer name, email, event, quantity, total, date, and status", "Use the search bar to find orders by name, email, or order ID"] },
          { title: "Order Details", details: ["Click any order to view full details", "See: payment method, ticket tier, promo code used, seat assignments (if assigned seating)", "View the customer's order history", "Access the ticket QR codes and delivery status"] },
        ],
      },
      {
        heading: "Box Office Sales",
        steps: [
          { title: "Sell Tickets at the Door", details: ["Navigate to the Box Office page (accessible from the main site or /boxoffice)", "Select the event from the dropdown", "Choose the ticket tier and quantity", "Enter buyer information (name and email required)", "Process payment — supports cash, card, or comp tickets", "Tickets are generated instantly with QR codes"] },
        ],
      },
    ],
  },
  {
    id: "reports-analytics",
    title: "Reports & Analytics",
    category: "Revenue",
    description: "How to generate ticket audit reports, monthly revenue summaries, and export data.",
    icon: "",
    sections: [
      {
        heading: "Ticket Audit Report",
        steps: [
          { title: "Generate a Ticket Audit", details: ["Navigate to Admin → Business → Reports", "Select 'Ticket Audit Report'", "Choose the event or venue, and set the date range", "Click 'Generate Report' to view the data", "The report shows: tier-by-tier breakdown, capacity, percent sold, gross sales, ticketing fees, facility fees, tax, and total revenue", "Click 'Export CSV' to download the data, or 'Export PDF' for a printable version"] },
        ],
      },
      {
        heading: "Monthly Revenue Report",
        steps: [
          { title: "Generate Monthly Revenue", details: ["Select 'Monthly Revenue Report'", "Choose the venue and date range", "Click 'Generate Report'", "Shows: ticket revenue, ticketing fees, facility fees, tax collected, and gross revenue", "Includes profit & revenue share calculations per the management agreement", "Per-event breakdown shows each show's contribution to the total", "Export as CSV for accounting"] },
        ],
      },
      {
        heading: "Orders Report",
        steps: [
          { title: "View Order Data", details: ["Select 'Orders Report' to see all transactions", "Filter by event, venue, or date range", "Shows: order ID, buyer, event, quantity, total, payment method, and status", "Use this for reconciliation with Stripe payment records"] },
        ],
      },
    ],
  },
  {
    id: "scanner-checkin",
    title: "Scanner & Check-In",
    category: "Day of Show",
    description: "How to use the QR code scanner for event check-in, including assigned seating information for ushers.",
    icon: "",
    sections: [
      {
        heading: "Scanner Setup",
        steps: [
          { title: "Access the Scanner", details: ["Navigate to Admin → Day of Show → Scanner", "Select the event from the dropdown", "Grant camera access when prompted", "The scanner works on any device with a camera — phone, tablet, or laptop"] },
        ],
      },
      {
        heading: "Scanning Tickets",
        steps: [
          { title: "Scan a QR Code", details: ["Point the camera at the ticket's QR code", "The scanner reads it instantly and shows the result", "GREEN = Valid ticket, shows customer name and ticket details", "RED = Invalid, already scanned, or wrong event", "For assigned seating events, the scanner shows: Section, Row/Table, and Seat Number — use this to direct guests to their seats"] },
          { title: "Manual Check-In", details: ["If the QR code won't scan, use the manual lookup", "Enter the customer's name or email to find their tickets", "Click 'Check In' to mark the ticket as scanned"] },
        ],
      },
      {
        heading: "Usher Guide (Assigned Seating)",
        steps: [
          { title: "Directing Guests", details: ["When scanning a ticket for an assigned seating event, the screen prominently displays:", "SECTION — the seating area (e.g., 'VIP Tables', 'Floor')", "ROW / TABLE — the specific row or table (e.g., 'T12', 'Row A')", "SEAT # — the individual seat number", "Use this information to guide guests directly to their assigned seats", "For table events, guests at the same table share a table number — direct all table guests to the same table"] },
        ],
      },
    ],
  },
  {
    id: "guest-lists",
    title: "Guest Lists Management",
    category: "Day of Show",
    description: "How to create and manage guest lists for events, including artist comps and VIP access.",
    icon: "",
    sections: [
      {
        heading: "Creating Guest Lists",
        steps: [
          { title: "Set Up a Guest List", details: ["Navigate to Admin → Day of Show → Guest Lists", "Select the event", "Click '+ Add Guest' to add individual names", "Enter: guest name, plus-ones count, notes (e.g., 'Artist Guest', 'Sponsor VIP')", "Guests can also be added in bulk via CSV import"] },
          { title: "Artist Guest List", details: ["Artists with portal access can manage their own guest lists", "The artist sees Guest Lists in their simplified sidebar", "They can add/remove guests for events they're assigned to", "Guest list limits can be set per-event in the event settings"] },
        ],
      },
      {
        heading: "Check-In at the Door",
        steps: [
          { title: "Using the Guest List at the Door", details: ["Door staff access the Guest List from the Scanner page", "Search by name to find guests quickly", "Check off guests as they arrive", "Plus-ones are tracked separately — mark how many of the allocated plus-ones actually arrived", "Notes appear next to each name for special instructions"] },
        ],
      },
    ],
  },
  {
    id: "live-pulse",
    title: "Live Pulse — Real-Time Event Monitoring",
    category: "Day of Show",
    description: "How to use Live Pulse for real-time ticket scanning, revenue tracking, and event metrics during a show.",
    icon: "",
    sections: [
      {
        heading: "Using Live Pulse",
        steps: [
          { title: "Access Live Pulse", details: ["Navigate to Admin → Day of Show → Live Pulse", "Select the active event", "The dashboard updates in real-time as tickets are scanned and sales come in"] },
          { title: "Key Metrics", details: ["Tickets Scanned — how many guests have checked in vs. total sold", "Revenue — real-time box office sales and online sales", "Scan Rate — how quickly guests are being processed at the door", "Drop Count — tracks real-time attendance for fire code compliance", "Use this to make real-time decisions: open more doors, adjust staffing, or trigger promotions"] },
        ],
      },
    ],
  },
  {
    id: "seating-layouts",
    title: "Seating Layouts — Quick Build",
    category: "Shows",
    description: "How to create seating layouts using the Quick Build generator and assign them to events.",
    icon: "",
    sections: [
      {
        heading: "Creating a Seating Layout",
        steps: [
          { title: "Quick Build (Recommended)", details: ["Navigate to Admin → Shows → Seating", "Click '⚡ Quick Build' for the fastest method", "Choose the event type: Tables + GA, Full Tables, or Theater", "Enter room dimensions in feet (width and depth)", "Set stage position (front or back of room)", "Configure tables (count, seats per table, diameter, spacing) or rows (count, seats per row, spacing)", "Set pricing for each section", "The preview updates instantly — no loading", "Click 'Save & Open' to save the layout"] },
          { title: "Custom Layout Builder", details: ["Click '+ Custom Layout' for more control", "Enter room dimensions and layout name", "Use the generator panel to add sections one at a time", "Each section gets a name, price, color, and type (tables/rows/GA)", "Configure the generator parameters and click 'Generate Seats'", "Add multiple sections to build complex layouts"] },
        ],
      },
      {
        heading: "Assigning a Layout to an Event",
        steps: [
          { title: "Link Layout to Event", details: ["Click the event pill on the Calendar to open the Event Panel", "From the Details tab, click 'View Full Details' to open the full event editor", "Scroll to the 'Reserved Seating' section", "Check 'Enable Reserved Seating' and select the layout from the dropdown", "Save the event", "Customers will now see the interactive seat map when purchasing tickets"] },
        ],
      },
      {
        heading: "Customer Experience",
        steps: [
          { title: "How Customers Pick Seats", details: ["On the event page, customers see the seat map inline below the ticket selector", "They tap/click seats to select them — selected seats highlight with a white border", "The ticket type and quantity auto-update to match selected seats", "The Order Summary on the right shows each selected seat with its price", "On checkout, seats are held for 4 minutes while payment is processed", "After payment, seats are marked as 'sold' and shown as unavailable to other buyers"] },
        ],
      },
    ],
  },
  {
    id: "settlements-contracts",
    title: "Settlements & Contracts",
    category: "Business",
    description: "How to create artist settlements, generate contracts, and manage payment terms.",
    icon: "",
    sections: [
      {
        heading: "Settlements",
        steps: [
          { title: "Create a Settlement", details: ["Navigate to Admin → Business → Settlements", "Select the event to settle", "The system auto-calculates: gross ticket revenue, expenses, artist guarantee, backend split", "Add any additional expenses (production, catering, security, etc.)", "Review the settlement summary showing what's owed to the artist vs. venue", "Generate the settlement PDF for artist/agent review", "Track payment status: Pending → Approved → Paid"] },
        ],
      },
      {
        heading: "Contracts",
        steps: [
          { title: "Generate a Contract", details: ["Navigate to Admin → Business → Contracts", "Contracts are auto-generated from accepted offers", "The contract includes all deal terms: guarantee, backend percentage, rider requirements, technical specs", "Contracts are generated as professional PDFs with venue branding", "Send contracts via email for signature", "Track signature status and store signed copies"] },
        ],
      },
    ],
  },
  {
    id: "auctions",
    title: "Auctions — Silent & Live",
    category: "Growth",
    description: "How to create and manage silent auctions for fundraising events.",
    icon: "",
    sections: [
      {
        heading: "Creating an Auction",
        steps: [
          { title: "Set Up an Auction", details: ["Navigate to Admin → Growth → Auctions", "Click '+ New Auction' or create from an existing event", "Enter auction title, description, and date/time", "Set the registration deadline and bidding window", "Configure: minimum bid increments, reserve prices, and auto-extend rules"] },
          { title: "Add Auction Items", details: ["Click 'Add Item' within the auction", "Enter: item title, description, donor name, estimated value", "Upload item photos (at least one required)", "Set: starting bid, bid increment, and optional reserve price", "Add as many items as needed — they display in a grid for bidders"] },
        ],
      },
      {
        heading: "Running the Auction",
        steps: [
          { title: "Bidder Registration", details: ["Share the auction registration link with attendees", "Bidders register with their name, email, and phone number", "Registration generates a unique bidder number", "QR codes are generated for each bidder for quick check-in"] },
          { title: "Live Bidding", details: ["Bidders access the auction on their phones at the event", "They browse items, view current bids, and place bids", "Real-time notifications when outbid", "The auction dashboard shows live bidding activity and total raised"] },
          { title: "Closing & Checkout", details: ["When the auction closes, winners are notified by email", "The checkout page shows all won items with total due", "Stripe payment processing for seamless collection", "Generate reports showing: total raised, items sold, top donors"] },
        ],
      },
    ],
  },
  {
    id: "partners-sponsors",
    title: "Partners & Sponsors",
    category: "Growth",
    description: "How to manage venue partners and event sponsors with tiered visibility.",
    icon: "",
    sections: [
      {
        heading: "Managing Partners",
        steps: [
          { title: "Add a Partner/Sponsor", details: ["Navigate to Admin → Growth → Partners", "Click '+ New Partner'", "Enter: company name, contact info, website, logo", "Set the sponsorship tier (Platinum, Gold, Silver, Bronze, Community)", "Assign the partner to specific events or make them venue-wide", "Partner logos automatically appear on event pages based on their tier level"] },
          { title: "Partner Dashboard", details: ["Partners with login access see a dedicated Partner Dashboard", "They can view: their logo placement, event performance, and engagement metrics", "Partner visibility is tiered — higher tiers get more prominent placement"] },
        ],
      },
    ],
  },
  {
    id: "site-branding",
    title: "Site Branding & Customization",
    category: "Settings",
    description: "How to customize your venue's public-facing website including colors, logos, and content.",
    icon: "",
    sections: [
      {
        heading: "Branding Configuration",
        steps: [
          { title: "Access Branding Settings", details: ["Navigate to Admin → Settings → Site Branding", "All changes take effect immediately on the public website"] },
          { title: "Colors & Logo", details: ["Set Primary Color — used for buttons, links, and accents (recommended: your brand's main color)", "Set Secondary Color — used for backgrounds and surfaces", "Set Accent Color — used for highlights and interactive elements", "Upload your venue logo (PNG, min 500x500px) — appears in header and sidebar", "Upload favicon — appears in browser tabs"] },
          { title: "Hero Images", details: ["Upload hero image — the large background image on the homepage (1920x800px recommended)", "Upload optional second hero image for carousel rotation", "Images are automatically optimized for fast loading"] },
          { title: "Homepage Content", details: ["Set homepage headline — the main text visitors see (e.g., 'Live Music in The Shoals')", "Set subheadline — supporting text below the headline", "Set CTA button text and URL — the main call-to-action button", "Set tagline — appears in the site header next to the logo", "Set footer description — appears in the website footer"] },
          { title: "Contact & Social", details: ["Set support email — shown on contact pages and in footer", "Set social media URLs — Instagram, Facebook, website", "These appear as clickable icons in the website footer"] },
        ],
      },
    ],
  },
  {
    id: "permissions-roles",
    title: "User Permissions & Roles",
    category: "Settings",
    description: "How to manage user accounts, roles, and sidebar permissions for your venue.",
    icon: "",
    sections: [
      {
        heading: "User Management",
        steps: [
          { title: "Managing Users", details: ["Navigate to Admin → Settings → Permissions", "View all users with access to your venue", "Each user has: name, email, role, and last login date"] },
          { title: "Adding a New User", details: ["Click 'Add User'", "Enter their email address", "Select their role:", "- Owner: Full access to everything, can manage other users", "- Venue Admin: Full venue access, cannot manage owners", "- Full Admin: Events, sales, reports — no booking or settlements", "- Box Office: Sales, scanner, guest lists only", "- Door Greeter: Scanner and guest lists only", "- Read Only: View-only access to dashboard and reports", "- Artist: Simplified portal — their events, sales, and guest lists only", "- Partner: Partner dashboard only", "Save — the user receives an email invitation to set up their account"] },
          { title: "Customizing Sidebar Visibility", details: ["For each role, you can customize which sidebar tabs are visible", "This is set per-venue in the sidebar_permissions table", "Toggle visibility for each tab: Dashboard, Events, Sales, Reports, etc.", "Users only see tabs they have permission to access"] },
        ],
      },
    ],
  },
  {
    id: "booking-offers",
    title: "Booking — Creating & Managing Offers",
    category: "Business",
    description: "How to create artist booking offers with deal terms, rider requirements, and financial structures.",
    icon: "",
    sections: [
      {
        heading: "Creating an Offer",
        steps: [
          { title: "Start a New Offer", details: ["Navigate to Admin → Business → Booking", "Click '+ New Offer'", "Select or create the artist", "Choose the proposed event date and venue"] },
          { title: "Set Deal Terms", details: ["Deal Type: Flat guarantee, Versus deal (guarantee vs. percentage), Door deal, or Co-promote", "Guarantee Amount: The fixed payment to the artist", "Backend Percentage: Artist's share of net revenue above the guarantee (for Versus deals)", "Walk Clause: Revenue threshold below which the artist can walk away or renegotiate", "Deposit: Amount due upon contract signing (typically 50% of guarantee)", "Merch Split: Venue's percentage of merchandise sales (typically 15-20%)"] },
          { title: "Rider & Production", details: ["Hospitality Rider: Dressing room requirements, catering, beverages", "Technical Rider: Sound, lighting, backline equipment requirements", "Comp Tickets: Number of complimentary tickets for the artist", "Guest List: Number of guest list spots allocated", "Add any special requirements or notes"] },
          { title: "Send the Offer", details: ["Review all terms in the offer summary", "Click 'Generate PDF' to create a professional deal memo", "Send the PDF to the artist's agent", "Track status: Draft → Sent → Accepted → Declined/Countered", "When accepted, the offer automatically populates the event creation form"] },
        ],
      },
    ],
  },

  /* ================================================================== */
  /*  NEW MODULES — Email Engine, Ad Engine, Deal Lab                   */
  /* ================================================================== */

  {
    id: "broadcasts",
    title: "Broadcasts — Event Announcements & Newsletter",
    category: "Growth",
    description: "Sending pixel-matched marketing emails (event announcements, upcoming-events digest) to the newsletter list, with real open/click/revenue tracking. Replaces the old block-builder Email Engine — templates here are bespoke React Email components built from real designs, not a drag-and-drop composer.",
    icon: "",
    sections: [
      {
        heading: "1. Getting Started",
        steps: [
          { title: "Access Broadcasts", details: ["Navigate to Admin → Marketing → Broadcasts", "Home page shows recent sends, monthly summary tiles (sends, avg open rate, revenue attributed), and quick links to a new broadcast, send history, and audience sync"] },
          { title: "Live send types today", details: ["New Event Announcement — presale/on-sale-aware, links straight to the event page", "Upcoming Events Digest — a short newsletter of what's coming up next", "More trigger types (sponsor highlights, know-before-you-go, portal welcome) are reserved in standalone-emails/lib/triggers.ts but not built yet — they won't appear as options until they are"] },
        ],
      },
      {
        heading: "2. Audience",
        steps: [
          { title: "Sync newsletter subscribers", details: ["Go to Broadcasts → Audience", "Click 'Sync Now' to push every subscribed newsletter_subscribers row into a Resend Segment (created automatically the first time, named 'Newsletter')", "This only ever adds/updates contacts — unsubscribes are managed by Resend from there on, never by removing local rows"] },
          { title: "Scope", details: ["Newsletter-only audience for now — no dynamic segmentation (no 'VIPs', 'dormant buyers', etc. like the old system had)", "Every broadcast goes to the same Newsletter segment; there is no per-send audience picker"] },
        ],
      },
      {
        heading: "3. Send a Broadcast",
        steps: [
          { title: "Compose", details: ["Broadcasts → + New Broadcast", "Pick a trigger, fill in its details (event picker for announcements, count for the digest)", "Click 'Generate Preview' to render the real email with live data — this is the exact HTML that gets sent, not a mockup"] },
          { title: "Test before sending", details: ["Always send a test to yourself first — the test address defaults to your logged-in email", "Test sends are NOT recorded in send history and are not tracked for opens/clicks/revenue"] },
          { title: "Send for real", details: ["'Send Broadcast' shows a confirmation with the live subscriber count before sending — this cannot be undone", "On success you're redirected to Send History where the new row appears"] },
        ],
      },
      {
        heading: "4. Tracking & Revenue",
        steps: [
          { title: "How it works", details: ["Every broadcast link is stamped with utm_source=broadcast&utm_campaign=broadcast:<send_id>", "Opens/clicks come back via the Resend webhook and populate broadcast_recipients per-recipient", "Revenue is attributed by matching orders.utm_campaign to the send id within a 7-day window after sending — same conversion-window logic the old Email Engine used"] },
          { title: "Where to look", details: ["Broadcasts → Send History shows every past send with recipients, open rate, click rate, and revenue attributed", "This is all computed live on page load — there's no cron/rollup job to wait on"] },
        ],
      },
      {
        heading: "5. Transactional Emails",
        steps: [
          { title: "What lives here vs. Broadcasts", details: ["Broadcasts → Transactional Emails is the block-based editor for system-triggered emails — currently just 'User Onboarding' (staff/artist/venue-admin welcome email)", "Ticket delivery is NOT edited here — it's a bespoke React Email component (lib/email/TicketDeliveryEmail.tsx) wired directly into the checkout flow for exact design control"] },
        ],
      },
    ],
  },

  {
    id: "ad-engine",
    title: "Ad Engine — Creatives, Campaigns & Optimization",
    category: "Growth",
    description: "How to use the Ad Engine to generate creative combinations, push campaigns to Meta/Snap, and let the optimization engine re-allocate budget based on live performance.",
    icon: "",
    sections: [
      {
        heading: "1. Concepts",
        steps: [
          { title: "What the Ad Engine does", details: ["Builds creatives as deterministic combinations of (asset × hook × copy variant) — no AI generation", "Validates every campaign against a pre-launch checklist before it goes live", "Pushes campaigns through a platform adapter (Meta or Snapchat) using the venue's stored identity/access token", "Periodically pulls daily_metrics back from each platform and runs a rules-based optimization engine that can scale, pause, or freeze campaigns inside safety bounds"] },
          { title: "Where it lives", details: ["Module code: /modules/ad-engine — all logic, no DB writes outside ad_engine_* tables", "Admin UI is event-scoped: Admin → Shows → Events → (open event) → 'Ad Engine' tab → /admin/events/[id]/ads", "Cron jobs run from .github/workflows/ad-engine-cron.yml (daily metrics + 30-min-later optimization pass)"] },
        ],
      },
      {
        heading: "2. Assets, Hooks & Copy",
        steps: [
          { title: "Upload assets", details: ["Inside the event's Ad Engine dashboard, add assets (images or videos) for the event", "Tag each asset with: kind (image/video), energy (low/medium/high), context (crowd/performance/venue/promo/behind_scenes), and source (in_house/artist/upload/stock)", "Tags drive which creatives the generator produces — high-energy assets don't get paired with soft-tone copy, for instance"] },
          { title: "Write hooks and copy variants", details: ["Hooks = short attention-grabbers (e.g. 'Last 50 tickets')", "Copy variants = body + CTA with a tone tag (hype / classy / casual / raw)", "Store them against the event (or venue-wide for reuse)", "The creative generator combines every eligible (asset × hook × copy) combo deterministically and hashes the combination so duplicates can never be created"] },
        ],
      },
      {
        heading: "3. Build & Launch a Campaign",
        steps: [
          { title: "Generate creatives", details: ["From the Ad Engine dashboard, click 'Generate Creatives' to materialize every valid combination", "Review the grid — activate the ones you want to run, leave the rest as drafts"] },
          { title: "Build the campaign", details: ["Click 'New Campaign', pick platform (meta or snapchat), mode (efficiency / volume / manual), daily_budget_cap, and total_budget_cap", "The campaign is created in status=draft; click 'Validate' to run the pre-launch checklist"] },
          { title: "Pre-launch validation (automatic)", details: ["Checks the event has an identity + access_token for the chosen platform", "Verifies at least one active creative exists", "Confirms budget caps are within safety bounds and no event-level BudgetCap has been exceeded", "Blocks launch if any check fails and explains why; none of the checks can be bypassed from the UI"] },
          { title: "Launch", details: ["Once validated, click 'Launch' — the platform adapter creates the external campaign and stores the external_campaign_id", "Status moves draft → active; the daily metrics sync starts on the next cron tick"] },
        ],
      },
      {
        heading: "4. Metrics & Optimization",
        steps: [
          { title: "Daily metrics sync", details: ["Every 6 h, the ad-engine-cron workflow calls /api/cron/ad-engine-metrics", "The worker pulls spend / impressions / clicks / conversions / revenue per campaign per day from each platform and writes ad_engine_daily_metrics rows", "Derived rates (CTR, CPC, CPM, ROAS) are computed on write"] },
          { title: "Optimization pass", details: ["30 min after each metrics sync, /api/cron/ad-engine-optimize runs evaluateCampaign() for every active campaign", "The optimization engine checks safety overrides (manual freezes, budget walls, metrics-age) before taking any action", "Actions: scale daily budget up by scaling_step_pct, pause low performers, or freeze on unexplained spend spikes", "Every action is logged to ad_engine_decision_log with a confidence score and outcome (executed / logged_only / blocked) so decisions are auditable"] },
        ],
      },
      {
        heading: "5. Safety & Manual Overrides",
        steps: [
          { title: "Freeze a campaign", details: ["From the campaign detail page, click 'Freeze' to pause the optimization engine — manual control only until unfrozen", "Use when running a launch window or doing manual A/B tests"] },
          { title: "Budget walls", details: ["Event-level BudgetCap defines daily_cap_total and campaign_cap_total", "If total spend across all campaigns would breach the cap, the optimization engine blocks any 'scale up' decisions and logs why", "This is the safety net that prevents runaway spend"] },
        ],
      },
    ],
  },

  {
    id: "deal-lab",
    title: "Deal Lab — Offer Simulation & Recommendations",
    category: "Business",
    description: "How to use Deal Lab to simulate offer scenarios, score deal risk, and get rule-based recommendations before sending a deal memo.",
    icon: "",
    sections: [
      {
        heading: "1. Concepts",
        steps: [
          { title: "What Deal Lab does", details: ["Runs deterministic scenario simulations on a proposed offer: low / mid / high ticket-sales outcomes, with each scenario fully priced out (guarantees, walks, fees, facility costs, splits)", "Calculates risk_score by combining walk-clause exposure, break-even sensitivity, and downside revenue", "Emits rule-based recommendations — e.g. 'switch to versus deal', 'drop guarantee by $X', 'require 50% deposit'", "Everything is rules + math, no AI"] },
          { title: "Where it lives", details: ["Module code: /modules/deal-lab", "Surfaces inside: Admin → Business → Booking → (open or create offer) → 'Deal Lab (Simulated)' button on the offer page", "No standalone sidebar entry — it's always offer-scoped"] },
        ],
      },
      {
        heading: "2. Running a Simulation",
        steps: [
          { title: "From a draft offer", details: ["Create or open an offer at Admin → Business → Booking → [offer]", "Fill in the proposed deal terms: guarantee, deal type (flat / versus / door / co-promote), backend percentage, walk clause, deposit, merch split", "Also set the expected capacity, projected ticket price, and estimated on-sale duration"] },
          { title: "Launch Deal Lab", details: ["Click the 'Deal Lab (Simulated)' button in the top-right of the offer page", "The simulation runs in the browser — no external calls, no wait", "You get three scenarios: low (40% sold), mid (70% sold), high (100% sold) with per-scenario P&L"] },
        ],
      },
      {
        heading: "3. Reading the Output",
        steps: [
          { title: "Scenario table", details: ["For each scenario you see: gross ticket revenue, ticketing fees, facility fees, tax, net revenue, artist payment (guarantee vs backend vs door), venue net", "The break-even bar shows the minimum percent sold before the venue breaks even given the current guarantee — if break-even sits above 70%, that's a high-risk deal"] },
          { title: "Risk score", details: ["Overall 0–100 score; below 30 = green, 30–60 = yellow, 60+ = red", "Sub-factors shown: Walk exposure (how likely walk clause triggers at low-scenario sales), Break-even sensitivity (how close BE is to realistic sales), Downside (absolute $ lost in low scenario)"] },
          { title: "Recommendations", details: ["Rules-based suggestions appear beneath the scenarios", "Typical outputs: 'Convert to versus deal — backend kicks in above $X', 'Reduce guarantee by 15% to pull break-even below 50%', 'Add walk clause at 35% ticket sales', 'Increase deposit to 50% to de-risk cancellation exposure'", "Apply a recommendation by clicking it — the offer form updates with the new term and the simulation re-runs instantly"] },
        ],
      },
      {
        heading: "4. Using Deal Lab in the Booking Workflow",
        steps: [
          { title: "Standard flow", details: ["Agent sends inquiry → create offer → set terms → open Deal Lab → review scenarios + risk score", "If risk score is high, iterate on terms (lower guarantee, add walk clause, increase deposit) and re-simulate", "Once risk is acceptable, generate the PDF deal memo and send to agent", "Deal Lab does not write to the offer record — only the terms you explicitly save are persisted. Simulations are disposable and re-runnable."] },
          { title: "Integration with Ad Engine", details: ["Deal Lab pulls in Ad Engine performance data as a demand signal when scoring risk", "The old Email Engine's segment-performance feed into Deal Lab was removed along with that system — no replacement exists yet"] },
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  PDF Export                                                         */
/* ------------------------------------------------------------------ */

async function loadDataUrl(src: string): Promise<string | null> {
  try {
    const res = await fetch(src, { mode: "cors" }).catch(() => null);
    if (!res || !res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject();
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

async function exportSOPtoPDF(
  template: SOPTemplate,
  venueName: string,
  logoUrl: string | null,
  primaryColor: string,
  venueSlug?: string
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const MARGIN = 18;
  const PAGE_W = 215.9;
  const PAGE_H = 279.4;
  const CONTENT_W = PAGE_W - MARGIN * 2;
  let y = MARGIN;

  // Load VenueCore favicon for footer
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let vcIconDataUrl: string | null = null;
  for (const path of ["/vc-icon.png", "/venuecore-icon.png", "/favicon.png", "/apple-icon.png"]) {
    vcIconDataUrl = await loadDataUrl(`${origin}${path}`);
    if (vcIconDataUrl) break;
  }

  // Parse primary color to RGB
  const hexToRgb = (hex: string): [number, number, number] => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
  };
  const brandRgb = hexToRgb(primaryColor || "#ffffff");

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
    // "Generated by VenueCore" with favicon in center
    const vcText = "Generated by VenueCore";
    const centerX = PAGE_W / 2;
    if (vcIconDataUrl) {
      try {
        const iconSize = 3.5;
        const textW = doc.getTextWidth(vcText);
        const blockX = centerX - (iconSize + 1.5 + textW) / 2;
        doc.addImage(vcIconDataUrl, "PNG", blockX, PAGE_H - 12.5, iconSize, iconSize);
        doc.text(vcText, blockX + iconSize + 1.5, PAGE_H - 10);
      } catch {
        doc.text(vcText, centerX, PAGE_H - 10, { align: "center" });
      }
    } else {
      doc.text(vcText, centerX, PAGE_H - 10, { align: "center" });
    }
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

  // Logo — uses loadVenueLogo which handles West72/west72 case variants
  const logoData = await loadVenueLogo(venueSlug, logoUrl).catch(() => null);
  if (logoData) {
    try {
      const maxW = 50;
      const ratio = logoData.width / logoData.height;
      const w = Math.min(maxW, 50);
      const h = w / ratio;
      doc.addImage(logoData.dataUrl, "PNG", MARGIN, y, w, h);
      y += h + 8;
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
      let primaryColor = "#ffffff";
      let venueSlug: string | undefined = undefined;

      if (venueId) {
        const res = await fetch("/api/venues");
        if (res.ok) {
          const venues = await res.json();
          const v = Array.isArray(venues) ? venues.find((x: Record<string, string>) => x.id === venueId) : null;
          if (v) {
            venueName = v.name || venueName;
            logoUrl = v.logo_url || null;
            primaryColor = v.primary_color || primaryColor;
            venueSlug = v.slug || undefined;
          }
        }
      }

      await exportSOPtoPDF(template, venueName, logoUrl, primaryColor, venueSlug);
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
        <h1 style={{ fontFamily: "var(--font-archivo), sans-serif", fontSize: "2rem", color: "#ffffff", margin: 0, lineHeight: 1.1 }}>
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
            fontFamily: "var(--font-archivo), sans-serif",
            fontSize: 18,
            fontWeight: 400,
            color: "#ffffff",
            margin: "0 0 12px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}>
            {cat}
          </h2>
          <div className="sop-card-grid">
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
                      color: "#ffffff",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: generating === template.id ? "not-allowed" : "pointer",
                      opacity: generating === template.id ? 0.5 : 1,
                      fontFamily: "var(--font-archivo), sans-serif",
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
                background: "#ffffff",
                color: "var(--vc-bg)",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "var(--font-archivo), sans-serif",
                flexShrink: 0,
              }}
            >
              {generating === selectedSOP.id ? "Generating..." : "Export PDF"}
            </button>
          </div>

          {selectedSOP.sections.map((section, sIdx) => (
            <div key={sIdx} style={{ marginBottom: 24 }}>
              <h3 style={{
                fontSize: 16, fontWeight: 700, color: "#ffffff",
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
