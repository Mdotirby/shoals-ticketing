import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

/**
 * Expense Report API
 * Returns operational expenses grouped by event or category.
 *
 * Query params:
 *   ?venue_id=UUID
 *   ?event_id=UUID
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   ?format=csv
 */
export async function GET(request: Request) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const venueId = searchParams.get("venue_id");
  const eventId = searchParams.get("event_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format");

  try {
    // 1. Operational expenses
    let opQuery = supabase
      .from("operational_expenses")
      .select("*, events(title)")
      .order("expense_date", { ascending: false });

    if (venueId) opQuery = opQuery.eq("venue_id", venueId);
    if (eventId) opQuery = opQuery.eq("event_id", eventId);
    if (from) opQuery = opQuery.gte("expense_date", from);
    if (to) opQuery = opQuery.lte("expense_date", to);

    const { data: opExpenses, error: opErr } = await opQuery;
    if (opErr) throw opErr;

    // 2. Settlement expenses (per-show)
    let settQuery = supabase
      .from("settlement_expenses")
      .select("*, settlements(event_id, events(title))")
      .order("created_at", { ascending: false });

    if (eventId) {
      settQuery = settQuery.eq("settlements.event_id", eventId);
    }

    const { data: settExpenses } = await settQuery;

    // 3. Group operational expenses by category
    const byCategory: Record<string, number> = {};
    const byEvent: Record<string, { event_title: string; total: number; items: unknown[] }> = {};
    let grandTotal = 0;

    const rows: Array<{
      id: string;
      source: string;
      category: string;
      description: string;
      amount: number;
      expense_date: string;
      event_title: string | null;
    }> = [];

    for (const exp of opExpenses ?? []) {
      const amt = Number(exp.amount) || 0;
      grandTotal += amt;
      const cat = exp.category || "other";
      byCategory[cat] = (byCategory[cat] || 0) + amt;

      const eventTitle =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (exp as any).events?.title ?? "General / No Event";
      const eid = exp.event_id || "general";
      if (!byEvent[eid]) {
        byEvent[eid] = { event_title: eventTitle, total: 0, items: [] };
      }
      byEvent[eid].total += amt;

      rows.push({
        id: exp.id,
        source: "operational",
        category: cat,
        description: exp.description,
        amount: amt,
        expense_date: exp.expense_date,
        event_title: eventTitle,
      });
    }

    // Add settlement expenses if available
    for (const sExp of settExpenses ?? []) {
      const amt = Number(sExp.actual_amount || sExp.amount) || 0;
      grandTotal += amt;
      const cat = sExp.category || "settlement_expense";
      byCategory[cat] = (byCategory[cat] || 0) + amt;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sett = (sExp as any).settlements;
      const eventTitle = sett?.events?.title ?? "Settlement Expense";
      const eid = sett?.event_id || "settlement";
      if (!byEvent[eid]) {
        byEvent[eid] = { event_title: eventTitle, total: 0, items: [] };
      }
      byEvent[eid].total += amt;

      rows.push({
        id: sExp.id,
        source: "settlement",
        category: cat,
        description: sExp.name || sExp.description || "",
        amount: amt,
        expense_date: sExp.created_at?.slice(0, 10) ?? "",
        event_title: eventTitle,
      });
    }

    const result = {
      rows,
      by_category: Object.entries(byCategory)
        .map(([category, total]) => ({ category, total: r2(total) }))
        .sort((a, b) => b.total - a.total),
      by_event: Object.entries(byEvent)
        .map(([event_id, data]) => ({
          event_id,
          event_title: data.event_title,
          total: r2(data.total),
        }))
        .sort((a, b) => b.total - a.total),
      grand_total: r2(grandTotal),
    };

    if (format === "csv") {
      return csvResponse(result);
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function csvResponse(data: any) {
  const lines: string[] = [];

  lines.push("EXPENSE REPORT");
  lines.push("");
  lines.push("Date,Category,Description,Event,Source,Amount");

  for (const row of data.rows) {
    lines.push(
      [
        row.expense_date,
        csvEsc(row.category),
        csvEsc(row.description),
        csvEsc(row.event_title ?? ""),
        row.source,
        `$${row.amount.toFixed(2)}`,
      ].join(",")
    );
  }

  lines.push("");
  lines.push("BY CATEGORY");
  for (const cat of data.by_category) {
    lines.push(`${csvEsc(cat.category)},$${cat.total.toFixed(2)}`);
  }

  lines.push("");
  lines.push("BY EVENT");
  for (const ev of data.by_event) {
    lines.push(`${csvEsc(ev.event_title)},$${ev.total.toFixed(2)}`);
  }

  lines.push("");
  lines.push(`GRAND TOTAL,$${data.grand_total.toFixed(2)}`);

  const csv = lines.join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="expense-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEsc(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
