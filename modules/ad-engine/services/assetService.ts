/**
 * Asset Management — CRUD + tag filters.
 * Stateless wrappers around ad_engine_assets.
 */
import { createAdminClient } from "@/lib/supabase-server";
import type { Asset, AssetKind } from "../types";

export async function listAssets(opts: {
  event_id?: string;
  venue_id?: string;
  kind?: AssetKind;
  active_only?: boolean;
}): Promise<Asset[]> {
  const db = createAdminClient();
  let q = db.from("ad_engine_assets").select("*");
  if (opts.event_id) q = q.eq("event_id", opts.event_id);
  if (opts.venue_id) q = q.eq("venue_id", opts.venue_id);
  if (opts.kind) q = q.eq("kind", opts.kind);
  if (opts.active_only) q = q.eq("active", true);
  q = q.order("created_at", { ascending: false });
  const { data } = await q;
  return (data ?? []) as Asset[];
}

export async function createAsset(
  input: Omit<Asset, "id" | "created_at" | "updated_at">
): Promise<Asset> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("ad_engine_assets")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Asset;
}

export async function updateAsset(id: string, patch: Partial<Asset>): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("ad_engine_assets")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deactivateAsset(id: string): Promise<void> {
  await updateAsset(id, { active: false });
}
