"use client";

/**
 * DEPRECATED — kept only so existing imports keep resolving.
 *
 * Everything that lived here now lives in app/components/admin/ui.tsx, the
 * single shared primitive layer. New code should import from there:
 *
 *   import { Card, Kpi, ListRow } from "@/app/components/admin/ui";
 *
 * This file re-exports the old names unchanged so the Event Workspace (the
 * one page that imported this) keeps working without a same-commit rewrite.
 * Delete it once that import is moved.
 */

export {
  StatusBadge,
  Tag,
  ListRow,
  ListStat,
  DataTable,
  CalendarGrid,
  ReportCard,
  ScannerPanel,
  GaugeRing,
  InlineRing,
  EmptyState,
} from "./ui";

export type { BadgeVariant } from "./ui";
