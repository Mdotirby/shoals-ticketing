/**
 * Email Engine — segmentation service.
 *
 * Compiles a whitelist-validated rule tree into a PostgREST filter
 * expression and evaluates it against the `ee_contact_full` view.
 *
 * Design guarantees:
 *   • Every column reference is validated against SEGMENT_FIELDS.
 *   • Every operator is validated against SEGMENT_OPERATORS.
 *   • Values are coerced per declared type; strings are escape-normalised.
 *   • No raw SQL is executed — only PostgREST-parsed filter expressions.
 *
 * Public surface:
 *   compileRules(rules)           → { expression, meta }
 *   evaluateSegment(client, seg)  → { count, sample, emails? }
 *   previewRules(client, rules)   → { count, sample }
 *   listRecipients(client, seg)   → string[] (emails only, batched)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SEGMENT_FIELDS,
  SEGMENT_OPERATORS,
  type SegmentField,
  type SegmentOperator,
} from "../constants";
import {
  isGroup,
  type EeSegment,
  type SegmentRuleCondition,
  type SegmentRuleGroup,
} from "../types";

// ────────────────────────────────────────────────────────────────────
//  Value coercion + escaping
// ────────────────────────────────────────────────────────────────────

function coerce(
  fieldType: "number" | "string" | "boolean" | "date" | "uuid",
  value: unknown,
): string {
  if (value === null || value === undefined) return "null";
  switch (fieldType) {
    case "number":
      if (typeof value === "number") return String(value);
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return String(Number(value));
      }
      throw new Error(`Expected number, got ${typeof value}`);
    case "boolean":
      if (value === true || value === "true") return "true";
      if (value === false || value === "false") return "false";
      throw new Error(`Expected boolean, got ${String(value)}`);
    case "date": {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${String(value)}`);
      return d.toISOString();
    }
    case "uuid": {
      const s = String(value).trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
        throw new Error(`Invalid uuid: ${s}`);
      }
      return s;
    }
    case "string":
    default:
      // PostgREST reserved: , ( ) . : — strip for safety in filter expressions.
      return String(value).replace(/[,().:]/g, " ").trim();
  }
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString();
}

// ────────────────────────────────────────────────────────────────────
//  Atom compiler: one condition → one PostgREST expression
// ────────────────────────────────────────────────────────────────────

function compileAtom(cond: SegmentRuleCondition): string {
  const meta = SEGMENT_FIELDS[cond.field as SegmentField];
  if (!meta) throw new Error(`Unknown segment field: ${String(cond.field)}`);
  if (!(SEGMENT_OPERATORS as readonly string[]).includes(cond.op)) {
    throw new Error(`Unknown operator: ${String(cond.op)}`);
  }

  const col = meta.column;
  const op = cond.op as SegmentOperator;

  switch (op) {
    case "eq":
      return `${col}.eq.${coerce(meta.type, cond.value)}`;
    case "neq":
      return `${col}.neq.${coerce(meta.type, cond.value)}`;
    case "gt":
      return `${col}.gt.${coerce(meta.type, cond.value)}`;
    case "gte":
      return `${col}.gte.${coerce(meta.type, cond.value)}`;
    case "lt":
      return `${col}.lt.${coerce(meta.type, cond.value)}`;
    case "lte":
      return `${col}.lte.${coerce(meta.type, cond.value)}`;
    case "contains": {
      if (meta.type !== "string") throw new Error(`contains requires string field`);
      const v = coerce(meta.type, cond.value);
      return `${col}.ilike.*${v}*`;
    }
    case "not_contains": {
      if (meta.type !== "string") throw new Error(`not_contains requires string field`);
      const v = coerce(meta.type, cond.value);
      return `not.${col}.ilike.*${v}*`;
    }
    case "is_null":
      return `${col}.is.null`;
    case "is_not_null":
      return `not.${col}.is.null`;
    case "in": {
      if (!Array.isArray(cond.value) || cond.value.length === 0) {
        throw new Error(`in requires a non-empty array`);
      }
      // Expand to or(col.eq.v1, col.eq.v2, …) — robust inside nested groups.
      const parts = cond.value.map((v) => `${col}.eq.${coerce(meta.type, v)}`);
      return parts.length === 1 ? parts[0] : `or(${parts.join(",")})`;
    }
    case "not_in": {
      if (!Array.isArray(cond.value) || cond.value.length === 0) {
        throw new Error(`not_in requires a non-empty array`);
      }
      const parts = cond.value.map((v) => `${col}.neq.${coerce(meta.type, v)}`);
      return parts.length === 1 ? parts[0] : `and(${parts.join(",")})`;
    }
    case "within_last_days": {
      const n = Number(cond.value);
      if (!Number.isFinite(n) || n < 0) throw new Error(`within_last_days needs positive number`);
      return `${col}.gte.${daysAgo(n)}`;
    }
    case "older_than_days": {
      const n = Number(cond.value);
      if (!Number.isFinite(n) || n < 0) throw new Error(`older_than_days needs positive number`);
      return `${col}.lt.${daysAgo(n)}`;
    }
  }
}

// ────────────────────────────────────────────────────────────────────
//  Tree compiler
// ────────────────────────────────────────────────────────────────────

function compileNode(node: SegmentRuleCondition | SegmentRuleGroup): string {
  if (isGroup(node)) {
    if (!node.conditions || node.conditions.length === 0) {
      // Empty group → tautology / contradiction based on op.
      // Return a safe no-op that matches everything.
      return "email.not.is.null";
    }
    const inner = node.conditions.map(compileNode).filter(Boolean).join(",");
    return node.op === "AND" ? `and(${inner})` : `or(${inner})`;
  }
  return compileAtom(node);
}

export type CompiledSegment = {
  expression: string;
  /** How many atomic conditions were compiled — UI stat. */
  atomCount: number;
};

export function compileRules(rules: SegmentRuleGroup): CompiledSegment {
  let atoms = 0;
  const walk = (n: SegmentRuleCondition | SegmentRuleGroup) => {
    if (isGroup(n)) n.conditions.forEach(walk);
    else atoms++;
  };
  walk(rules);
  return { expression: compileNode(rules), atomCount: atoms };
}

// ────────────────────────────────────────────────────────────────────
//  Evaluation against ee_contact_full
// ────────────────────────────────────────────────────────────────────

const VIEW = "ee_contact_full";
const SAMPLE_SIZE = 20;

export type SegmentEvalResult = {
  count: number;
  sample: { email: string; first_name: string | null; last_name: string | null }[];
};

export async function previewRules(
  client: SupabaseClient,
  rules: SegmentRuleGroup,
): Promise<SegmentEvalResult> {
  const { expression } = compileRules(rules);

  // HEAD request for count — no rows transferred
  const countRes = await client
    .from(VIEW)
    .select("email", { count: "exact", head: true })
    .or(expression);
  if (countRes.error) throw new Error(`Segment count failed: ${countRes.error.message}`);
  const count = countRes.count ?? 0;

  const sampleRes = await client
    .from(VIEW)
    .select("email, first_name, last_name")
    .or(expression)
    .limit(SAMPLE_SIZE);
  if (sampleRes.error) throw new Error(`Segment sample failed: ${sampleRes.error.message}`);

  return { count, sample: sampleRes.data ?? [] };
}

export async function evaluateSegment(
  client: SupabaseClient,
  segment: Pick<EeSegment, "id" | "rules">,
): Promise<SegmentEvalResult> {
  const res = await previewRules(client, segment.rules);

  // Cache the count on the segment row for fast UI reads.
  await client
    .from("ee_segments")
    .update({ last_count: res.count, last_evaluated: new Date().toISOString() })
    .eq("id", segment.id);

  return res;
}

/**
 * Stream recipient emails in pages of 1,000 — used at campaign dispatch time.
 * Returns all matching lowercased emails that are not suppressed/unsubscribed
 * (the view already filters those).
 */
export async function listRecipients(
  client: SupabaseClient,
  segment: Pick<EeSegment, "rules"> | { rules: SegmentRuleGroup },
): Promise<{ email: string; first_name: string | null; last_name: string | null }[]> {
  const { expression } = compileRules(segment.rules);
  const pageSize = 1000;
  let from = 0;
  const all: { email: string; first_name: string | null; last_name: string | null }[] = [];
  for (;;) {
    const { data, error } = await client
      .from(VIEW)
      .select("email, first_name, last_name")
      .or(expression)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`listRecipients failed: ${error.message}`);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    if (all.length > 500_000) break; // hard safety cap
  }
  return all;
}

// ────────────────────────────────────────────────────────────────────
//  Convenience: pre-canned rule builders matching the spec examples
// ────────────────────────────────────────────────────────────────────

export const PRESETS = {
  attended_event_in_last_30_days(): SegmentRuleGroup {
    return {
      op: "AND",
      conditions: [{ field: "last_event_date", op: "within_last_days", value: 30 }],
    };
  },
  total_spent_over(amount: number): SegmentRuleGroup {
    return {
      op: "AND",
      conditions: [{ field: "total_spent", op: "gt", value: amount }],
    };
  },
  never_purchased(): SegmentRuleGroup {
    return {
      op: "AND",
      conditions: [{ field: "total_orders", op: "eq", value: 0 }],
    };
  },
  clicked_but_not_bought(): SegmentRuleGroup {
    return {
      op: "AND",
      conditions: [
        { field: "emails_clicked", op: "gt", value: 0 },
        { field: "total_orders", op: "eq", value: 0 },
      ],
    };
  },
  fwb_subscribers(): SegmentRuleGroup {
    return {
      op: "AND",
      conditions: [{ field: "is_fwb_subscriber", op: "eq", value: true }],
    };
  },
  vip_whales(): SegmentRuleGroup {
    return {
      op: "OR",
      conditions: [
        { field: "lfv_segment", op: "eq", value: "whale" },
        { field: "total_spent", op: "gte", value: 500 },
      ],
    };
  },
  dormant_60d(): SegmentRuleGroup {
    return {
      op: "AND",
      conditions: [
        { field: "total_orders", op: "gt", value: 0 },
        { field: "last_order_at", op: "older_than_days", value: 60 },
      ],
    };
  },
};
