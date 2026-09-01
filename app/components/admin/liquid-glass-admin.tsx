"use client";

/**
 * Liquid glass — admin-only component layer.
 *
 * Design doc: design/liquid-glass/ADMIN_PORTAL_DESIGN_SYSTEM.md
 *
 * These are thin wrappers around the classes defined in the "ADMIN PORTAL —
 * LIQUID GLASS" section of app/styles/globals.css (scoped under
 * body[data-theme="liquid-glass"] .admin-shell) — nothing here duplicates
 * that CSS, it just gives page code a typed, consistent way to reach for
 * it instead of hand-writing the same className combinations on every page.
 *
 * Not included: Sidebar. The real sidebar in app/admin/layout.tsx already
 * does everything the design doc's Sidebar section asks for (auto-expanding
 * only the active group, role-based visibility) — it was restyled in place
 * via its own existing class names, not replaced with a new component.
 * KpiTile is the same story: app/admin/page.tsx's existing .dash-kpi-*
 * markup was restyled in place, not wrapped in a new component here.
 */

import React from "react";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------------------------------------------------------
   StatusBadge — draft / live / good / bad / info variants
--------------------------------------------------------------- */
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

/** Plain neutral tag — type/category labels that carry no status meaning
 *  (Hard Ticket, Private, All Ages, etc.). Never gold, doesn't change. */
export function Tag({ children }: { children: React.ReactNode }) {
  return <span className="tag">{children}</span>;
}

/* ---------------------------------------------------------------
   ListRow — thumbnail + body + right stats/actions. Events, Ticket
   Sales, and Booking/Offers all share this shape.
--------------------------------------------------------------- */
export function ListRow({
  thumbUrl,
  title,
  meta,
  badges,
  stats,
  price,
  actions,
  href,
}: {
  thumbUrl?: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  stats?: React.ReactNode;
  price?: React.ReactNode;
  actions?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <div
        className="list-thumb"
        style={thumbUrl ? { backgroundImage: `url(${thumbUrl})` } : undefined}
      />
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
      <a href={href} className="list-row" style={{ textDecoration: "none", color: "inherit" }}>
        {body}
      </a>
    );
  }
  return <div className="list-row">{body}</div>;
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

/* ---------------------------------------------------------------
   DataTable — the one genuine data table in the portal (Contracts).
   Plain <table> underneath so real accessibility/semantics survive.
--------------------------------------------------------------- */
export function DataTable({
  columns,
  children,
}: {
  columns: string[];
  children: React.ReactNode;
}) {
  return (
    <table className="dtable">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/* ---------------------------------------------------------------
   CalendarGrid — month grid shell. Callers supply the 7×N cells;
   this only owns the grid container and day-of-week header row.
--------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   ReportCard — a report generator card (Ticket Audit, Monthly Revenue,
   etc.) — repeats cleanly for any future report type.
--------------------------------------------------------------- */
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

/* ---------------------------------------------------------------
   ScannerPanel — camera preview frame shell. Restyles the chrome only —
   the real camera/permission/decode logic lives in the page that uses
   this, passed through as children/props, never touched here.
--------------------------------------------------------------- */
export function ScannerPanel({
  children,
  placeholder = "CAMERA PREVIEW",
}: {
  children?: React.ReactNode;
  placeholder?: string;
}) {
  return <div className="scan-view">{children ?? <span>{placeholder}</span>}</div>;
}

/* ---------------------------------------------------------------
   GaugeRing — circular percentage gauge (Live Pulse's Tickets Sold /
   Checked In, Ticket Sales' small sold-percentage ring). Pure CSS
   conic-gradient, no chart library.
--------------------------------------------------------------- */
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
  const clamped = Math.max(0, Math.min(100, percent));
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
        <span style={{ fontFamily: "var(--font-archivo), sans-serif", fontWeight: 800, fontSize: size * 0.2, color: "var(--lg-white)" }}>
          {label ?? `${Math.round(clamped)}%`}
        </span>
        {sublabel && (
          <span style={{ fontFamily: "var(--font-archivo), sans-serif", fontSize: 9, color: "var(--lg-sub-dim)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
}

/** Small inline ring for list rows (Ticket Sales' per-show sold %) —
 *  the design doc's .ring, distinct from GaugeRing's bigger dashboard
 *  version above. */
export function InlineRing({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className="ring"
      style={{
        background: `conic-gradient(rgba(255,255,255,0.85) ${clamped * 3.6}deg, transparent 0deg)`,
        border: "none",
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

/* ---------------------------------------------------------------
   EmptyState
--------------------------------------------------------------- */
export function EmptyState({
  icon,
  title,
  description,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <div className="empty">
      {icon && <div className="ic">{icon}</div>}
      <h4>{title}</h4>
      {description && <p>{description}</p>}
    </div>
  );
}
