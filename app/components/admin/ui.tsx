"use client";

/**
 * Admin UI primitives — the one shared layer every admin page builds from.
 *
 * WHY THIS EXISTS
 * The September rebuild restyled pages one at a time, and each page invented
 * its own class family for the same shapes: cc-* (command center), cshow-*
 * (create show), bo-* (box office), tkt-* (ticketing), ofr-* (offers), inv-*
 * (invoices), team-* (users), acl-* (permissions), ev-* (event workspace),
 * cal-* (calendar). Ten implementations of card / KPI tile / row / pill,
 * 4,419 lines of admin CSS, and nothing holding them to the same values —
 * which is exactly why the portal drifted page to page.
 *
 * Everything here is a thin, typed wrapper over classes in the "ADMIN PORTAL
 * — LIQUID GLASS" section of app/styles/globals.css (scoped under
 * body[data-theme="liquid-glass"] .admin-shell). This file owns no colours,
 * radii or spacing of its own — the tokens live in CSS so the ~40 older
 * rules that read --vc-surface/--vc-border keep matching for free.
 *
 * The values these classes encode come from the Claude Design canvas
 * (design project "Venue Management & Ticketing Platform", VenueCore.dc.html):
 * surfaces rgba(255,255,255,0.05) over a 1px rgba(255,255,255,0.16) border,
 * 24px radius, blur(28px) saturate(160%); nested surfaces 0.045 / 14px; pills
 * 999px; eyebrow labels 9.5px/700/0.17em uppercase at 50% white; numbers
 * tabular and 800.
 *
 * Adding a page? Reach for these first. If a shape genuinely isn't here, add
 * it HERE rather than inventing another page-prefixed family — that is the
 * whole point.
 */

import React from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/** Shared money formatter so every screen renders totals identically. */
export function fmtUSD(n: number | null | undefined, opts?: { cents?: boolean }) {
  const v = Number(n ?? 0) || 0;
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents === false ? 0 : 2,
    maximumFractionDigits: opts?.cents === false ? 0 : 2,
  });
}

export type Tone = "neutral" | "good" | "bad" | "info";

/* ───────────────────────── Page chrome ───────────────────────── */

/**
 * Page title block. Matches .admin-page-header, which every restyled page
 * already uses — this just stops each one hand-writing the same four divs.
 */
export function PageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="admin-page-header">
      <div className="admin-page-header-text">
        {eyebrow && <div className="admin-page-eyebrow">{eyebrow}</div>}
        <h1 className="admin-page-title">{title}</h1>
        {sub && <div className="admin-page-sub">{sub}</div>}
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </div>
  );
}

/** The small uppercase label that titles a section or a column of figures. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="ui-eyebrow">{children}</div>;
}

/** Row of controls above a list — filters, search, a spacer, actions. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="filter-bar">{children}</div>;
}

/** Pushes whatever follows it to the right inside a Toolbar. */
export function Spacer() {
  return <span className="filter-spacer" />;
}

/* ───────────────────────── Surfaces ───────────────────────── */

/**
 * The glass panel. `flush` drops the body padding for tables and lists that
 * need to run edge to edge.
 */
export function Card({
  title,
  sub,
  count,
  actions,
  flush,
  className,
  children,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  count?: React.ReactNode;
  actions?: React.ReactNode;
  flush?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cx("card", flush && "admin-card--flush", className)}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h3>{title}</h3>}
          {count !== undefined && <span className="count">{count}</span>}
          {actions && (
            <>
              <span className="filter-spacer" />
              {actions}
            </>
          )}
        </div>
      )}
      {sub && <div className="card-sub">{sub}</div>}
      {children}
    </div>
  );
}

/** Responsive column grid for cards. Collapses to one column on mobile. */
export function Grid({
  cols = 2,
  children,
}: {
  cols?: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  return <div className={`ui-grid ui-grid-${cols}`}>{children}</div>;
}

/* ───────────────────────── Numbers ───────────────────────── */

export function KpiRow({ children }: { children: React.ReactNode }) {
  return <div className="ui-kpis">{children}</div>;
}

/**
 * One headline figure. `sub` is the quiet line under it (comparison, count,
 * "of 420 sold"); `tone` colours the value for good/bad readings only —
 * neutral figures stay white, per the design system.
 */
export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="ui-kpi">
      <div className="ui-kpi-label">{label}</div>
      <div className={cx("ui-kpi-value", tone !== "neutral" && `ui-tone-${tone}`)}>{value}</div>
      {sub && <div className="ui-kpi-sub">{sub}</div>}
    </div>
  );
}

/**
 * Label/value line — the money rails on offers, settlements and the box
 * office drawer are all stacks of these. `strong` marks a subtotal, `total`
 * the final line (rule above it, heavier type).
 */
export function KeyValue({
  label,
  value,
  note,
  strong,
  total,
  tone = "neutral",
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
  strong?: boolean;
  total?: boolean;
  tone?: Tone;
}) {
  return (
    <div className={cx("ui-kv", total && "ui-kv--total", strong && "ui-kv--strong")}>
      <div className="ui-kv-label">
        {label}
        {note && <span className="ui-kv-note">{note}</span>}
      </div>
      <div className={cx("ui-kv-value", tone !== "neutral" && `ui-tone-${tone}`)}>{value}</div>
    </div>
  );
}

/** Horizontal progress/capacity bar. Percent is clamped, never NaN. */
export function Meter({ percent, tone = "neutral" }: { percent: number; tone?: Tone }) {
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="ui-meter">
      <div
        className={cx("ui-meter-fill", tone !== "neutral" && `ui-meter-fill--${tone}`)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ───────────────────────── Labels ───────────────────────── */

export type BadgeVariant = "draft" | "live" | "good" | "bad" | "info";

export function StatusBadge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: React.ReactNode;
}) {
  return <span className={cx("badge", `badge-${variant}`)}>{children}</span>;
}

/** Neutral category label that carries no status meaning (Hard Ticket, 21+). */
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}

/** Rounded chip used for counts, ranges and inline states. */
export function Pill({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return <span className={cx("ui-pill", tone !== "neutral" && `ui-pill--${tone}`)}>{children}</span>;
}

/* ───────────────────────── Controls ───────────────────────── */

export function Button({
  variant = "outline",
  size,
  href,
  type = "button",
  disabled,
  onClick,
  className,
  children,
}: {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm";
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className);
  if (href && !disabled) {
    return (
      <a className={cls} href={href}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} type={type} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** Labelled form control wrapper. Pass the input/select/textarea as children. */
export function Field({
  label,
  hint,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  // .field already styles its own <label> and the input/select/textarea
  // inside it (globals.css, admin section) — so this wraps in a div and lets
  // that CSS do the work rather than restyling controls here.
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="ui-field-hint">{hint}</span>}
    </div>
  );
}

/**
 * Segmented pill control — the date-range switcher on the dashboard and the
 * view switchers elsewhere. Controlled: caller owns the value.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="ui-seg" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          className={cx("ui-seg-item", o.value === value && "ui-seg-item--on")}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Underlined tab strip for page-level sections. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={t.value === value}
          className={cx("tab", t.value === value && "active")}
          onClick={() => onChange(t.value)}
          type="button"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────── Collections ───────────────────────── */

/**
 * Thumbnail + body + right-hand stats/actions. Events, ticket sales and
 * offers are all this shape.
 */
export function ListRow({
  thumbUrl,
  thumb = true,
  title,
  meta,
  badges,
  stats,
  price,
  actions,
  href,
  link: Link = "a",
}: {
  thumbUrl?: string;
  /** Rows for records with no artwork (settlements, contracts) set this false. */
  thumb?: boolean;
  title: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  stats?: React.ReactNode;
  price?: React.ReactNode;
  actions?: React.ReactNode;
  href?: string;
  /** Pass next/link to keep client-side routing; defaults to a plain anchor. */
  link?: React.ElementType;
}) {
  const body = (
    <>
      {thumb && (
        <div
          className="list-thumb"
          style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
        />
      )}
      <div className="list-body">
        <div className="list-title">{title}</div>
        {meta && <div className="list-meta">{meta}</div>}
        {badges && <div className="list-badges">{badges}</div>}
      </div>
      <div className="list-right">
        {stats}
        {price !== undefined && <div className="list-price">{price}</div>}
        {actions && <div className="list-actions">{actions}</div>}
      </div>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
        {body}
      </Link>
    );
  }
  return <div className="list-row">{body}</div>;
}

/**
 * Centred dialog over a scrim. Click the scrim or press Escape to close —
 * both are handled here so no page has to re-implement them.
 */
export function Modal({
  title,
  sub,
  onClose,
  footer,
  width = 580,
  children,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  width?: number;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="ui-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ui-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="ui-modal-head">
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {children}
        {footer && <div className="ui-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** One stat in ListRow's right-hand stack, e.g. Sold / Available. */
export function ListStat({ n, label }: { n: React.ReactNode; label: string }) {
  return (
    <div className="list-stat">
      <div className="n">{n}</div>
      <div className="l">{label}</div>
    </div>
  );
}

/** Real <table> underneath, so semantics and accessibility survive. */
export function DataTable({
  columns,
  children,
}: {
  columns: React.ReactNode[];
  children: React.ReactNode;
}) {
  return (
    <div className="ui-table-scroll">
      <table className="dtable">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/**
 * Month grid shell. Callers supply the 7×N cells; this owns only the grid
 * container and the day-of-week header row.
 */
export function CalendarGrid({
  dayLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"],
  children,
}: {
  dayLabels?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="cal-grid">
      {dayLabels.map((d) => (
        <div key={d} className="cal-dow">
          {d}
        </div>
      ))}
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <div className="ic">{icon}</div>}
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

/* ───────────────────────── Gauges ───────────────────────── */

/** Big circular gauge — Live Pulse, dashboard sell-through. */
export function GaugeRing({
  percent,
  size = 96,
  thickness = 8,
  label,
  sublabel,
}: {
  percent: number;
  size?: number;
  thickness?: number;
  label?: React.ReactNode;
  sublabel?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `conic-gradient(rgba(255,255,255,0.92) ${clamped * 3.6}deg, rgba(255,255,255,0.10) 0deg)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: size - thickness * 2,
          height: size - thickness * 2,
          borderRadius: "50%",
          background: "var(--lg-ink)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-archivo), sans-serif",
            fontWeight: 800,
            fontSize: size * 0.2,
            color: "var(--lg-white)",
          }}
        >
          {label ?? `${Math.round(clamped)}%`}
        </span>
        {sublabel && (
          <span
            style={{
              fontFamily: "var(--font-archivo), sans-serif",
              fontSize: 9,
              color: "var(--lg-sub-dim)",
              marginTop: 2,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Small inline ring for list rows (per-show sold %). */
export function InlineRing({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return (
    <div
      className="ring"
      style={{
        background: `conic-gradient(rgba(255,255,255,0.85) ${clamped * 3.6}deg, transparent 0deg)`,
        border: "none",
        // Without this a flex parent squashes the ring into an oval.
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: "calc(100% - 6px)",
          height: "calc(100% - 6px)",
          borderRadius: "50%",
          background: "var(--lg-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {clamped}%
      </div>
    </div>
  );
}

/* ───────────────────────── Page-specific shells kept for compatibility ───────────────────────── */

/**
 * Report generator card. Kept as its own component because the Reports page
 * repeats it per report type; it is a Card with a fixed inner layout.
 */
export function ReportCard({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="report-card card">
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {children}
      {actions && <div className="report-actions">{actions}</div>}
    </div>
  );
}

/**
 * Camera preview frame. Chrome only — the camera, permission and decode
 * logic stays in the page that uses this.
 */
export function ScannerPanel({
  children,
  placeholder = "CAMERA PREVIEW",
}: {
  children?: React.ReactNode;
  placeholder?: string;
}) {
  return <div className="scan-view">{children ?? <span>{placeholder}</span>}</div>;
}
