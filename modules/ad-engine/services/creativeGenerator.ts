/**
 * Creative Generator — DETERMINISTIC, NO AI.
 *
 * Produces creatives as (asset × hook × copy_variant) cartesian combos.
 * Idempotent: running twice yields the same set because combo_hash is
 * UNIQUE (event_id, combo_hash). Deterministic because the hash is a
 * stable SHA-1 of the three ids.
 */
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-server";
import type { Asset, CopyVariant, Creative, Hook } from "../types";

export type GenerateOptions = {
  event_id: string;
  venue_id?: string | null;
  /** Cap combos to avoid runaway generation. */
  max_combos?: number;
};

export type GenerateResult = {
  generated: number;
  skipped_existing: number;
  total: number;
  creatives: Creative[];
};

export function comboHash(
  asset_id: string,
  hook_id: string | null,
  copy_variant_id: string | null
): string {
  return createHash("sha1")
    .update(`${asset_id}|${hook_id ?? ""}|${copy_variant_id ?? ""}`)
    .digest("hex");
}

async function fetchActive<T>(table: string, event_id: string, venue_id?: string | null) {
  const db = createAdminClient();
  let q = db.from(table).select("*").eq("active", true);
  // Match on event_id OR venue-level (event_id null) to allow shared library
  q = q.or(`event_id.eq.${event_id}${venue_id ? `,and(event_id.is.null,venue_id.eq.${venue_id})` : ""}`);
  const { data } = await q;
  return (data ?? []) as T[];
}

export async function generateCreatives(opts: GenerateOptions): Promise<GenerateResult> {
  const db = createAdminClient();
  const [assets, hooks, copies] = await Promise.all([
    fetchActive<Asset>("ad_engine_assets", opts.event_id, opts.venue_id),
    fetchActive<Hook>("ad_engine_hooks", opts.event_id, opts.venue_id),
    fetchActive<CopyVariant>("ad_engine_copy_variants", opts.event_id, opts.venue_id),
  ]);

  // Hooks/copies are optional — if none exist we still produce asset-only creatives
  const hooksList = hooks.length ? hooks : [null];
  const copiesList = copies.length ? copies : [null];

  const max = opts.max_combos ?? 60;
  const rows: Array<Omit<Creative, "id" | "created_at">> = [];

  for (const a of assets) {
    for (const h of hooksList) {
      for (const c of copiesList) {
        if (rows.length >= max) break;
        rows.push({
          event_id: opts.event_id,
          venue_id: opts.venue_id ?? null,
          asset_id: a.id,
          hook_id: h?.id ?? null,
          copy_variant_id: c?.id ?? null,
          combo_hash: comboHash(a.id, h?.id ?? null, c?.id ?? null),
          status: "draft",
        });
      }
    }
  }

  if (rows.length === 0) {
    return { generated: 0, skipped_existing: 0, total: 0, creatives: [] };
  }

  // Upsert by (event_id, combo_hash) unique constraint. Do not overwrite status.
  const { data: existing } = await db
    .from("ad_engine_creatives")
    .select("combo_hash")
    .eq("event_id", opts.event_id)
    .in(
      "combo_hash",
      rows.map((r) => r.combo_hash)
    );
  const existingSet = new Set(((existing ?? []) as Array<{ combo_hash: string }>).map((r) => r.combo_hash));
  const toInsert = rows.filter((r) => !existingSet.has(r.combo_hash));

  let inserted: Creative[] = [];
  if (toInsert.length > 0) {
    const { data, error } = await db
      .from("ad_engine_creatives")
      .insert(toInsert)
      .select();
    if (error) throw new Error(`generateCreatives: ${error.message}`);
    inserted = (data ?? []) as Creative[];
  }

  return {
    generated: inserted.length,
    skipped_existing: existingSet.size,
    total: rows.length,
    creatives: inserted,
  };
}

export async function listCreatives(event_id: string): Promise<Creative[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("ad_engine_creatives")
    .select("*")
    .eq("event_id", event_id)
    .order("created_at", { ascending: false });
  return (data ?? []) as Creative[];
}
