"use client";

/**
 * Per-show data more than one hub section reads — the show's orders, its
 * tracking links and its contracts. Each loads the first time a section
 * asks and is shared after that, so moving between Summary, Marketing and
 * Orders doesn't refetch a thousand orders each time. `refresh` drops the
 * cache for a section that has just changed something.
 */

import { useCallback, useEffect, useState } from "react";

export type HubOrder = {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone?: string | null;
  total_amount: number | null;
  quantity: number | null;
  created_at: string;
  status: string;
  source: string | null;
  tracking_link_slug: string | null;
  promo_code_id: string | null;
  utm_source?: string | null;
  notes?: string | null;
};

export type HubLink = {
  id: string;
  slug: string;
  label: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  clicks: number | null;
  is_active: boolean | null;
  destination_url: string | null;
  created_at: string;
};

export type HubContract = { id: string; event_id: string | null; status: string; signed_at: string | null; version: number | null; file_url: string | null };

type Entry<T> = { data: T | null; promise: Promise<T> | null; subs: Set<() => void> };
const cache = new Map<string, Entry<unknown>>();

function entry<T>(key: string): Entry<T> {
  let e = cache.get(key) as Entry<T> | undefined;
  if (!e) { e = { data: null, promise: null, subs: new Set() }; cache.set(key, e as Entry<unknown>); }
  return e;
}

function useShared<T>(key: string, load: () => Promise<T>): { data: T | null; refresh: () => void } {
  const e = entry<T>(key);
  const [, force] = useState(0);
  const kick = useCallback(() => {
    const en = entry<T>(key);
    en.promise = load().then((d) => { en.data = d; en.subs.forEach((fn) => fn()); return d; });
    en.promise.catch(() => { en.promise = null; });
  }, [key, load]);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    e.subs.add(fn);
    if (!e.data && !e.promise) kick();
    return () => { e.subs.delete(fn); };
  }, [e, kick]);
  return { data: e.data, refresh: kick };
}

async function supabase() {
  const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
  return getSupabaseBrowser();
}

export function useEventOrders(eventId: string) {
  const load = useCallback(async () => {
    const sb = await supabase();
    const out: HubOrder[] = [];
    // PostgREST stops at 1,000 rows without saying so — page through.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb
        .from("orders")
        .select("id, customer_name, customer_email, customer_phone, total_amount, quantity, created_at, status, source, tracking_link_slug, promo_code_id, utm_source, notes")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .range(from, from + 999);
      if (error || !data) break;
      out.push(...(data as HubOrder[]));
      if (data.length < 1000) break;
    }
    return out;
  }, [eventId]);
  return useShared<HubOrder[]>(`orders:${eventId}`, load);
}

export function useEventLinks(eventId: string) {
  const load = useCallback(async () => {
    const sb = await supabase();
    const { data } = await sb
      .from("trackable_links")
      .select("id, slug, label, source, medium, campaign, clicks, is_active, destination_url, created_at")
      .eq("event_id", eventId)
      .order("created_at");
    return (data as HubLink[]) ?? [];
  }, [eventId]);
  return useShared<HubLink[]>(`links:${eventId}`, load);
}

export function useEventContracts(eventId: string, venueId: string | null) {
  const load = useCallback(async () => {
    if (!venueId) return [] as HubContract[];
    const r = await fetch(`/api/contracts?venue_id=${venueId}`);
    const d = r.ok ? await r.json() : [];
    return (Array.isArray(d) ? d : []).filter((c: HubContract) => c.event_id === eventId) as HubContract[];
  }, [eventId, venueId]);
  return useShared<HubContract[]>(`contracts:${eventId}:${venueId ?? ""}`, load);
}

/** A paid sale that counts toward pace and attribution: not a comp, not refunded. */
export function isPaidSale(o: HubOrder) {
  return o.status === "paid" && o.source !== "comp";
}
