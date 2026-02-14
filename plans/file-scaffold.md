# File Scaffold — All Files to Create

This document lists every file the platform needs. Files marked ✅ already exist. Files marked 🆕 need to be created. Each file includes its purpose and the placeholder content to scaffold.

---

## Type Definitions (`lib/types/`)

### ✅ `lib/types/event.ts` — UPDATE existing
```typescript
export type Event = {
  id: string;
  title: string;
  venue: string;
  date: string;
  price: number;
  description?: string;
  image_url?: string;
  image_crop_data?: ImageCropData;
  status: "draft" | "published";
};

export type ImageCropData = {
  x: number;
  y: number;
  width: number;
  height: number;
};
```

### 🆕 `lib/types/ticket.ts`
```typescript
export type TicketType = {
  id: string;
  event_id: string;
  name: string;
  price: number;
  quantity_available: number;
  quantity_sold: number;
  sort_order: number;
};

export type Ticket = {
  id: string;
  order_id: string;
  event_id: string;
  ticket_type_id: string;
  qr_code: string;
  customer_name: string;
  customer_email: string;
  is_scanned: boolean;
  scanned_at?: string;
  created_at: string;
};
```

### 🆕 `lib/types/order.ts`
```typescript
export type Order = {
  id: string;
  event_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  stripe_payment_intent_id?: string;
  stripe_checkout_session_id?: string;
  total_amount: number;
  status: "pending" | "paid" | "refunded" | "cancelled";
  delivery_method: "digital" | "physical";
  shipping_address?: ShippingAddress;
  created_at: string;
};

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};
```

### 🆕 `lib/types/admin.ts`
```typescript
export type AdminUser = {
  id: string;
  email: string;
  role: "full_admin" | "box_office";
  must_change_password: boolean;
  created_at: string;
};
```

### 🆕 `lib/types/offer.ts`
```typescript
export type ArtistOffer = {
  id: string;
  artist_name: string;
  venue?: string;
  event_date?: string;
  guarantee?: number;
  door_split?: string;
  merch_split?: string;
  status: "draft" | "sent" | "accepted" | "declined" | "expired";
  terms?: string;
  notes?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};
```

---

## Library Files (`lib/`)

### ✅ `lib/supabase.js` — Keep as-is (public client)

### 🆕 `lib/supabase-server.ts` — Server-side Supabase client with auth
```typescript
import { createClient } from "@supabase/supabase-js";

// Server-side client with service role for admin operations
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

### 🆕 `lib/stripe.ts` — Stripe server config
```typescript
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});
```

---

## Middleware

### 🆕 `middleware.ts` — Protect admin routes
```typescript
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // TODO: Check for Supabase auth session cookie
  // Redirect to /admin/login if not authenticated
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");
  const isLoginPage = request.nextUrl.pathname === "/admin/login";

  if (isAdminRoute && !isLoginPage) {
    // Placeholder: will check auth cookie
    // return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

---

## Customer Pages

### ✅ `app/page.tsx` — Home page (exists, no changes needed now)

### ✅ `app/events/page.tsx` — Events listing (exists, needs redesign later)

### 🆕 `app/events/[id]/page.tsx` — Event detail + ticket selection
```tsx
// TODO: Design this page
// Shows: event image, title, venue, date, description
// Shows: ticket type selector (GA/VIP/Table) with quantities
// Shows: checkout button
export default function EventDetailPage() {
  return (
    <main>
      <p>Event Detail — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/checkout/page.tsx` — Checkout redirect handler
```tsx
// TODO: This page redirects to Stripe Checkout
// Receives selected tickets, creates session, redirects
export default function CheckoutPage() {
  return (
    <main>
      <p>Checkout — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/checkout/success/page.tsx` — Post-payment confirmation
```tsx
// TODO: Design this page
// Shows: order confirmation, ticket links, delivery info
export default function CheckoutSuccessPage() {
  return (
    <main>
      <p>Checkout Success — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/tickets/[id]/page.tsx` — Digital ticket view
```tsx
// TODO: Design this page
// Shows: QR code, event info, ticket holder name
// Buttons: Add to Apple Wallet, Add to Google Wallet, Print
export default function TicketViewPage() {
  return (
    <main>
      <p>Digital Ticket View — awaiting design</p>
    </main>
  );
}
```

---

## Admin Pages

### 🆕 `app/admin/layout.tsx` — Admin layout wrapper
```tsx
// TODO: Design admin layout
// Contains: admin sidebar/header nav, role-based menu items
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>Admin Sidebar — awaiting design</nav>
      <main>{children}</main>
    </div>
  );
}
```

### 🆕 `app/admin/login/page.tsx` — Admin login
```tsx
// TODO: Design login page
// Email + password form, Supabase Auth sign-in
// After login: check must_change_password → redirect to settings or dashboard
export default function AdminLoginPage() {
  return (
    <main>
      <p>Admin Login — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/page.tsx` — Admin dashboard home
```tsx
// TODO: Design dashboard
// Shows: total tickets sold, total revenue, upcoming events count
// Quick links to create event, view orders
export default function AdminDashboardPage() {
  return (
    <main>
      <p>Admin Dashboard — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/events/page.tsx` — Event management list
```tsx
// TODO: Design event list
// Table/grid of all events with status, date, tickets sold
// Button to create new event
export default function AdminEventsPage() {
  return (
    <main>
      <p>Admin Events List — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/events/new/page.tsx` — Create event form
```tsx
// TODO: Design event creation form
// Fields: title, venue, date, time, description, ticket types
// Image upload with react-easy-crop cropper
export default function AdminCreateEventPage() {
  return (
    <main>
      <p>Create Event — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/events/[id]/edit/page.tsx` — Edit event form
```tsx
// TODO: Design event edit form (same as create but pre-filled)
export default function AdminEditEventPage() {
  return (
    <main>
      <p>Edit Event — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/orders/page.tsx` — Orders + customer data
```tsx
// TODO: Design orders table
// Columns: order ID, customer name/email, event, amount, status, date
// Filters: by event, by date range, by status
// Click row to view order detail
export default function AdminOrdersPage() {
  return (
    <main>
      <p>Orders + Customer Data — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/scan/page.tsx` — QR ticket scanner
```tsx
// TODO: Design scanner page
// Camera viewfinder using html5-qrcode
// Full-screen green checkmark + customer name on valid scan
// Full-screen red X on invalid scan
// Accessible to both full_admin and box_office roles
export default function AdminScanPage() {
  return (
    <main>
      <p>QR Scanner — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/offers/page.tsx` — Artist offers list
```tsx
// TODO: Design offers list
// Table of all offers with artist, venue, date, status
// Button to create new offer
export default function AdminOffersPage() {
  return (
    <main>
      <p>Artist Offers — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/offers/new/page.tsx` — Create offer
```tsx
// TODO: Design offer creation form
// Fields: artist name, venue, date, guarantee, door split, merch split, terms, notes
export default function AdminCreateOfferPage() {
  return (
    <main>
      <p>Create Offer — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/offers/[id]/page.tsx` — Offer detail/edit
```tsx
// TODO: Design offer detail view
// Shows all offer fields, status history, edit capability
export default function AdminOfferDetailPage() {
  return (
    <main>
      <p>Offer Detail — awaiting design</p>
    </main>
  );
}
```

### 🆕 `app/admin/settings/page.tsx` — Admin settings
```tsx
// TODO: Design settings page
// Change password form
// For full_admin: manage admin users (create/delete, assign roles)
export default function AdminSettingsPage() {
  return (
    <main>
      <p>Admin Settings — awaiting design</p>
    </main>
  );
}
```

---

## API Routes

### ✅ `app/api/events/route.js` — UPDATE to filter by status
```javascript
// Update GET to only return published events for public
// Add POST for admin event creation
```

### 🆕 `app/api/events/[id]/route.ts`
```typescript
// GET: single event by ID (public)
// PUT: update event (admin only)
// DELETE: delete event (admin only)
```

### 🆕 `app/api/events/[id]/ticket-types/route.ts`
```typescript
// GET: ticket types for an event (public)
// POST: create ticket type (admin only)
```

### 🆕 `app/api/checkout/route.ts`
```typescript
// POST: create Stripe Checkout Session
// Body: { event_id, items: [{ ticket_type_id, quantity }], delivery_method }
```

### 🆕 `app/api/webhooks/stripe/route.ts`
```typescript
// POST: Stripe webhook handler
// Handles: checkout.session.completed
// Creates order + tickets in Supabase, generates QR codes
```

### 🆕 `app/api/tickets/[id]/validate/route.ts`
```typescript
// POST: validate a ticket QR code at the door
// Body: { qr_code }
// Returns: { valid, customer_name } or { valid: false, reason }
```

### 🆕 `app/api/admin/auth/route.ts`
```typescript
// POST: admin login (wraps Supabase Auth signInWithPassword)
// Returns: session token + admin user profile
```

### 🆕 `app/api/admin/users/route.ts`
```typescript
// GET: list admin users (full_admin only)
// POST: create admin user (full_admin only)
```

### 🆕 `app/api/orders/route.ts`
```typescript
// GET: list all orders (admin only), with filters
```

### 🆕 `app/api/offers/route.ts`
```typescript
// GET: list all offers (admin only)
// POST: create offer (admin only)
```

### 🆕 `app/api/offers/[id]/route.ts`
```typescript
// GET: single offer detail
// PUT: update offer
// DELETE: delete offer
```

### 🆕 `app/api/upload/route.ts`
```typescript
// POST: upload image to Supabase Storage
// Returns: public URL
```

---

## Components

### ✅ Existing — keep as-is for now
- `app/components/Header.tsx`
- `app/components/EventsHero.tsx`
- `app/components/EventCarousel.tsx`
- `app/components/EventCard.tsx`

### ✅ `app/components/Footer.tsx` — Currently empty, needs design
```tsx
// TODO: Design footer
// Links: Box Office (/admin/scan), Events, About, Contact
// Branding: West72 Entertainment
```

### 🆕 `app/components/TicketSelector.tsx`
```tsx
// TODO: Design ticket selector widget
// Used on /events/[id] page
// Shows ticket types with +/- quantity controls and total
```

### 🆕 `app/components/QRScanner.tsx`
```tsx
// TODO: Wraps html5-qrcode library
// Camera viewfinder, onScan callback
// Used on /admin/scan page
```

### 🆕 `app/components/ImageCropper.tsx`
```tsx
// TODO: Wraps react-easy-crop
// Used on admin event create/edit pages
// Returns crop coordinates
```

### 🆕 `app/components/admin/AdminSidebar.tsx`
```tsx
// TODO: Design admin sidebar navigation
// Menu items based on user role
```

### 🆕 `app/components/admin/StatsCard.tsx`
```tsx
// TODO: Design stat card widget
// Shows a metric label + value, used on admin dashboard
```

---

## Summary: Files to Create

| Category | Count |
|---|---|
| Type definitions | 4 new + 1 update |
| Library files | 2 new |
| Middleware | 1 new |
| Customer pages | 4 new |
| Admin pages | 12 new |
| API routes | 10 new + 1 update |
| Components | 5 new + 1 update |
| **Total** | **39 new files + 3 updates** |
