# Admin UI Design System — Liquid Glass

## Reference: Marketing Hub Dashboard
The marketing dashboard page (`/admin/marketing`) is the visual reference for all admin pages. It uses:
- Dark navy background (`#0b0d1d`)
- Semi-transparent glass cards with subtle borders
- White text with gray-400/500 secondary text
- Gold (`#d0c290`) accent color for active states and CTAs
- Clean grid layouts with consistent spacing

---

## 1. Design Tokens

### Colors

```
--vc-bg:              #0b0d1d        /* Page background — flat, no gradient */
--vc-surface:         rgba(255, 255, 255, 0.04)   /* Glass card fill */
--vc-surface-hover:   rgba(255, 255, 255, 0.07)   /* Glass card hover */
--vc-surface-active:  rgba(208, 194, 144, 0.10)   /* Active/selected state */
--vc-border:          rgba(255, 255, 255, 0.09)    /* Card borders */
--vc-border-hover:    rgba(208, 194, 144, 0.20)    /* Hover border accent */
--vc-border-subtle:   rgba(255, 255, 255, 0.06)    /* Dividers, separators */

--vc-text:            #ffffff                       /* Primary text */
--vc-text-secondary:  rgba(255, 255, 255, 0.5)     /* Labels, descriptions */
--vc-text-muted:      rgba(255, 255, 255, 0.3)     /* Placeholders, hints */
--vc-text-disabled:   rgba(255, 255, 255, 0.2)     /* Disabled state */

--vc-gold:            #d0c290        /* Primary accent — buttons, active nav */
--vc-gold-hover:      #e0d4a8        /* Gold hover */
--vc-gold-muted:      rgba(208, 194, 144, 0.15)    /* Gold subtle bg */

--vc-success:         #10b981        /* Green — sold out, confirmed */
--vc-warning:         #f59e0b        /* Amber — pending, draft */
--vc-danger:          #ef4444        /* Red — errors, declined */
--vc-info:            #7eb8da        /* Blue — info badges */
```

### Typography

```
--font-heading:       var(--font-bayon), sans-serif
--font-body:          var(--font-urbanist), sans-serif
--font-mono:          var(--font-geist-mono), monospace

/* Scale */
--text-xs:    11px    /* Badges, fine print */
--text-sm:    13px    /* Labels, table cells */
--text-base:  15px    /* Body text */
--text-lg:    18px    /* Section headings */
--text-xl:    22px    /* Page sub-headings */
--text-2xl:   28px    /* Page titles */
--text-3xl:   36px    /* Hero/KPI numbers */
```

### Spacing

```
--space-1:  4px
--space-2:  8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
```

### Radius

```
--radius-sm:  8px     /* Buttons, inputs, badges */
--radius-md:  12px    /* Small cards, list items */
--radius-lg:  14px    /* KPI cards, panels */
--radius-xl:  16px    /* Large cards, modals */
```

### Shadows

```
--shadow-glass:       0 4px 24px rgba(0, 0, 0, 0.30),
                      inset 0 1px 0 rgba(255, 255, 255, 0.07)

--shadow-glass-hover: 0 8px 32px rgba(0, 0, 0, 0.45),
                      inset 0 1px 0 rgba(255, 255, 255, 0.10)

--shadow-glass-lg:    0 8px 40px rgba(0, 0, 0, 0.50),
                      inset 0 1px 0 rgba(255, 255, 255, 0.08)
```

### Glass Effect Mixin

Every card/panel/container uses this consistent glass treatment:

```css
.glass {
  background: var(--vc-surface);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--vc-border);
  box-shadow: var(--shadow-glass);
}

.glass:hover {
  border-color: var(--vc-border-hover);
  box-shadow: var(--shadow-glass-hover);
}
```

---

## 2. Responsive Breakpoints

```
Mobile:   0 – 639px    (single column, stacked layouts)
Tablet:   640 – 1023px  (2-column grids, collapsible sidebar)
Desktop:  1024 – 1439px (full sidebar, 3-column grids)
Wide:     1440px+       (4-column grids, expanded panels)
```

### Breakpoint Variables

```css
/* Mobile first — base styles are mobile */
@media (min-width: 640px)  { /* sm — tablet */  }
@media (min-width: 1024px) { /* md — desktop */ }
@media (min-width: 1440px) { /* lg — wide */    }
```

### Layout Behavior

| Element | Mobile | Tablet | Desktop | Wide |
|---------|--------|--------|---------|------|
| Sidebar | Hidden, hamburger menu | Hidden, hamburger menu | Fixed 240px left | Fixed 240px left |
| Content padding | 16px | 24px | 32px 40px | 40px 48px |
| KPI grid | 2 columns | 2 columns | 4 columns | 4 columns |
| Card grid | 1 column | 2 columns | 3 columns | 4 columns |
| Tables | Horizontal scroll | Full width | Full width | Full width |
| Forms | Single column | Single column | 2-column grid | 2-column grid |
| Modals | Full screen | Centered 480px | Centered 560px | Centered 640px |

---

## 3. Component Catalog

### 3.1 Page Shell

Every admin page follows this structure:

```
+--[ admin-shell ]-------------------------------------------+
|  +--[ sidebar ]--+  +--[ admin-content ]----------------+  |
|  | Logo          |  | Page Header                       |  |
|  | Nav items     |  |   Title + Action buttons          |  |
|  |               |  | KPI Bar (optional)                |  |
|  |               |  |   4x stat cards                   |  |
|  |               |  | Content Area                      |  |
|  |               |  |   Cards / Tables / Forms          |  |
|  +---------------+  +-----------------------------------+  |
+-------------------------------------------------------------+
```

### 3.2 Page Header

```
+--[ admin-page-header ]--------------------------------------+
|  [ Page Title ]                    [ + Action Button ]      |
|  [ Subtitle / breadcrumb ]         [ Secondary action ]     |
+-------------------------------------------------------------+
```

- Title: `--text-2xl`, font-heading, white
- Subtitle: `--text-sm`, text-secondary
- Action buttons: gold background, dark text

### 3.3 KPI Stat Card

```
+--[ glass card ]--+
|  LABEL           |  ← text-xs, uppercase, tracking-wide, text-secondary
|  VALUE           |  ← text-3xl, font-bold, white (or green for revenue)
+------------------+
```

- Grid: `grid-cols-2` mobile, `grid-cols-4` desktop
- Glass background, 14px radius
- Hover: border goes gold-muted

### 3.4 Data Card (Event/Offer/Settlement)

```
+--[ glass card ]---------------------------------------------+
|  [ Image 136px ] [ Status Badge ]                           |
|  ---------------------------------------------------------- |
|  [ Title ]                                    [ Actions ]   |
|  [ Date · Venue ]                                           |
|  [ Stats row: Sold / Available / Revenue ]                  |
+-------------------------------------------------------------+
```

- Image: `h-36`, cover, rounded-t
- Title: `--text-sm`, font-bold, truncate
- Meta: `--text-xs`, text-secondary
- Stats: flex row with labels, `--text-xs`
- Hover: scale slightly, border goes gold-muted

### 3.5 Tool/Link Card

```
+--[ glass card ]---------------------------------------------+
|  [ Icon/Emoji ]  [ Title ]                        [ → ]     |
|                   [ Description ]                            |
+-------------------------------------------------------------+
```

- Horizontal layout, items-start
- Icon: 28px flex-shrink-0
- Title: `--text-sm`, font-semibold
- Desc: `--text-xs`, text-secondary

### 3.6 Table

```
+--[ glass panel ]--------------------------------------------+
|  [ Panel Header: Title + Filter/Search ]                    |
|  ---------------------------------------------------------- |
|  TH   | TH        | TH       | TH         | TH            |
|  ---------------------------------------------------------- |
|  td   | td        | td       | td         | td            |
|  td   | td        | td       | td         | td            |
+-------------------------------------------------------------+
```

- Header row: `--text-xs`, uppercase, text-secondary, border-bottom
- Cell: `--text-sm`, text-primary
- Row hover: `--vc-surface-hover`
- Mobile: horizontal scroll wrapper

### 3.7 Form Card

```
+--[ glass card ]---------------------------------------------+
|  [ Section Title ]                                          |
|  ---------------------------------------------------------- |
|  [ Label ]              [ Label ]                           |
|  [ Input ]              [ Input ]                           |
|                                                             |
|  [ Label ]              [ Label ]                           |
|  [ Textarea ]           [ Select ]                          |
|                                                             |
|  [ Cancel btn ]                     [ Save btn (gold) ]     |
+-------------------------------------------------------------+
```

- Grid: 1 column mobile, 2 columns desktop
- Input: glass background, `--vc-border` border, 8px radius
- Focus: border → gold-muted
- Labels: `--text-xs`, uppercase, tracking-wide, text-secondary

### 3.8 Status Badges

```css
.badge-draft    { bg: rgba(255,255,255,0.08); color: text-secondary }
.badge-active   { bg: rgba(16,185,129,0.15);  color: --vc-success }
.badge-pending  { bg: rgba(245,158,11,0.15);  color: --vc-warning }
.badge-declined { bg: rgba(239,68,68,0.15);   color: --vc-danger }
.badge-info     { bg: rgba(126,184,218,0.15); color: --vc-info }
```

- Text: `--text-xs`, uppercase, tracking-wider, font-semibold
- Padding: 2px 8px
- Radius: 9999px (pill)

### 3.9 Buttons

| Type | Background | Text | Border |
|------|-----------|------|--------|
| Primary | `--vc-gold` | `--vc-bg` (dark) | none |
| Secondary | transparent | `--vc-text` | `--vc-border` |
| Danger | transparent | `--vc-danger` | `rgba(239,68,68,0.3)` |
| Ghost | transparent | `--vc-text-secondary` | none |

All buttons:
- Font: `--font-body`, `--text-sm`, font-weight 600
- Padding: 10px 20px
- Radius: `--radius-sm`
- Transition: 180ms ease

### 3.10 Sidebar

```
+--[ sidebar glass panel ]--+
|  [ Venue Logo ]            |
|  [ Welcome, Name ]         |
|  [ Venue Name ]            |
|  ─────────────────────     |
|  [ Nav Item ]              |
|  [ Nav Item (active) ]     |  ← gold text + gold-muted bg
|  [ Nav Item ]              |
|  ...                       |
+----------------------------+
```

- Width: 240px fixed (desktop), hidden (mobile/tablet)
- Background: `rgba(255, 255, 255, 0.025)` glass
- Nav items: 10px 14px padding, 8px radius
- Active: gold text, gold-muted background
- Mobile: slide-in overlay with blur backdrop

---

## 4. Admin Pages Inventory — What Changes

| Page | Current State | What Needs to Change |
|------|--------------|----------------------|
| Dashboard (`/admin`) | Custom CSS classes, recharts | Already uses glass KPI cards + panels. Add consistent page header. |
| Marketing Hub (`/admin/marketing`) | **Tailwind utilities** — this IS the reference | Convert from Tailwind to CSS classes matching the design system OR keep as-is and align others to match its visual style. |
| Events list (`/admin/events`) | Custom CSS `.admin-event-card` | Already glass. Ensure consistent card structure. |
| Event edit (`/admin/events/[id]/edit`) | `.admin-form-page` with inline styles | Convert to design system form card pattern. |
| Booking/Offers (`/admin/offers`) | `.admin-form-page` | Apply glass card to offer list rows. |
| Offer detail (`/admin/offers/[id]`) | Mix of inline styles and custom CSS | Standardize with glass panels, consistent headers. |
| Settlements (`/admin/settlements`) | Custom table/cards | Apply glass table panel pattern. |
| Contracts (`/admin/contracts`) | Custom layout | Apply glass panels. |
| Reports (`/admin/reports`) | `.report-card` with custom CSS | Already mostly glass. Ensure breakpoints. |
| Sales/Orders (`/admin/orders`) | `.sales-event-card` | Already glass. Verify mobile breakpoints. |
| Calendar (`/admin/calendar`) | Custom layout | Apply glass panel for calendar container. |
| Guest Lists (`/admin/guest-lists`) | Custom table | Apply glass table pattern. |
| Sponsors (`/admin/sponsors`) | Custom form | Apply design system form pattern. |
| Auctions (`/admin/auctions`) | `.auction-create-panel` | Already glass. Verify consistency. |
| Seating (`/admin/seating`) | Custom SVG layout | Apply glass panel wrapper. |
| Settings (`/admin/settings`) | Custom form | Apply design system form pattern. |
| Onboarding (`/admin/onboarding`) | Step wizard with custom CSS | Apply glass card for each step. |
| Market Radar (`/admin/market-radar`) | Module-specific layout | Apply glass panels. |
| Live Pulse (`/admin/live`) | Custom real-time layout | Apply glass panels for stat displays. |
| Scanner (`/admin/scan`) | Simple scanner UI | Apply glass card for scanner area. |
| Partner Dashboard | Custom layout | Apply glass KPI + panel pattern. |

---

## 5. Key Problem: Mixed Styling Approaches

The codebase currently has **two styling approaches** that need to be reconciled:

1. **Custom CSS classes** in `globals.css` — used by most admin pages (`.admin-form-page`, `.dash-kpi-card`, `.admin-event-card`, etc.)
2. **Tailwind utility classes** — used by the Marketing Hub page (`bg-gray-800`, `border-gray-700`, `rounded-xl`, etc.)

### Recommendation: Standardize on CSS Classes with Design Tokens

Since 90%+ of the admin pages already use custom CSS classes, and the `globals.css` file is the established pattern:

1. Define all design tokens as CSS custom properties in `:root`
2. Create a set of reusable `.vc-*` utility classes for the glass system
3. Gradually migrate the Marketing Hub page from Tailwind utilities to the same CSS class system
4. This ensures ONE source of truth for the glass style

### Proposed CSS Utility Classes

```css
/* Glass surfaces */
.vc-glass          { /* standard glass card */ }
.vc-glass-subtle   { /* lighter glass — sidebar, dividers */ }
.vc-glass-strong   { /* stronger glass — modals, dropdowns */ }

/* Layout */
.vc-page-header    { /* page title + actions row */ }
.vc-kpi-grid       { /* 2-col mobile, 4-col desktop KPI grid */ }
.vc-card-grid      { /* 1/2/3/4 col responsive card grid */ }
.vc-table-wrap     { /* horizontal scroll on mobile */ }

/* Components */
.vc-stat-card      { /* KPI stat card */ }
.vc-data-card      { /* event/offer/settlement card */ }
.vc-tool-card      { /* link/tool navigation card */ }
.vc-form-card      { /* form container */ }
.vc-panel          { /* generic content panel */ }

/* Elements */
.vc-badge          { /* status badge base */ }
.vc-badge-success  { /* green */ }
.vc-badge-warning  { /* amber */ }
.vc-badge-danger   { /* red */ }
.vc-badge-info     { /* blue */ }
.vc-badge-neutral  { /* gray */ }

.vc-btn            { /* button base */ }
.vc-btn-primary    { /* gold CTA */ }
.vc-btn-secondary  { /* bordered */ }
.vc-btn-danger     { /* red bordered */ }
.vc-btn-ghost      { /* text only */ }

.vc-input          { /* text input */ }
.vc-select         { /* select dropdown */ }
.vc-textarea       { /* textarea */ }
.vc-label          { /* form label */ }
```

---

## 6. Implementation Plan

### Phase 1: Foundation (CSS only, no page changes)
- Add all design tokens to `:root` in `globals.css`
- Create the `.vc-*` utility classes
- These sit alongside existing classes — nothing breaks

### Phase 2: Sidebar and Shell
- Update `admin-shell`, `admin-sidebar`, `admin-content` to use design tokens
- Ensure mobile hamburger menu works consistently
- Fix all sidebar breakpoints: hidden on mobile/tablet, fixed on desktop

### Phase 3: Shared Components
- Standardize `admin-page-header` across all pages
- Standardize KPI stat cards (currently `.dash-kpi-card` and inline Tailwind `bg-gray-800`)
- Standardize table pattern with glass panel wrapper
- Standardize form inputs with glass styling

### Phase 4: Page-by-Page Migration
- Dashboard: minor tweaks, already close
- Marketing Hub: migrate from Tailwind utilities to `.vc-*` classes
- Events list/edit: apply consistent card + form patterns
- Offers: apply consistent list + detail patterns
- Settlements/Contracts: apply table + detail patterns
- All remaining pages: apply the closest matching pattern

### Phase 5: Mobile/Tablet Polish
- Test every page at 375px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide)
- Fix any overflow, truncation, or stacking issues
- Ensure touch targets are 44px+ on mobile
- Ensure modals are full-screen on mobile, centered on desktop

---

## 7. Visual Reference — Anatomy Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│  ADMIN SHELL                                          bg: #0b0d1d  │
│  ┌──────────┐  ┌──────────────────────────────────────────────────┐ │
│  │ SIDEBAR  │  │ CONTENT AREA                     padding: 32-40 │ │
│  │          │  │                                                  │ │
│  │ glass    │  │ ┌──────────────────────────────────────────────┐ │ │
│  │ subtle   │  │ │ PAGE HEADER                                 │ │ │
│  │          │  │ │ Title                        [+ Action Btn] │ │ │
│  │ Logo     │  │ │ subtitle                                    │ │ │
│  │ Welcome  │  │ └──────────────────────────────────────────────┘ │ │
│  │ ──────── │  │                                                  │ │
│  │ Nav      │  │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │ │
│  │ items    │  │ │ KPI  │ │ KPI  │ │ KPI  │ │ KPI  │            │ │
│  │          │  │ │ CARD │ │ CARD │ │ CARD │ │ CARD │            │ │
│  │          │  │ │ glass│ │ glass│ │ glass│ │ glass│            │ │
│  │          │  │ └──────┘ └──────┘ └──────┘ └──────┘            │ │
│  │          │  │                                                  │ │
│  │          │  │ ┌────────────────────────────────────────────┐   │ │
│  │          │  │ │ PANEL (glass)                             │   │ │
│  │          │  │ │ Section Title              [Filter] [Search]│  │ │
│  │          │  │ │ ──────────────────────────────────────────│   │ │
│  │          │  │ │  Card  │  Card  │  Card  │  Card          │   │ │
│  │          │  │ │  Card  │  Card  │  Card  │  Card          │   │ │
│  │          │  │ └────────────────────────────────────────────┘   │ │
│  │          │  │                                                  │ │
│  └──────────┘  └──────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (< 640px)

```
┌──────────────────────────┐
│ [☰ Menu]    Page Title   │  ← mobile top bar
├──────────────────────────┤
│ PAGE HEADER              │
│ Title                    │
│ [+ Action Btn]           │
├──────────────────────────┤
│ ┌──────┐ ┌──────┐       │  ← 2-col KPI grid
│ │ KPI  │ │ KPI  │       │
│ └──────┘ └──────┘       │
│ ┌──────┐ ┌──────┐       │
│ │ KPI  │ │ KPI  │       │
│ └──────┘ └──────┘       │
├──────────────────────────┤
│ [Search...           ]   │
│ [All] [Upcoming] [Past]  │
├──────────────────────────┤
│ ┌────────────────────┐   │  ← stacked cards
│ │ DATA CARD (glass)  │   │
│ │ Image              │   │
│ │ Title · Date       │   │
│ │ Stats              │   │
│ └────────────────────┘   │
│ ┌────────────────────┐   │
│ │ DATA CARD (glass)  │   │
│ └────────────────────┘   │
└──────────────────────────┘
```

---

## 8. Color System Summary

```
Dark Navy Background:  #0b0d1d
Glass Fill:            rgba(255, 255, 255, 0.04)
Glass Border:          rgba(255, 255, 255, 0.09)
Gold Accent:           #d0c290
Gold Hover:            #e0d4a8
White Text:            #ffffff
Gray Text:             rgba(255, 255, 255, 0.5)
Muted Text:            rgba(255, 255, 255, 0.3)

Status Green:          #10b981
Status Amber:          #f59e0b
Status Red:            #ef4444
Status Blue:           #7eb8da
```

These are the West72/VenueCore branding colors — navy blue primary background with beige/gold accent throughout.

---

## 9. Notes for Implementation

- **Do NOT delete existing classes.** Add the new `.vc-*` classes alongside them, then migrate pages one at a time.
- **The marketing page is the visual target** but its implementation (Tailwind utilities) is not the target. We want to achieve the same look using the CSS class system.
- **Glass blur performance:** `backdrop-filter: blur()` can be expensive on low-end devices. Use `will-change: transform` on glass elements that animate. Limit blur to 16px max.
- **The sidebar already works.** Focus effort on the content area cards, tables, and forms.
- **Test dark-on-dark contrast.** Ensure text remains readable — minimum `rgba(255,255,255,0.5)` for secondary text on glass surfaces.