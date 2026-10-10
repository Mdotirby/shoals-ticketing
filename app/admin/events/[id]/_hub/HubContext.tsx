"use client";

/**
 * What every hub section shares: the show, its tiers and capacity, the
 * linked offer and settlement, and the headline money. Loaded once by the
 * hub so the header, the sub-nav badges and the sections read the same
 * figures; a section that changes one of them calls `reload()`.
 *
 * Also the hub's unsaved-changes registry. An editable section reports how
 * many changes it holds and how to save or discard them; the shell turns
 * that into the save bar, the sub-nav dot and the leave confirm, so no
 * section draws its own.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { resolveCapacity } from "@/lib/capacity";
import { breakEvenShare } from "@/lib/offers/walkout";
import { offerTotals } from "@/lib/offers/totals";
import { useAdminNav } from "@/app/components/admin/AdminNavContext";
import type { HubTab } from "./config";

export type HubEvent = {
  id: string;
  title: string;
  subtitle: string | null;
  venue: string;
  venue_id: string | null;
  date: string;
  start_time: string | null;
  doors_time: string | null;
  image_url: string | null;
  status: string | null;
  age_restriction: string | null;
  event_type: string | null;
  booking_status: string | null;
  talent_buyer: string | null;
  booking_agent: string | null;
  [k: string]: unknown;
};

export type HubTier = {
  id: string;
  tier_name: string;
  price: number;
  capacity: number;
  quantity_sold: number;
  [k: string]: unknown;
};

export type HubHold = {
  id: string;
  ticket_tier_id: string | null;
  ticket_tiers: { tier_name: string } | null;
  quantity: number;
  hold_type: "artist" | "promoter" | "house_comp" | "other";
  owner_label: string;
  reason: string | null;
  release_note: string | null;
};

export type HubOffer = {
  id: string;
  status: string | null;
  version: number | null;
  guarantee: number | null;
  backend_percentage: number | string | null;
  deal_type: string | null;
  agent_name: string | null;
  agency: string | null;
  net_potential: number | null;
  total_fixed: number | null;
  total_variable: number | null;
  ticket_scaling: { comps?: number | null; kills?: number | null; sellable_cap?: number | null }[] | null;
  artist_comps: number | null;
  marketing_comps: number | null;
};

export type HubGuest = {
  id: string;
  first_name: string;
  last_name: string;
  quantity: number;
  artist_id?: string | null;
  checked_in_at?: string | null;
  [k: string]: unknown;
};

export type HubRevenue = {
  grossRevenue: number;
  ticketRevenue: number;
  serviceFeesGross: number;
  facilityFeesGross?: number;
  taxCollected: number;
  processingFees: number;
  netToVenue: number;
  refundTotal?: number;
};

type Load<T> = { state: "loading" | "ok" | "denied" | "error"; data: T | null };

type Dirty = { count: number; save: () => Promise<boolean> | boolean; discard: () => void };

type HubState = {
  id: string;
  role: string;
  event: HubEvent | null;
  setEvent: (fn: (e: HubEvent) => HubEvent) => void;
  notFound: boolean;
  tiers: HubTier[];
  holds: HubHold[];
  guests: HubGuest[];
  venue: { id: string; name: string; capacity: number | null } | null;
  offer: HubOffer | null | undefined;
  settlement: { id: string; status: string } | null | undefined;
  revenue: Load<HubRevenue>;
  promoActive: number | null;
  sold: number;
  capacity: ReturnType<typeof resolveCapacity>;
  breakEven: number | null;
  reload: (what?: Array<"event" | "tiers" | "holds" | "guests" | "offer" | "settlement" | "revenue" | "promos">) => void;
  dirty: Partial<Record<HubTab, Dirty>>;
  reportDirty: (tab: HubTab, d: Dirty | null) => void;
  toast: (msg: string) => void;
  toastMsg: string;
};

const Ctx = createContext<HubState | null>(null);

export function useHub(): HubState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHub outside HubProvider");
  return v;
}

/**
 * A section's half of the unsaved-changes registry: report the count every
 * render, and clear it when the section unmounts.
 */
export function useSectionDirty(tab: HubTab, count: number, save: Dirty["save"], discard: Dirty["discard"]) {
  const { reportDirty } = useHub();
  const ref = useRef({ save, discard });
  useEffect(() => { ref.current = { save, discard }; });
  useEffect(() => {
    reportDirty(tab, count > 0 ? { count, save: () => ref.current.save(), discard: () => ref.current.discard() } : null);
  }, [tab, count, reportDirty]);
  useEffect(() => () => reportDirty(tab, null), [tab, reportDirty]);
}

async function json<T>(url: string): Promise<Load<T>> {
  try {
    const r = await fetch(url);
    if (r.status === 401 || r.status === 403) return { state: "denied", data: null };
    if (!r.ok) return { state: "error", data: null };
    return { state: "ok", data: (await r.json()) as T };
  } catch {
    return { state: "error", data: null };
  }
}

export function HubProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const { role } = useAdminNav();
  const [event, setEventRaw] = useState<HubEvent | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tiers, setTiers] = useState<HubTier[]>([]);
  const [holds, setHolds] = useState<HubHold[]>([]);
  const [guests, setGuests] = useState<HubGuest[]>([]);
  const [venue, setVenue] = useState<HubState["venue"]>(null);
  const [offer, setOffer] = useState<HubOffer | null | undefined>(undefined);
  const [settlement, setSettlement] = useState<HubState["settlement"]>(undefined);
  const [revenue, setRevenue] = useState<Load<HubRevenue>>({ state: "loading", data: null });
  const [promoActive, setPromoActive] = useState<number | null>(null);
  const [dirty, setDirty] = useState<HubState["dirty"]>({});
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loaders = useMemo(() => ({
    event: async () => {
      const r = await json<HubEvent & { error?: string }>(`/api/events/${id}`);
      if (r.state !== "ok" || !r.data || r.data.error) { setNotFound(true); return; }
      const ev = r.data;
      setEventRaw(ev);
      if (ev.venue_id) {
        const v = await json<Array<{ id: string; name: string; capacity: number | null }>>("/api/venues");
        const row = Array.isArray(v.data) ? v.data.find((x) => x.id === ev.venue_id) : null;
        setVenue(row ?? null);
      }
    },
    tiers: async () => {
      // admin=1 adds unlock codes — only for roles the route lets see them.
      const r = await json<HubTier[]>(`/api/events/${id}/ticket-types?admin=1`);
      setTiers(Array.isArray(r.data) ? r.data : []);
    },
    holds: async () => {
      const r = await json<HubHold[]>(`/api/events/${id}/holds`);
      setHolds(Array.isArray(r.data) ? r.data : []);
    },
    guests: async () => {
      const r = await json<HubGuest[]>(`/api/artists/guests?event_id=${id}`);
      setGuests(Array.isArray(r.data) ? r.data : []);
    },
    offer: async () => {
      const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
      const { data } = await getSupabaseBrowser()
        .from("artist_offers")
        .select("*")
        .eq("event_id", id)
        .is("superseded_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setOffer((data as HubOffer) ?? null);
    },
    settlement: async () => {
      const r = await json<Array<{ id: string; status: string }>>(`/api/settlements?event_id=${id}`);
      const row = Array.isArray(r.data) && r.data.length ? r.data[0] : null;
      setSettlement(row ? { id: row.id, status: row.status } : null);
    },
    revenue: async () => setRevenue(await json<HubRevenue>(`/api/events/${id}/revenue-summary`)),
    promos: async () => {
      type P = { active?: boolean; is_presale?: boolean; max_uses?: number | null; current_uses?: number | null; expires_at?: string | null };
      const r = await json<P[]>(`/api/promo-codes?event_id=${id}`);
      const now = Date.now();
      // The badge counts codes a buyer could use right now — not ended or used up.
      setPromoActive(Array.isArray(r.data)
        ? r.data.filter((p) => p.active && !(p.max_uses && (p.current_uses ?? 0) >= p.max_uses) && !(p.expires_at && new Date(p.expires_at).getTime() < now)).length
        : null);
    },
  }), [id]);

  const reload = useCallback<HubState["reload"]>((what) => {
    const keys = what ?? (Object.keys(loaders) as Array<keyof typeof loaders>);
    keys.forEach((k) => { loaders[k]().catch(() => {}); });
  }, [loaders]);

  useEffect(() => { reload(); }, [reload]);

  const setEvent = useCallback((fn: (e: HubEvent) => HubEvent) => setEventRaw((e) => (e ? fn(e) : e)), []);

  const reportDirty = useCallback((tab: HubTab, d: Dirty | null) => {
    setDirty((prev) => {
      if (!d && !prev[tab]) return prev;
      if (d && prev[tab]?.count === d.count) return { ...prev, [tab]: d };
      const next = { ...prev };
      if (d) next[tab] = d; else delete next[tab];
      return next;
    });
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2600);
  }, []);

  // Room and sellable are two numbers — lib/capacity decides, and sell-through
  // divides by sellable, so the header agrees with the dashboard.
  const sold = tiers.reduce((s, t) => s + (t.quantity_sold || 0), 0);
  const capacity = resolveCapacity({
    roomCapacity: venue?.capacity ?? null,
    tiers,
    holds,
    sold,
    offerScaling: offer?.ticket_scaling ?? null,
    offerArtistComps: offer?.artist_comps ?? null,
    offerMarketingComps: offer?.marketing_comps ?? null,
  });

  // To break even — the offer's own walkout on the offer's own sellable, with
  // its totals recomputed by lib/offers/totals exactly as the builder and the
  // Deal section compute them (stored totals can lag the builder's math).
  const breakEven = useMemo(() => {
    if (!offer) return null;
    const t = offerTotals(offer as unknown as Record<string, unknown>);
    const offerSellable = (offer.ticket_scaling ?? []).reduce((n, r) => n + (Number(r.sellable_cap) || 0), 0);
    if (!t.netPotential || offerSellable <= 0) return null;
    const share = breakEvenShare({
      netPotential: t.netPotential,
      totalFixed: t.totalFixed,
      totalVariable: t.totalVariable,
      sellable: offerSellable,
      guarantee: Number(offer.guarantee) || 0,
      backendPct: Number(offer.backend_percentage) || 0,
      dealType: String(offer.deal_type || "FLAT"),
    });
    return share === null ? null : Math.ceil(share * offerSellable);
  }, [offer]);

  const value: HubState = {
    id, role, event, setEvent, notFound, tiers, holds, guests, venue, offer, settlement, revenue, promoActive,
    sold, capacity, breakEven, reload, dirty, reportDirty, toast, toastMsg,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
