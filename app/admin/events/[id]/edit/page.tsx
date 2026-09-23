"use client";

import { isHardTicket as isHardTicketType } from "@/lib/eventClass";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ImageCropper from "@/app/components/ImageCropper";
import TrackableLinkQRModal from "@/app/components/admin/TrackableLinkQRModal";
import { TicketTierDraft } from "@/lib/types/ticket";
import { getCookie } from "@/lib/cookies";
import { formatPhoneNumber } from "@/lib/formatPhone";
import { useIsMobile } from "@/lib/useIsMobile";
import { useTabParam } from "@/lib/admin/useTabParam";
import { fmtUSD } from "@/app/components/admin/ui";
import TierFeePanel, { type TierFeeContext } from "@/app/components/admin/TierFeePanel";
import { breakEvenShare } from "@/lib/offers/walkout";

type EventVenue = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null; facility_fee?: number | null; ticketing_fee?: number | null; tax_rate?: number | null; tax_method?: string | null };

type RevenueItem = {
  id?: string;
  category: string;
  amount: string;
};

/** Tabs per handoff/screens/eventedit.dc.html; the sidebar links to ?tab=. */
const EE_TABS = [
  { key: "setup", label: "Setup" },
  { key: "tickets", label: "Tickets" },
  { key: "onsale", label: "On-sale & fees" },
  { key: "promo", label: "Promo & tracking" },
] as const;
const EE_TAB_KEYS = EE_TABS.map((t) => t.key);

type TicketingKpis = {
  paidTickets: number;
  compedTickets: number;
  sellable: number;
  sellThrough: number;
  gross: number;
  feesRetained: number;
};

type AuditRow = { id: string; action: string; created_at: string; detail: Record<string, unknown> | null };

/** One line of the "Recent changes" card. */
function describeAudit(a: AuditRow): string {
  const who = (a.detail?.actor_email as string | undefined)?.split("@")[0] ?? "Someone";
  if (a.action === "event.unlocked_for_edit") return `${who} unlocked the show for editing.`;
  if (a.action === "event.edited_while_selling") {
    const changes = (a.detail?.changes as { field: string }[] | undefined) ?? [];
    return `${who} changed ${changes.map((c) => c.field.replace(/_id$/, "").replace(/_/g, " ")).join(", ") || "locked fields"}.`;
  }
  return `${who}: ${a.action.replace(/[._]/g, " ")}.`;
}

const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.webp";
const MAX_TIERS = 8;

const REVENUE_CATEGORIES = [
  { value: "room_rental", label: "Room Rental" },
  { value: "production", label: "Production" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "setup", label: "Setup - Tables & Chairs" },
  { value: "labor", label: "Labor" },
];

function emptyTier(): TicketTierDraft {
  return { tier_name: "", price: "", capacity: "" };
}

// Convert a UTC ISO string to date + time strings in America/Chicago timezone
function utcToChicago(utcIso: string): { date: string; time: string } {
  const dt = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(dt);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

// Convert a date + time entered as America/Chicago to a UTC ISO string
function chicagoToUtcIso(date: string, time: string): string {
  const naive = `${date}T${time || "00:00"}:00`;
  // Start guess: CST = UTC-6
  let guess = new Date(`${naive}-06:00`);
  for (let i = 0; i < 3; i++) {
    const { date: cd, time: ct } = utcToChicago(guess.toISOString());
    const diff = new Date(naive).getTime() - new Date(`${cd}T${ct}:00`).getTime();
    if (Math.abs(diff) < 30000) break;
    guess = new Date(guess.getTime() + diff);
  }
  return guess.toISOString();
}

export default function AdminEditEventPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFlyer, setUploadingFlyer] = useState(false);
  const flyerInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [selectedEventVenueId, setSelectedEventVenueId] = useState<string | null>(null);
  const [selectedVenueFees, setSelectedVenueFees] = useState<{ facility_fee: number | null }>({ facility_fee: null });
  const [taxMethod, setTaxMethod] = useState<"multiplier" | "divisor">("multiplier");
  // Track whether the event has its own tax_method so venue load doesn't override it
  const taxMethodFromEventRef = useRef(false);
  // Independent of tax_method — bakes ticketing fee + facility fee into the sticker price.
  const [feesIncludedInPrice, setFeesIncludedInPrice] = useState(false);
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(null);
  const [availableHosts, setAvailableHosts] = useState<{ id: string; name: string }[]>([]);

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    venue: "",
    date: "",
    time: "",
    // Doors, age policy and deal type are columns the workspace already reads
    // and displays; no form ever wrote them, so the workspace's "Doors · show ·
    // age" line was permanently a dash.
    doors_time: "",
    age_restriction: "",
    deal_type: "own_risk",
    description: "",
    image_url: "",
    email_flyer_url: "",
    event_type: "hard_ticket",
    booking_status: "confirmed",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    // Private event fields
    client_name: "",
    client_email: "",
    client_phone: "",
    client_billing_address: "",
    client_company: "",
    tax_exempt: false,
    start_time: "",
    end_time: "",
    venue_address: "",
  });

  // External ticketing state
  const [externalTicketUrl, setExternalTicketUrl] = useState("");
  const [externalTicketLabel, setExternalTicketLabel] = useState("");
  const [metaPixelId, setMetaPixelId] = useState("");
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [spotifyMonthlyListeners, setSpotifyMonthlyListeners] = useState("");
  const [spotifyFeaturedTrack, setSpotifyFeaturedTrack] = useState("");
  const [spotifyFeaturedTrackStart, setSpotifyFeaturedTrackStart] = useState("");

  // On-sale scheduler state
  const [onSaleDate, setOnSaleDate] = useState("");
  const [onSaleTime, setOnSaleTime] = useState("");

  const [tiers, setTiers] = useState<TicketTierDraft[]>([]);

  // Free event state
  /**
   * Free is not a switch any more — it is what the tiers say.
   *
   * The Free Event checkbox forced every tier to $0 and disabled the price
   * field, which is exactly what made a paid wristband beside a free GA
   * impossible. Tier prices and per-tier fee modes express everything it
   * expressed, so the flag is derived here and written back on save to keep
   * events.is_free truthful for the readers that still consult it.
   */
  const isFree = tiers.length > 0 && tiers.every((t) => (parseFloat(t.price) || 0) === 0);

  // Reserved seating state
  const [reservedSeatingEnabled, setReservedSeatingEnabled] = useState(false);
  const [seatingLayouts, setSeatingLayouts] = useState<{ id: string; name: string }[]>([]);
  const [selectedLayoutId, setSelectedLayoutId] = useState<string | null>(null);

  // Load seating layouts + existing map
  useEffect(() => {
    fetch("/api/seating/layouts")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSeatingLayouts(data); })
      .catch(() => {});
    fetch(`/api/seating/events/${id}/map`)
      .then((r) => r.json())
      .then((data) => {
        if (data && data.enabled) {
          setReservedSeatingEnabled(true);
          setSelectedLayoutId(data.layout_id || null);
        }
      })
      .catch(() => {});
  }, [id]);

  // Revenue items for private events
  const [revenueItems, setRevenueItems] = useState<RevenueItem[]>(
    REVENUE_CATEGORIES.map((c) => ({ category: c.value, amount: "" }))
  );

  // Promo codes state
  type PromoCode = {
    id: string;
    code: string;
    discount_type: string;
    discount_value: number;
    max_uses: number | null;
    current_uses: number;
    active: boolean;
    expires_at: string | null;
  };
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [newPromo, setNewPromo] = useState({ code: "", discount_type: "fixed", discount_value: "", max_uses: "", expires_at: "" });
  const [promoLoading, setPromoLoading] = useState(false);

  // Presale state
  type PresaleConfig = {
    enabled: boolean;
    code: string;
    starts_at: string;
    ends_at: string;
    capacity: string;
  };
  const emptyPresale = (): PresaleConfig => ({ enabled: false, code: "", starts_at: "", ends_at: "", capacity: "" });
  const [artistPresale, setArtistPresale] = useState<PresaleConfig>(emptyPresale());
  const [venuePresale, setVenuePresale] = useState<PresaleConfig>(emptyPresale());

  // Landing page state
  const [landingPageSlug, setLandingPageSlug] = useState<string>("");
  const [landingPageSlugSaving, setLandingPageSlugSaving] = useState(false);
  const [landingPageCopied, setLandingPageCopied] = useState(false);

  // Trackable links state
  const [trackableLinks, setTrackableLinks] = useState<any[]>([]);
  const [newLink, setNewLink] = useState({ label: "", slug: "", source: "", medium: "", campaign: "", destination_type: "event_page" });
  const [qrLink, setQrLink] = useState<{ url: string; label: string } | null>(null);

  // Responsive
  const isMobile = useIsMobile();
  const [creatingLink, setCreatingLink] = useState(false);
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [linkAnalytics, setLinkAnalytics] = useState<Record<string, any>>({});
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  // Cropper state
  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // ── Fetch existing event + tiers + revenue ──
  useEffect(() => {
    setLoading(true);

    Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      // admin=1 returns unlock_code, which the public shape withholds.
      fetch(`/api/events/${id}/ticket-types?admin=1`).then((r) => r.json()),
    ])
      .then(([event, tierData]) => {
        if (event.error) {
          setError(event.error);
          return;
        }

        // Parse date + time from raw string
        const raw = event.date || "";
        const dateStr = raw.length >= 10 ? raw.slice(0, 10) : "";
        const sep = raw.length > 10 ? raw[10] : "";
        let timeStr = raw.length >= 16 && (sep === "T" || sep === " ") ? raw.slice(11, 16) : "";
        if (timeStr === "00:00") timeStr = "";

        setForm({
          title: event.title || "",
          subtitle: event.subtitle || "",
          venue: event.venue || "",
          date: dateStr,
          time: timeStr,
          doors_time: (event.doors_time || "").slice(0, 5),
          age_restriction: event.age_restriction || "",
          deal_type: event.deal_type || "own_risk",
          description: event.description || "",
          image_url: event.image_url || "",
          email_flyer_url: event.email_flyer_url || "",
          event_type: event.event_type || "hard_ticket",
          booking_status: event.booking_status || "confirmed",
          contact_name: event.contact_name || "",
          contact_phone: event.contact_phone || "",
          contact_email: event.contact_email || "",
          client_name: event.client_name || "",
          client_email: event.client_email || "",
          client_phone: event.client_phone || "",
          client_billing_address: event.client_billing_address || "",
          client_company: event.client_company || "",
          tax_exempt: event.tax_exempt || false,
          start_time: event.start_time ? (event.start_time.match(/T(\d{2}:\d{2})/)?.[1] || event.start_time) : "",
          end_time: event.end_time ? (event.end_time.match(/T(\d{2}:\d{2})/)?.[1] || event.end_time) : "",
          venue_address: "",
        });

        setEventStatus(event.status || "draft");

        if (event.image_url) {
          setPreviewUrl(event.image_url);
        }

        if (event.event_venue_id) {
          setSelectedEventVenueId(event.event_venue_id);
        }

        // Load on_sale_at — display in Central Time so admins set CST
        if (event.on_sale_at) {
          const { date: osDate, time: osTime } = utcToChicago(event.on_sale_at);
          setOnSaleDate(osDate);
          setOnSaleTime(osTime);
        }

        // Load landing page slug
        if (event.landing_page_slug) {
          setLandingPageSlug(event.landing_page_slug);
        }

        // Load event-level tax method — takes priority over venue default
        if (event.tax_method === "divisor" || event.tax_method === "multiplier") {
          setTaxMethod(event.tax_method);
          taxMethodFromEventRef.current = true;
        }

        // Load event-level "fees included in price" toggle — independent of tax_method
        setFeesIncludedInPrice(event.fees_included_in_price === true);

        // Load external ticketing fields
        setExternalTicketUrl(event.external_ticket_url || "");
        setExternalTicketLabel(event.external_ticket_label || "");
        setMetaPixelId(event.meta_pixel_id || "");
        setSpotifyUrl(event.spotify_url || "");
        setSpotifyMonthlyListeners(event.spotify_monthly_listeners || "");
        const rawFeaturedTrack = event.spotify_featured_track || "";
        const tMatch = rawFeaturedTrack.match(/[?&]t=(\d+)/);
        setSpotifyFeaturedTrack(rawFeaturedTrack.replace(/[?&]t=\d+/, "").replace(/\?$/, "").trim());
        setSpotifyFeaturedTrackStart(tMatch ? tMatch[1] : "");

        // Pre-select the host (venue_id) from loaded event
        if (event.venue_id) {
          setResolvedVenueId(event.venue_id);
        }

        // Map existing tiers — preserve id so PUT can upsert instead of delete+reinsert
        if (Array.isArray(tierData) && tierData.length > 0) {
          setTiers(
            tierData.map((t: {
              id: string; tier_name: string; price: number; capacity: number;
              service_fee_mode?: string | null; facility_fee_mode?: string | null; unlock_code?: string | null;
            }) => ({
              id: t.id,
              tier_name: t.tier_name,
              price: String(t.price),
              capacity: String(t.capacity),
              // NULL in the column means inherit, which the form shows as "".
              service_fee_mode: (t.service_fee_mode ?? "") as "" | "added" | "included" | "waived",
              facility_fee_mode: (t.facility_fee_mode ?? "") as "" | "added" | "included" | "waived",
              unlock_code: t.unlock_code ?? "",
            }))
          );
        } else {
          setTiers([
            {
              tier_name: "General Admission",
              price: String(event.price ?? 0),
              capacity: "500",
            },
          ]);
        }

        // Fetch private event revenue if applicable
        if (event.event_type === "private") {
          fetch(`/api/private-events/${id}/revenue`)
            .then((r) => r.json())
            .then((revData) => {
              if (Array.isArray(revData) && revData.length > 0) {
                // Merge existing revenue with default categories
                const merged = REVENUE_CATEGORIES.map((c) => {
                  const existing = revData.find((r: { category: string; amount: number; id: string }) => r.category === c.value);
                  return {
                    id: existing?.id,
                    category: c.value,
                    amount: existing ? String(existing.amount) : "",
                  };
                });
                setRevenueItems(merged);
              }
            })
            .catch(() => { /* revenue API might not exist yet */ });
        }
      })
      .catch(() => setError("Failed to load event"))
      .finally(() => setLoading(false));

    // Load promo codes for this event
    fetch(`/api/promo-codes?event_id=${id}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPromoCodes(data); })
      .catch(() => {});

    // Load event venues
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      getSupabaseBrowser()
        .from("event_venues")
        .select("id, name, full_address, contact_name, phone, facility_fee, ticketing_fee, tax_rate, tax_method")
        .order("name")
        .then(({ data }: { data: EventVenue[] | null }) => {
          if (data) setEventVenues(data);
        });
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate facility-fee/tax-method display once BOTH the event's selected
  // venue id and the venue list have loaded. Split out from the effect above
  // on purpose: that effect fires the event fetch and the event_venues fetch
  // in parallel without awaiting either, so a lookup inlined there closes
  // over selectedEventVenueId from before the event fetch resolves — always
  // null on first load — and silently never populates the real saved fee.
  // The "Amount per ticket" field then fell back to displaying 0, and Save
  // wrote that 0 straight back to the venue, wiping the real fee. Reacting
  // to both values as dependencies here closes the race regardless of which
  // fetch finishes first.
  useEffect(() => {
    if (!selectedEventVenueId || eventVenues.length === 0) return;
    const v = eventVenues.find((x) => x.id === selectedEventVenueId);
    if (!v) return;
    setSelectedVenueFees({ facility_fee: v.facility_fee ?? null });
    // Only use venue default if the event doesn't have its own tax_method
    if (!taxMethodFromEventRef.current) {
      setTaxMethod(v.tax_method === "divisor" ? "divisor" : "multiplier");
    }
  }, [selectedEventVenueId, eventVenues]);

  // Fetch all venues (hosts) for the host selector dropdown
  useEffect(() => {
    fetch("/api/venues")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAvailableHosts(data.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name }))); })
      .catch(() => {});
  }, []);

  // Fetch presale config
  useEffect(() => {
    if (!id) return;
    fetch(`/api/events/${id}/presale`)
      .then((r) => r.json())
      .then((data) => {
        if (data.artist) {
          setArtistPresale({
            enabled: data.artist.enabled ?? false,
            code: data.artist.code ?? "",
            starts_at: data.artist.starts_at ? data.artist.starts_at.slice(0, 16) : "",
            ends_at: data.artist.ends_at ? data.artist.ends_at.slice(0, 16) : "",
            capacity: data.artist.capacity ? String(data.artist.capacity) : "",
          });
        }
        if (data.venue) {
          setVenuePresale({
            enabled: data.venue.enabled ?? false,
            code: data.venue.code ?? "",
            starts_at: data.venue.starts_at ? data.venue.starts_at.slice(0, 16) : "",
            ends_at: data.venue.ends_at ? data.venue.ends_at.slice(0, 16) : "",
            capacity: data.venue.capacity ? String(data.venue.capacity) : "",
          });
        }
      })
      .catch(() => {});
  }, [id]);

  // Fetch trackable links
  useEffect(() => {
    if (!id) return;
    fetch(`/api/events/${id}/trackable-links`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setTrackableLinks(data); })
      .catch(() => {});
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // ── Tier handlers ──
  const handleTierChange = (
    index: number,
    field: keyof TicketTierDraft,
    value: string
  ) => {
    setTiers((prev) =>
      prev.map((t, i) => (i === index ? { ...t, [field]: value } : t))
    );
  };

  const addTier = () => {
    if (tiers.length >= MAX_TIERS) return;
    setTiers((prev) => [...prev, emptyTier()]);
  };

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return;
    setTiers((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Image handlers ──
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setError("Only .jpeg, .jpg .png, and .webp images are allowed.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRawImageSrc(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setRawImageSrc(null);
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", croppedBlob, `event-${Date.now()}.jpg`);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      setForm((prev) => ({ ...prev, image_url: url }));
      setPreviewUrl(URL.createObjectURL(croppedBlob));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleCropCancel = () => {
    setRawImageSrc(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({ ...prev, image_url: "" }));
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Email flyer — a pre-sized 1080x1350 asset (built in Photoshop for the
  // announcement email), uploaded as-is with no crop step, unlike image_url
  // above which is cropped for the website's wide hero background.
  const handleFlyerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setError("Only .jpeg, .jpg .png, and .webp images are allowed.");
      return;
    }

    setUploadingFlyer(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file, `event-flyer-${Date.now()}.jpg`);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      setForm((prev) => ({ ...prev, email_flyer_url: url }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Flyer upload failed");
    } finally {
      setUploadingFlyer(false);
      if (flyerInputRef.current) flyerInputRef.current.value = "";
    }
  };

  const handleRemoveFlyer = () => {
    setForm((prev) => ({ ...prev, email_flyer_url: "" }));
    if (flyerInputRef.current) flyerInputRef.current.value = "";
  };

  // ── Trackable link helpers ──
  async function createTrackableLink() {
    if (!newLink.label || !newLink.slug) return;
    setCreatingLink(true);
    try {
      const res = await fetch(`/api/events/${id}/trackable-links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newLink),
      });
      if (res.ok) {
        const link = await res.json();
        setTrackableLinks(prev => [link, ...prev]);
        setNewLink({ label: "", slug: "", source: "", medium: "", campaign: "", destination_type: "event_page" });
      }
    } catch (e) {}
    setCreatingLink(false);
  }

  async function deleteTrackableLink(linkId: string) {
    try {
      await fetch(`/api/events/${id}/trackable-links?linkId=${linkId}`, { method: "DELETE" });
      setTrackableLinks(prev => prev.filter(l => l.id !== linkId));
      if (expandedLinkId === linkId) setExpandedLinkId(null);
    } catch (e) {}
  }

  async function toggleLinkActive(linkId: string, currentActive: boolean) {
    try {
      const res = await fetch(`/api/events/${id}/trackable-links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setTrackableLinks(prev => prev.map(l => l.id === linkId ? updated : l));
      }
    } catch (e) {}
  }

  async function loadLinkAnalytics(linkId: string) {
    if (linkAnalytics[linkId]) return;
    try {
      const res = await fetch(`/api/events/${id}/trackable-links/${linkId}`);
      if (res.ok) {
        const data = await res.json();
        setLinkAnalytics(prev => ({ ...prev, [linkId]: data }));
      }
    } catch (e) {}
  }

  function copyTrackableLink(slug: string, linkId: string) {
    const url = `${window.location.origin}/t/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedLinkId(linkId);
    setTimeout(() => setCopiedLinkId(null), 2000);
  }

  function handleLinkLabelChange(label: string) {
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    setNewLink(prev => ({ ...prev, label, slug }));
  }

  // ── The design's edit model (handoff PHASE1-EDIT-PAGES § 1) ──
  // Four tabs over one form, a money rail that never leaves the screen, and
  // a lock on the fields a buyer paid for. Everything above this line — the
  // loads, the handlers, handleSubmit — is the form as it was.
  const [eeTab, setEeTab] = useTabParam(EE_TAB_KEYS);
  const [eventStatus, setEventStatus] = useState("draft");
  const [unlocked, setUnlocked] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [ticketing, setTicketing] = useState<TicketingKpis | null>(null);
  const [soldByTier, setSoldByTier] = useState<Record<string, { name: string; price: number; sold: number }>>({});
  const [auditEntries, setAuditEntries] = useState<AuditRow[]>([]);
  /** The linked offer, for the rail's break-even row only. */
  const [offer, setOffer] = useState<{
    net_potential: number | null; total_fixed: number | null; total_variable: number | null;
    guarantee: number | null; backend_percentage: number | null; deal_type: string | null;
  } | null>(null);

  // Sales figures for the rail and the tier locks. Same source the event
  // workspace's Ticketing tab reads (settlement_ledger via
  // /api/admin/ticketing), so the two never disagree.
  useEffect(() => {
    if (!id) return;
    fetch(`/api/admin/ticketing/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.kpis) return;
        setTicketing(data.kpis);
        const map: Record<string, { name: string; price: number; sold: number }> = {};
        for (const t of data.inventory ?? []) map[t.id] = { name: t.name, price: Number(t.price) || 0, sold: Number(t.sold) || 0 };
        setSoldByTier(map);
      })
      .catch(() => {});
    // The linked offer, for "To break even". Same row and same helper the
    // event workspace uses, so the two screens cannot disagree about it.
    import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
      const { data } = await getSupabaseBrowser()
        .from("artist_offers")
        .select("net_potential, total_fixed, total_variable, guarantee, backend_percentage, deal_type")
        .eq("event_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setOffer(data);
    });

    // This show's own audit trail. Roles without read_audit get a 403 and
    // simply don't see the card.
    fetch(`/api/admin/audit?target_id=${id}&limit=5`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.entries)) setAuditEntries(data.entries);
      })
      .catch(() => {});
  }, [id]);

  const soldTotal = ticketing?.paidTickets ?? 0;

  /**
   * What a tier inherits when it says nothing: the selected room's rate card,
   * plus the event's own two fee flags. Read straight off eventVenues so the
   * per-tier preview shows the real numbers rather than platform defaults.
   */
  const selectedVenue = eventVenues.find((v) => v.id === selectedEventVenueId) || null;
  const tierFeeCtx: TierFeeContext = {
    ticketingFee: Number(selectedVenue?.ticketing_fee ?? 3) || 0,
    facilityFee: Number(selectedVenue?.facility_fee ?? selectedVenueFees.facility_fee ?? 0) || 0,
    taxRate: taxMethod === "divisor" ? 0 : Number(selectedVenue?.tax_rate ?? 0.095) || 0,
    feesIncludedInPrice,
    facilityFeeEnabled: !isFree,
  };

  // To break even — the offer's own walkout, not a second formula. Null when
  // no offer is linked; { tickets: null } when the show loses money even sold
  // out. Same shape the event workspace uses.
  const breakEven = useMemo(() => {
    const sellable = ticketing?.sellable ?? 0;
    if (!offer || !offer.net_potential || sellable <= 0) return null;
    const share = breakEvenShare({
      netPotential: Number(offer.net_potential) || 0,
      totalFixed: Number(offer.total_fixed) || 0,
      totalVariable: Number(offer.total_variable) || 0,
      sellable,
      guarantee: Number(offer.guarantee) || 0,
      backendPct: Number(offer.backend_percentage) || 0,
      dealType: String(offer.deal_type || "FLAT"),
    });
    return share === null ? { tickets: null, share: null } : { tickets: Math.ceil(share * sellable), share };
  }, [offer, ticketing]);
  const hasSales = soldTotal > 0;
  /** Published with sales: title, date, time, venue and host freeze until unlocked. */
  const lockable = eventStatus === "published" && hasSales;
  const locked = lockable && !unlocked;
  /** Event class is fixed after the first sale — published or not. */
  const classFixed = hasSales;

  const unlockForEdit = async () => {
    setUnlocking(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${id}/unlock`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Couldn't unlock this show for editing");
      }
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't unlock this show for editing");
    } finally {
      setUnlocking(false);
    }
  };

  const editState: { tone: "warn" | "good" | "quiet"; eyebrow: string; body: string } = locked
    ? {
        tone: "warn",
        eyebrow: "Published · locked while selling",
        body: `This show is on sale and ${soldTotal.toLocaleString()} ticket${soldTotal === 1 ? " is" : "s are"} out. Title, date, time and venue are frozen until you take the form out of read-only — a buyer paid for each of them. Artwork, billing, description and links never lock.`,
      }
    : unlocked
    ? {
        tone: "good",
        eyebrow: "Unlocked · audit entry written",
        body: "Title, date, time and venue are open. Saving records each change with its before and after.",
      }
    : eventStatus === "published"
    ? {
        tone: "quiet",
        eyebrow: "Published · no sales yet",
        body: "Nothing is locked until the first ticket sells.",
      }
    : {
        tone: "quiet",
        eyebrow: "Draft",
        body: "Not on the storefront. Publish from the event workspace once it's ready.",
      };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const isHardTicket = isHardTicketType(form.event_type);
    const isPrivate = form.event_type === "private";

    // The tier save replaces the whole list, so the lock on tiers with sales
    // is checked here: price and capacity only go up, and it stays.
    if (isHardTicket) {
      for (const [tierId, t] of Object.entries(soldByTier)) {
        if (t.sold === 0) continue;
        const draft = tiers.find((x) => x.id === tierId);
        if (!draft) {
          setError(`${t.name} has ${t.sold} sold and can't be removed.`);
          return;
        }
        if (parseFloat(draft.price) < t.price) {
          setError(`${t.name}: the price can only go up once tickets have sold (currently $${t.price.toFixed(2)}).`);
          return;
        }
        if (parseInt(draft.capacity) < t.sold) {
          setError(`${t.name}: capacity can't go below the ${t.sold} already sold.`);
          return;
        }
      }
    }

    // Validate tiers only for hard ticket
    if (isHardTicket) {
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        if (!t.tier_name.trim()) {
          setError(`Tier ${i + 1}: name is required.`);
          return;
        }
        if (!t.price || isNaN(parseFloat(t.price)) || parseFloat(t.price) < 0) {
          setError(`Tier ${i + 1}: price must be a valid number.`);
          return;
        }
        if (!t.capacity || isNaN(parseInt(t.capacity)) || parseInt(t.capacity) < 1) {
          setError(`Tier ${i + 1}: capacity must be at least 1.`);
          return;
        }
      }
    }

    setSaving(true);

    try {
      const dateTime = form.time
        ? `${form.date}T${form.time}:00`
        : `${form.date}T19:00:00`;

      const lowestPrice = isHardTicket
        ? Math.min(...tiers.map((t) => parseFloat(t.price) || 0))
        : 0;

      const venueId = getCookie("venue-id");

      // 1. Update event
      const eventRes = await fetch(`/api/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          subtitle: form.subtitle || null,
          doors_time: form.doors_time || null,
          age_restriction: form.age_restriction || null,
          deal_type: form.deal_type,
          venue: form.venue,
          date: dateTime,
          price: isPrivate ? null : lowestPrice,
          ticketing_fee: isPrivate ? null : undefined,
          venue_rebate: isPrivate ? null : undefined,
          description: form.description || null,
          image_url: form.image_url || null,
          email_flyer_url: form.email_flyer_url || null,
          event_venue_id: selectedEventVenueId || null,
          // Free events never charge a facility fee; otherwise omit the key
          // entirely (JSON.stringify drops undefined) so this page never
          // touches facility_fee_enabled for a non-free event — there's no
          // more per-event toggle, so nothing here should ever flip it.
          facility_fee_enabled: isFree ? false : undefined,
          // Derived from the tiers, so anything still reading the column gets
          // the truth without anyone having to remember a checkbox.
          is_free: isFree,
          on_sale_at: onSaleDate ? chicagoToUtcIso(onSaleDate, onSaleTime) : null,
          venue_id: resolvedVenueId || null,
          event_type: form.event_type,
          booking_status: form.booking_status,
          contact_name: form.contact_name || null,
          contact_phone: form.contact_phone || null,
          contact_email: form.contact_email || null,
          // Private event fields
          client_name: isPrivate ? (form.client_name || null) : null,
          client_email: isPrivate ? (form.client_email || null) : null,
          client_phone: isPrivate ? (form.client_phone || null) : null,
          client_billing_address: isPrivate ? (form.client_billing_address || null) : null,
          client_company: isPrivate ? (form.client_company || null) : null,
          tax_exempt: isPrivate ? form.tax_exempt : false,
          start_time: isPrivate && form.start_time ? `${form.date}T${form.start_time}:00` : null,
          end_time: isPrivate && form.end_time ? `${form.date}T${form.end_time}:00` : null,
          // External ticketing
          external_ticket_url: externalTicketUrl.trim() || null,
          external_ticket_label: externalTicketLabel.trim() || null,
          meta_pixel_id: metaPixelId.trim() || null,
          tax_method: taxMethod,
          fees_included_in_price: isPrivate ? false : feesIncludedInPrice,
          spotify_url: spotifyUrl.trim() || null,
          spotify_monthly_listeners: spotifyMonthlyListeners.trim() || null,
          spotify_featured_track: spotifyFeaturedTrack.trim()
            ? spotifyFeaturedTrack.trim() + (spotifyFeaturedTrackStart.trim() ? `?t=${spotifyFeaturedTrackStart.trim()}` : "")
            : null,
        }),
      });

      if (!eventRes.ok) {
        const data = await eventRes.json();
        throw new Error(data.error || "Failed to update event");
      }

      // 1b. tax_method now lives on the event itself; also update the venue
      // as a template default so new events at this venue pre-fill
      // correctly. facility_fee is deliberately NOT written here — it's
      // set once on the venue at event-creation time (app/admin/events/new)
      // and never editable per-event again, so there's nothing on this page
      // that should ever overwrite it.
      if (isHardTicket && !isFree && selectedEventVenueId) {
        try {
          const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
          const supabase = getSupabaseBrowser();
          await supabase.from("event_venues").update({ tax_method: taxMethod }).eq("id", selectedEventVenueId);
        } catch (feeErr) {
          console.error("Failed to persist venue settings:", feeErr);
          // Non-fatal — event itself was updated successfully.
        }
      }

      // 1c. Save presale config (fire-and-forget if table doesn't exist yet)
      if (isHardTicket && onSaleDate) {
        fetch(`/api/events/${id}/presale`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ artist: artistPresale, venue: venuePresale }),
        }).catch(() => {});
      }

      // 2. Replace tiers (only for hard ticket)
      if (isHardTicket) {
        const tiersRes = await fetch(`/api/events/${id}/ticket-types`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tiers: tiers.map((t, i) => ({
              ...(t.id ? { id: t.id } : {}),
              tier_name: t.tier_name.trim(),
              price: parseFloat(t.price),
              capacity: parseInt(t.capacity),
              sort_order: i,
              // Empty string means inherit, which the route stores as NULL.
              service_fee_mode: t.service_fee_mode || null,
              facility_fee_mode: t.facility_fee_mode || null,
              unlock_code: t.unlock_code || null,
            })),
          }),
        });

        if (!tiersRes.ok) {
          const data = await tiersRes.json();
          throw new Error(data.error || "Failed to update tiers");
        }
      }

      // 3. Save private event revenue items
      if (form.event_type === "private" && venueId) {
        const revenueToSave = revenueItems.filter((r) => r.amount && parseFloat(r.amount) > 0);
        if (revenueToSave.length > 0) {
          await fetch(`/api/private-events/${id}/revenue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              venue_id: venueId,
              items: revenueToSave.map((r, i) => ({
                category: r.category,
                amount: parseFloat(r.amount),
                sort_order: i,
              })),
            }),
          });
        }
      }

      // Auto-save manually typed venue to event_venues table
      if (!selectedEventVenueId && form.venue.trim()) {
        const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
        const supabase = getSupabaseBrowser();
        const { data: newVenue } = await supabase
          .from("event_venues")
          .insert({
            name: form.venue.trim(),
            full_address: form.venue_address.trim() || null,
          })
          .select("id")
          .single();

        // Link the new venue to the event
        if (newVenue?.id) {
          await supabase
            .from("events")
            .update({ event_venue_id: newVenue.id })
            .eq("id", id);
        }
      }

      // Save or remove seating layout assignment
      if (reservedSeatingEnabled && selectedLayoutId) {
        await fetch(`/api/seating/events/${id}/map`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layout_id: selectedLayoutId,
            enabled: true,
          }),
        }).catch(() => {});
      } else if (!reservedSeatingEnabled) {
        await fetch(`/api/seating/events/${id}/map`, {
          method: "DELETE",
        }).catch(() => {});
      }

      router.push("/admin/events");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update event");
    } finally {
      setSaving(false);
    }
  };

  const isHardTicket = isHardTicketType(form.event_type);
  const isPrivate = form.event_type === "private";

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">{form.title || "Event"} - Edit Event</h1>
        <p style={{ color: "rgba(255,255,255,0.5)", padding: "40px 0" }}>
          Loading event…
        </p>
      </div>
    );
  }

  return (
    <div className="admin-form-page ee-page">
      {/* ── State: what this show is and what that means for editing ── */}
      <div className="card ee-state">
        <div className="ee-state-text">
          <div className={`ee-eyebrow ee-eyebrow--${editState.tone}`}>
            <span className="ee-dot" />
            {editState.eyebrow}
          </div>
          <div className="ee-state-title">
            <h1 className="admin-page-title">{form.title || "Event"}</h1>
            <span className="ee-state-meta">{[form.date, form.venue].filter(Boolean).join(" · ")}</span>
          </div>
          <p className="ee-state-body">{editState.body}</p>
        </div>
        {lockable && (
          <div className="ee-state-action">
            {unlocked ? (
              <button type="button" className="btn ee-btn-lg" onClick={() => window.location.reload()}>
                Discard changes
              </button>
            ) : (
              <button type="button" className="btn btn-primary ee-btn-lg" onClick={unlockForEdit} disabled={unlocking}>
                {unlocking ? "Unlocking…" : "Edit event"}
              </button>
            )}
            <p className="ee-state-hint">Unlocking writes an audit entry before the first keystroke.</p>
          </div>
        )}
      </div>

      <div className="merged-tabs ee-tabs" role="tablist">
        {EE_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={eeTab === t.key}
            className={`merged-tab${eeTab === t.key ? " is-on" : ""}`}
            onClick={() => setEeTab(t.key)}
          >
            {t.label}
          </button>
        ))}
        <span className="ee-tabs-note">No autosave — a live show saves on your word</span>
      </div>

      <form className="ee-grid" onSubmit={handleSubmit}>
        <div className="ee-main">
          {error && <div className="admin-form-error">{error}</div>}

          {eeTab === "setup" && (
            <>
              <section className="card ee-card">
                <div className="ee-card-head">
                  <span className="ee-eyebrow">Locked while selling</span>
                  <span className="ee-card-aside">a buyer paid for each of these</span>
                </div>
                <div className="admin-form ee-fields">
                {/* Host / Organization Selector */}
                <div className="admin-form-label admin-form-full">
                  Host / Organization
                  <select
                    className="admin-form-input"
                    value={resolvedVenueId || ""}
                    disabled={locked}
                    onChange={(e) => setResolvedVenueId(e.target.value || null)}
                    style={{ marginTop: 6 }}
                  >
                    <option value="">— Select host —</option>
                    {availableHosts.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>
                    The organization, promoter, or venue hosting this event
                  </p>
                </div>

                <div className="admin-form-grid">
                  <label className="admin-form-label">
                    Event Name *
                    <input
                      type="text"
                      name="title"
                      disabled={locked}
                      className="admin-form-input"
                      value={form.title}
                      onChange={handleChange}
                      required
                    />
                  </label>

                  <label className="admin-form-label">
                    Venue *
                    {eventVenues.length > 0 && (
                      <select
                        className="admin-form-input"
                        value={selectedEventVenueId || ""}
                        disabled={locked}
                        onChange={(e) => {
                          const v = eventVenues.find((x) => x.id === e.target.value);
                          if (v) {
                            setSelectedEventVenueId(v.id);
                            setForm((prev) => ({ ...prev, venue: v.name, venue_address: v.full_address || "" }));
                            setSelectedVenueFees({ facility_fee: v.facility_fee ?? null });
                          } else {
                            setSelectedEventVenueId(null);
                            setSelectedVenueFees({ facility_fee: null });
                          }
                        }}
                        style={{ marginBottom: 6 }}
                      >
                        <option value="">— Select a venue or type below —</option>
                        {eventVenues.map((v) => (
                          <option key={v.id} value={v.id}>{v.name}{v.full_address ? ` (${v.full_address})` : ""}</option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      name="venue"
                      disabled={locked}
                      className="admin-form-input"
                      value={form.venue}
                      onChange={(e) => {
                        handleChange(e);
                        setSelectedEventVenueId(null);
                        setSelectedVenueFees({ facility_fee: null });
                      }}
                      required
                    />
                    {!selectedEventVenueId && form.venue && (
                      <input
                        type="text"
                        name="venue_address"
                        className="admin-form-input"
                        value={form.venue_address}
                        onChange={handleChange}
                        placeholder="e.g. 1001 Main St, Florence, AL 35630"
                        style={{ marginTop: 6 }}
                      />
                    )}
                  </label>

                  <label className="admin-form-label">
                    Date *
                    <input
                      type="date"
                      name="date"
                      disabled={locked}
                      className="admin-form-input"
                      value={form.date}
                      onChange={handleChange}
                      required
                    />
                  </label>

                  {/* Doors and show time, as the mockup's "Doors / show" row.
                      Doors is what prints on the ticket; the date column
                      carries the show time. */}
                  <label className="admin-form-label">
                    Doors
                    <input
                      type="time"
                      name="doors_time"
                      disabled={locked}
                      className="admin-form-input"
                      value={form.doors_time}
                      onChange={handleChange}
                    />
                  </label>

                  <label className="admin-form-label">
                    Show time
                    <select
                      name="time"
                      disabled={locked}
                      className="admin-form-input"
                      value={form.time}
                      onChange={(e) => setForm({ ...form, time: e.target.value })}
                    >
                      <option value="">— Select time —</option>
                      {Array.from({ length: 30 }, (_, i) => {
                        const h24 = Math.floor(i / 2) + 10;
                        const m = i % 2 === 0 ? "00" : "30";
                        const h12 = h24 > 12 ? h24 - 12 : h24;
                        const ampm = h24 >= 12 ? "PM" : "AM";
                        const val = `${String(h24).padStart(2, "0")}:${m}`;
                        return <option key={val} value={val}>{h12}:{m} {ampm}</option>;
                      })}
                    </select>
                  </label>

                </div>
                </div>
              </section>

              <section className="card ee-card">
                <div className="ee-card-head">
                  <span className="ee-eyebrow">Fixed for the life of the show</span>
                </div>
                <div className="admin-form ee-fields">
                {/* Event Type Selector */}
                <div className="admin-form-label admin-form-full">
                  Event Type
                  <select
                    className="admin-form-input"
                    value={form.event_type}
                    disabled={classFixed}
                    onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                    style={{ marginTop: 6 }}
                  >
                    <option value="hard_ticket">Hard Ticket</option>
                    <option value="non_ticketed">Non-Ticketed</option>
                    <option value="private">Private Event</option>
                  </select>
                  {classFixed && <p className="ee-field-note">Fixed — tickets were sold under this class.</p>}
                </div>

                {/* Deal type — whose money the show is. The mockup fixes it
                    here for the same reason the class is fixed: it is what the
                    settlement was built against. */}
                <div className="admin-form-label admin-form-full">
                  Deal type
                  <select
                    className="admin-form-input"
                    value={form.deal_type}
                    disabled={classFixed}
                    onChange={(e) => setForm({ ...form, deal_type: e.target.value })}
                    style={{ marginTop: 6 }}
                  >
                    <option value="own_risk">Own risk — the room carries it</option>
                    <option value="guarantee">Guarantee — the artist is promised a figure</option>
                    <option value="co_promote">Co-promote — split after costs</option>
                    <option value="rental_box_office">Rental + box office — they rent, you sell</option>
                  </select>
                  <p className="ee-field-note">
                    {classFixed
                      ? "Fixed — the settlement is built against this deal. Change it on a revision, not here."
                      : "Changes settlement only. Inventory, scanner and storefront stay yours."}
                  </p>
                </div>
                </div>
              </section>

              <section className="card ee-card">
                <div className="ee-card-head">
                  <span className="ee-eyebrow">Always editable</span>
                  <span className="ee-card-aside">cannot invalidate a ticket</span>
                </div>
                <div className="admin-form ee-fields">
                {/* The mockup's support billing and age policy lead this card:
                    neither can invalidate a ticket, so neither ever locks. */}
                <div className="admin-form-grid">
                  <label className="admin-form-label">
                    Support / billing
                    <input
                      type="text"
                      name="subtitle"
                      className="admin-form-input"
                      placeholder='e.g. w/ The Ledger Wide'
                      value={form.subtitle}
                      onChange={handleChange}
                    />
                  </label>

                  <label className="admin-form-label">
                    Age policy
                    <select
                      name="age_restriction"
                      className="admin-form-input"
                      value={form.age_restriction}
                      onChange={handleChange}
                    >
                      <option value="">All ages</option>
                      <option value="18+">18+</option>
                      <option value="21+">21+</option>
                      <option value="16+">16+</option>
                      <option value="Under 12 free with adult">Under 12 free with adult</option>
                    </select>
                  </label>
                </div>

                {/* Booking Status */}
                <div className="admin-form-label admin-form-full">
                  Booking Status
                  <select
                    className="admin-form-input"
                    value={form.booking_status}
                    onChange={(e) => setForm({ ...form, booking_status: e.target.value })}
                    style={{ marginTop: 6 }}
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="hold">Hold</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Contact Fields — shown for private events */}
                {isPrivate && (
                  <div className="admin-form-label admin-form-full" style={{
                    padding: 16, borderRadius: 10,
                    background: "rgba(180,100,200,0.06)",
                    border: "1px solid rgba(180,100,200,0.15)",
                    marginTop: 8,
                  }}>
                    <span style={{ color: "rgba(180,100,200,0.8)", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
                      Client Contact Info
                    </span>
                    <div className="admin-form-grid">
                      <label className="admin-form-label">
                        Contact Name
                        <input
                          type="text"
                          name="contact_name"
                          className="admin-form-input"
                          value={form.contact_name}
                          onChange={handleChange}
                          placeholder="Client name"
                        />
                      </label>
                      <label className="admin-form-label">
                        Phone
                        <input
                          type="tel"
                          name="contact_phone"
                          className="admin-form-input"
                          value={form.contact_phone}
                          onChange={(e) => setForm({ ...form, contact_phone: formatPhoneNumber(e.target.value) })}
                          placeholder="(555)-123-4567"
                        />
                      </label>
                      <label className="admin-form-label" style={{ gridColumn: "span 2" }}>
                        Email
                        <input
                          type="email"
                          name="contact_email"
                          className="admin-form-input"
                          value={form.contact_email}
                          onChange={handleChange}
                          placeholder="client@example.com"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {/* ── Private Event Revenue Fields ── */}
                {isPrivate && (
                  <div className="admin-form-label admin-form-full" style={{
                    padding: 16, borderRadius: 10,
                    background: "rgba(180,100,200,0.04)",
                    border: "1px solid rgba(180,100,200,0.12)",
                    marginTop: 8,
                  }}>
                    <span style={{ color: "rgba(180,100,200,0.8)", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
                      Revenue Line Items
                    </span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {revenueItems.map((item, i) => {
                        const label = REVENUE_CATEGORIES.find((c) => c.value === item.category)?.label || item.category;
                        return (
                          <div key={item.category} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ flex: 1, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>{label}</span>
                            <div style={{ position: "relative", width: 140 }}>
                              <span style={{
                                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                                color: "rgba(255,255,255,0.3)", fontSize: 13, pointerEvents: "none",
                              }}>$</span>
                              <input
                                type="number"
                                className="admin-form-input"
                                value={item.amount}
                                onChange={(e) => {
                                  const updated = [...revenueItems];
                                  updated[i] = { ...updated[i], amount: e.target.value };
                                  setRevenueItems(updated);
                                }}
                                placeholder="0.00"
                                step="0.01"
                                min="0"
                                style={{ width: "100%", paddingLeft: 24 }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {(() => {
                      const total = revenueItems.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
                      return total > 0 ? (
                        <div style={{ textAlign: "right", marginTop: 10, fontSize: 14, fontWeight: 700, color: "#ffffff" }}>
                          Total: ${total.toFixed(2)}
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* Image upload section */}
                <div className="admin-form-label admin-form-full">
                  Event Image
                  <div className="admin-image-upload-area">
                    {previewUrl ? (
                      <div className="admin-image-preview-wrapper">
                        <img
                          src={previewUrl}
                          alt="Event preview"
                          className="admin-image-preview"
                        />
                        <button
                          type="button"
                          className="admin-image-remove-btn"
                          onClick={handleRemoveImage}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    ) : (
                      <div
                        className="admin-image-dropzone"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        {uploading ? (
                          <span className="admin-image-uploading">Uploading…</span>
                        ) : (
                          <>
                            <span className="admin-image-dropzone-icon"></span>
                            <span className="admin-image-dropzone-text">
                              Click to upload an image
                            </span>
                            <span className="admin-image-dropzone-hint">
                              .jpg, .jpeg, .png, or .webp — max 45 MB
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={ACCEPTED_IMAGE_TYPES}
                      onChange={handleFileSelect}
                      className="admin-image-file-input"
                    />
                  </div>
                </div>

                {/* Email flyer upload section — separate from Event Image above.
                    This is a pre-sized 1080x1350 asset used only in the announcement
                    email, not the website's hero background. Uploaded as-is, no crop. */}
                <div className="admin-form-label admin-form-full">
                  Email Flyer (1080x1350)
                  <div className="admin-image-upload-area">
                    {form.email_flyer_url ? (
                      <div className="admin-image-preview-wrapper">
                        <img
                          src={form.email_flyer_url}
                          alt="Email flyer preview"
                          className="admin-image-preview"
                        />
                        <button
                          type="button"
                          className="admin-image-remove-btn"
                          onClick={handleRemoveFlyer}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    ) : (
                      <div
                        className="admin-image-dropzone"
                        onClick={() => flyerInputRef.current?.click()}
                      >
                        {uploadingFlyer ? (
                          <span className="admin-image-uploading">Uploading…</span>
                        ) : (
                          <>
                            <span className="admin-image-dropzone-icon"></span>
                            <span className="admin-image-dropzone-text">
                              Click to upload the email flyer
                            </span>
                            <span className="admin-image-dropzone-hint">
                              1080x1350 portrait, purpose-built for the announcement email — .jpg, .jpeg, .png, or .webp
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    <input
                      ref={flyerInputRef}
                      type="file"
                      accept={ACCEPTED_IMAGE_TYPES}
                      onChange={handleFlyerUpload}
                      className="admin-image-file-input"
                    />
                  </div>
                </div>

                <label className="admin-form-label admin-form-full">
                  Description
                  <textarea
                    name="description"
                    className="admin-form-textarea"
                    value={form.description}
                    onChange={handleChange}
                    placeholder="Event description..."
                    rows={4}
                  />
                </label>

                {/* ── Spotify Embed ── */}
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: spotifyUrl ? "rgba(30,215,96,0.06)" : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${spotifyUrl ? "rgba(30,215,96,0.25)" : "rgba(255, 255, 255, 0.12)"}`,
                  marginTop: 8,
                }}>
                  <span style={{ color: spotifyUrl ? "#1ed760" : "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
                    Spotify — Listen Before You Go
                  </span>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "0 0 10px" }}>
                    Paste any Spotify link — artist page, album, playlist, or single track.
                    An embedded player will appear on the event page so fans can listen without leaving.
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "0 0 4px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Featured Track</p>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      className="admin-form-input"
                      type="url"
                      placeholder="https://open.spotify.com/track/..."
                      value={spotifyFeaturedTrack}
                      onChange={(e) => setSpotifyFeaturedTrack(e.target.value.trim())}
                      style={{ flex: 1 }}
                    />
                    <input
                      className="admin-form-input"
                      type="number"
                      min="0"
                      placeholder="Start (sec)"
                      value={spotifyFeaturedTrackStart}
                      onChange={(e) => setSpotifyFeaturedTrackStart(e.target.value)}
                      style={{ width: 110, flexShrink: 0 }}
                    />
                  </div>
                  {spotifyFeaturedTrackStart && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
                      Starts at {spotifyFeaturedTrackStart}s — {Math.floor(Number(spotifyFeaturedTrackStart) / 60)}:{String(Number(spotifyFeaturedTrackStart) % 60).padStart(2, "0")} into the track
                    </p>
                  )}
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "12px 0 4px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Artist Page</p>
                  <input
                    className="admin-form-input"
                    type="url"
                    placeholder="https://open.spotify.com/artist/..."
                    value={spotifyUrl}
                    onChange={(e) => setSpotifyUrl(e.target.value.trim())}
                  />
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, margin: "12px 0 4px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>Monthly Listeners</p>
                  <input
                    className="admin-form-input"
                    type="text"
                    placeholder="e.g. 2.4M or 847,000"
                    value={spotifyMonthlyListeners}
                    onChange={(e) => setSpotifyMonthlyListeners(e.target.value)}
                  />
                  {(spotifyFeaturedTrack || spotifyUrl) && (
                    <p style={{ fontSize: 11, color: "#1ed760", marginTop: 8 }}>
                      Spotify player active — fans can listen directly on the event page.
                    </p>
                  )}
                </div>
                </div>
              </section>

              {/* The mockup's fourth card: the three things this form shows but
                  deliberately will not change, each with the reason. They are
                  here so nobody hunts for a control that was never meant to be
                  on an edit form. */}
              <section className="card ee-card">
                <div className="ee-card-head">
                  <span className="ee-eyebrow">Not editable on this form at all</span>
                </div>
                <dl className="ee-readonly">
                  <div>
                    <dt>Visibility</dt>
                    <dd>{eventStatus === "published" ? "Published" : "Draft"}</dd>
                    <p className="ee-field-note">
                      Only Publish and Unpublish change this, in the event workspace, and each is its own action with its own confirm.
                    </p>
                  </div>
                  <div>
                    <dt>Capacity</dt>
                    <dd>
                      {ticketing && ticketing.sellable > 0
                        ? `${ticketing.sellable.toLocaleString()} sellable · floor ${soldTotal.toLocaleString()} sold`
                        : "Set by the tiers on the Tickets tab"}
                    </dd>
                    <p className="ee-field-note">
                      Cannot go below tickets already sold. Raising it is allowed at any time — edit the tier.
                    </p>
                  </div>
                  <div>
                    <dt>Tier price</dt>
                    <dd>{hasSales ? "No downward move" : "Free to change — nothing sold yet"}</dd>
                    <p className="ee-field-note">
                      Lowering a face price after a sale forces a partial-refund decision for every prior buyer, so the Tickets tab only lets a selling tier go up.
                    </p>
                  </div>
                </dl>
              </section>
            </>
          )}

          {eeTab === "tickets" && (
            <section className="card ee-card">
              <div className="ee-card-head">
                <span className="ee-eyebrow">Tiers{soldTotal > 0 ? ` — ${soldTotal} sold against them` : ""}</span>
                {hasSales && <span className="ee-chip">price up only</span>}
              </div>
              {!isHardTicket && (
                <p className="ee-field-note">This show doesn&apos;t sell tickets here, so there are no tiers to edit.</p>
              )}
              <div className="admin-form ee-fields">
              {/* ── Ticket Tiers (only for hard ticket events) ── */}
              {isHardTicket && (
                <div className="admin-form-label admin-form-full">
                  Ticket Tiers *
                  {hasSales && (
                    <p className="ee-field-note">A tier with sales can go up in price and capacity, never down, and can&apos;t be removed.</p>
                  )}
                  <div className="admin-tiers-list">
                    {tiers.map((tier, i) => (
                      <div key={i} className="admin-tier-row">
                        <span className="admin-tier-number">
                          Tier {i + 1}
                          {tier.id && soldByTier[tier.id]?.sold ? (
                            <span className="ee-tier-sold">{soldByTier[tier.id].sold} sold</span>
                          ) : null}
                        </span>
                        <input
                          type="text"
                          className="admin-form-input admin-tier-input"
                          placeholder="Tier name (e.g. GA, VIP)"
                          value={tier.tier_name}
                          onChange={(e) =>
                            handleTierChange(i, "tier_name", e.target.value)
                          }
                          required
                        />
                        <input
                          type="number"
                          className="admin-form-input admin-tier-input admin-tier-price"
                          placeholder="Price"
                          value={tier.price}
                          onChange={(e) =>
                            handleTierChange(i, "price", e.target.value)
                          }
                          step="0.01"
                          min={tier.id && soldByTier[tier.id]?.sold ? soldByTier[tier.id].price : 0}
                          required
                        />
                        <input
                          type="number"
                          className="admin-form-input admin-tier-input admin-tier-capacity"
                          placeholder="Capacity"
                          value={tier.capacity}
                          onChange={(e) =>
                            handleTierChange(i, "capacity", e.target.value)
                          }
                          min={Math.max(1, tier.id ? soldByTier[tier.id]?.sold ?? 0 : 0)}
                          step="1"
                          required
                        />
                        {tiers.length > 1 && !(tier.id && soldByTier[tier.id]?.sold) && (
                          <button
                            type="button"
                            className="admin-tier-remove-btn"
                            onClick={() => removeTier(i)}
                            title="Remove tier"
                          >
                            ✕
                          </button>
                        )}
                        <TierFeePanel
                          tier={tier}
                          ctx={tierFeeCtx}
                          onChange={(field, value) => handleTierChange(i, field, value)}
                        />
                      </div>
                    ))}
                  </div>
                  {tiers.length < MAX_TIERS && (
                    <button
                      type="button"
                      className="admin-tier-add-btn"
                      onClick={addTier}
                    >
                      + Add Tier
                    </button>
                  )}
                </div>
              )}

              {/* ── Reserved Seating (only for hard ticket events) ── */}
              {isHardTicket && (
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: reservedSeatingEnabled ? "rgba(99,102,241,0.06)" : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${reservedSeatingEnabled ? "rgba(99,102,241,0.2)" : "rgba(255, 255, 255, 0.12)"}`,
                  marginTop: 8,
                }}>
                  <label style={{
                    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    color: reservedSeatingEnabled ? "#818cf8" : "rgba(255,255,255,0.6)",
                    fontWeight: 700, fontSize: 13,
                  }}>
                    <input
                      type="checkbox"
                      checked={reservedSeatingEnabled}
                      onChange={(e) => {
                        setReservedSeatingEnabled(e.target.checked);
                        if (!e.target.checked) setSelectedLayoutId(null);
                      }}
                      style={{ width: 18, height: 18, accentColor: "#818cf8" }}
                    />
                    Enable Reserved Seating
                  </label>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "6px 0 0" }}>
                    When enabled, buyers will select specific seats from a seating chart instead of general admission tickets.
                  </p>

                  {reservedSeatingEnabled && (
                    <div style={{ marginTop: 12 }}>
                      <label style={{ display: "block", color: "rgba(255,255,255,0.6)", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                        Seating Layout
                      </label>
                      {seatingLayouts.length > 0 ? (
                        <select
                          className="admin-form-input"
                          value={selectedLayoutId || ""}
                          onChange={(e) => setSelectedLayoutId(e.target.value || null)}
                          style={{ maxWidth: 400 }}
                        >
                          <option value="">— Select a seating layout —</option>
                          {seatingLayouts.map((l) => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                          ))}
                        </select>
                      ) : (
                        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                          No seating layouts yet.{" "}
                          <a href="/admin/seating" style={{ color: "#818cf8", textDecoration: "underline" }}>
                            Create one in Seating Management
                          </a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
            </section>
          )}

          {eeTab === "onsale" && (
            <section className="card ee-card">
              <div className="ee-card-head">
                <span className="ee-eyebrow">On-sale, presale &amp; fees</span>
              </div>
              {hasSales && (
                <p className="ee-field-note">
                  Fee changes apply to orders placed from the moment you save. Orders already taken keep the schedule
                  they were sold under, and settlement reads each order&apos;s own schedule.
                </p>
              )}
              {!isHardTicket && (
                <p className="ee-field-note">This show doesn&apos;t sell tickets here, so there is no on-sale or fee setup.</p>
              )}
              <div className="admin-form ee-fields">
              {/* ── On-Sale Date & Time (only for hard ticket events) ── */}
              {isHardTicket && (
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: onSaleDate ? "rgba(59,130,246,0.06)" : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${onSaleDate ? "rgba(59,130,246,0.15)" : "rgba(255, 255, 255, 0.12)"}`,
                  marginTop: 8,
                }}>
                  <span style={{ color: onSaleDate ? "#3b82f6" : "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 8 }}>
                    On-Sale Date & Time
                  </span>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "0 0 10px" }}>
                    Leave empty for tickets to go on sale immediately. Set a date to schedule when tickets become available.
                  </p>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                    <label style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Date</span>
                      <input
                        type="date"
                        className="admin-form-input"
                        value={onSaleDate}
                        onChange={(e) => setOnSaleDate(e.target.value)}
                      />
                    </label>
                    <label style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Time (Central Time)</span>
                      <select
                        className="admin-form-input"
                        value={onSaleTime}
                        onChange={(e) => setOnSaleTime(e.target.value)}
                      >
                        <option value="">12:00 AM (midnight)</option>
                        {Array.from({ length: 48 }, (_, i) => {
                          const h24 = Math.floor(i / 2);
                          const m = i % 2 === 0 ? "00" : "30";
                          const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
                          const ampm = h24 >= 12 ? "PM" : "AM";
                          const val = `${String(h24).padStart(2, "0")}:${m}`;
                          return <option key={val} value={val}>{h12}:{m} {ampm}</option>;
                        })}
                      </select>
                    </label>
                    {onSaleDate && (
                      <button
                        type="button"
                        onClick={() => { setOnSaleDate(""); setOnSaleTime(""); }}
                        style={{
                          padding: "8px 12px", borderRadius: 8,
                          border: "1px solid rgba(255,107,107,0.3)",
                          background: "rgba(255,107,107,0.1)",
                          color: "#ff6b6b", fontSize: 12, fontWeight: 600,
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Presale Access (only for hard ticket events with an on-sale date) ── */}
              {isHardTicket && onSaleDate && (
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: "rgba(168,85,247,0.04)",
                  border: "1px solid rgba(168,85,247,0.12)",
                  marginTop: 8,
                }}>
                  <span style={{ color: "#a855f7", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 14 }}>
                    Presale Access
                  </span>

                  {(["artist", "venue"] as const).map((type, idx) => {
                    const config = type === "artist" ? artistPresale : venuePresale;
                    const setConfig = type === "artist" ? setArtistPresale : setVenuePresale;
                    const label = type === "artist" ? "Artist Presale" : "Venue Presale";
                    return (
                      <div key={type} style={{ marginBottom: idx === 0 ? 10 : 0 }}>
                        <div style={{
                          borderRadius: 8,
                          border: `1px solid ${config.enabled ? "rgba(168,85,247,0.35)" : "rgba(255,255,255,0.08)"}`,
                          background: config.enabled ? "rgba(168,85,247,0.05)" : "rgba(255,255,255,0.015)",
                          transition: "border-color 0.3s ease, background 0.3s ease, box-shadow 0.3s ease",
                          boxShadow: config.enabled ? "0 0 0 1px rgba(168,85,247,0.08), 0 4px 16px rgba(168,85,247,0.07)" : "none",
                          overflow: "hidden",
                        }}>
                          {/* Header row — click anywhere to toggle */}
                          <div
                            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", cursor: "pointer", userSelect: "none" }}
                            onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                          >
                            <span style={{ fontSize: 13, fontWeight: 700, color: config.enabled ? "#a855f7" : "rgba(255,255,255,0.55)", transition: "color 0.3s ease" }}>
                              {label}
                            </span>
                            {/* Pill toggle */}
                            <div style={{
                              width: 40, height: 22, borderRadius: 11, flexShrink: 0, position: "relative",
                              background: config.enabled ? "#a855f7" : "rgba(255,255,255,0.14)",
                              transition: "background 0.22s ease",
                            }}>
                              <div style={{
                                position: "absolute", top: 3,
                                left: config.enabled ? 21 : 3,
                                width: 16, height: 16, borderRadius: "50%",
                                background: "#fff",
                                transition: "left 0.22s ease",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                              }} />
                            </div>
                          </div>

                          {/* Expandable body */}
                          <div style={{
                            maxHeight: config.enabled ? "480px" : "0px",
                            overflow: "hidden",
                            opacity: config.enabled ? 1 : 0,
                            transition: "max-height 0.35s cubic-bezier(0.25,0.46,0.45,0.94), opacity 0.28s ease",
                          }}>
                            <div style={{ padding: "2px 14px 16px" }}>

                              {/* Code input */}
                              <div style={{ marginBottom: 14 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3, fontWeight: 600 }}>
                                  Presale Code
                                </label>
                                <input
                                  type="text"
                                  className="admin-form-input"
                                  value={config.code}
                                  onChange={(e) => setConfig((prev) => ({ ...prev, code: e.target.value.toUpperCase().slice(0, 15) }))}
                                  placeholder="e.g. EARLYBIRD"
                                  maxLength={15}
                                  style={{ fontFamily: "monospace", letterSpacing: "0.08em", textTransform: "uppercase", maxWidth: 240 }}
                                />
                                <span style={{
                                  fontSize: 11,
                                  color: config.code.length >= 13 ? "rgba(168,85,247,0.9)" : "rgba(255,255,255,0.2)",
                                  marginTop: 3, display: "block",
                                  transition: "color 0.2s ease",
                                }}>
                                  {config.code.length}/15
                                </span>
                              </div>

                              {/* Presale window */}
                              <div style={{ marginBottom: 14 }}>
                                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 6, fontWeight: 600 }}>
                                  Presale Window (optional)
                                </span>
                                <div style={{ display: "flex", gap: 10 }}>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 2 }}>Opens</span>
                                    <input
                                      type="datetime-local"
                                      className="admin-form-input"
                                      value={config.starts_at}
                                      onChange={(e) => setConfig((prev) => ({ ...prev, starts_at: e.target.value }))}
                                      style={{ fontSize: 12 }}
                                    />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", display: "block", marginBottom: 2 }}>Closes</span>
                                    <input
                                      type="datetime-local"
                                      className="admin-form-input"
                                      value={config.ends_at || (onSaleDate ? `${onSaleDate}T${onSaleTime || "00:00"}` : "")}
                                      onChange={(e) => setConfig((prev) => ({ ...prev, ends_at: e.target.value }))}
                                      style={{ fontSize: 12 }}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Capacity */}
                              <div style={{ marginBottom: 12 }}>
                                <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 3, fontWeight: 600 }}>
                                  Max Presale Tickets (optional)
                                </label>
                                <input
                                  type="number"
                                  className="admin-form-input"
                                  value={config.capacity}
                                  onChange={(e) => setConfig((prev) => ({ ...prev, capacity: e.target.value }))}
                                  placeholder="No limit"
                                  min="1"
                                  step="1"
                                  style={{ maxWidth: 140 }}
                                />
                              </div>

                              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: 0 }}>
                                Anyone with this code can purchase tickets before the general on-sale opens.
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Facility Fee (read-only display — see selectedVenueFees load
                   effect above). No per-event toggle or amount input: the fee
                   always mirrors whatever's saved on the venue itself, set once
                   at event-creation time (app/admin/events/new/page.tsx) and
                   never editable per-event again. Removed after a bug where an
                   unloaded fee value silently defaulted to 0 and got written back
                   to the venue on save, wiping the real fee. ── */}
              {isHardTicket && selectedEventVenueId && !isFree && (
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  marginTop: 8,
                }}>
                  <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 4 }}>
                    Facility Fee
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
                    {selectedVenueFees.facility_fee != null
                      ? `$${Number(selectedVenueFees.facility_fee).toFixed(2)} per ticket`
                      : "No fee set for this venue"}
                  </span>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, margin: "6px 0 0" }}>
                    Set on the venue, not per-event — applies automatically to every event here.
                  </p>
                </div>
              )}

              {/* ── Tax Method (only for hard ticket events) ── */}
              {isHardTicket && !isFree && (
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  marginTop: 8,
                }}>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 10 }}>
                    Tax Method
                  </span>
                  <select
                    className="admin-form-input"
                    value={taxMethod}
                    onChange={(e) => setTaxMethod(e.target.value as "multiplier" | "divisor")}
                    style={{ maxWidth: 320 }}
                  >
                    <option value="multiplier">Multiplier — customer pays tax on top of face price</option>
                    <option value="divisor">Divisor — tax is baked into the face price</option>
                  </select>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "8px 0 0" }}>
                    {taxMethod === "multiplier"
                      ? "Tax is added on top at checkout. Use this for most shows."
                      : "Tax is embedded in the face price — checkout will not add it again. Match this to your offer's tax method."}
                  </p>
                </div>
              )}

              {/* ── Fees Included In Price (only for hard ticket events) ──
                   Independent of Tax Method — bakes the ticketing fee + facility
                   fee into the sticker price instead of adding them at checkout.
                   Settlement still backs the real face value out of that price,
                   so the venue/platform still collects the same fee per ticket. ── */}
              {isHardTicket && !isFree && (
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: feesIncludedInPrice ? "rgba(99,102,241,0.06)" : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${feesIncludedInPrice ? "rgba(99,102,241,0.2)" : "rgba(255, 255, 255, 0.12)"}`,
                  marginTop: 8,
                }}>
                  <label style={{
                    display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
                    color: feesIncludedInPrice ? "#818cf8" : "rgba(255,255,255,0.6)",
                    fontWeight: 700, fontSize: 13,
                  }}>
                    <input
                      type="checkbox"
                      checked={feesIncludedInPrice}
                      onChange={(e) => setFeesIncludedInPrice(e.target.checked)}
                      style={{ width: 18, height: 18, accentColor: "#818cf8" }}
                    />
                    Ticketing/Facility Fees Included in Price
                  </label>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "8px 0 0" }}>
                    {feesIncludedInPrice
                      ? "The ticket price above is all-in — checkout will not add the ticketing fee or facility fee on top. For example, a $15 ticket with a $3 ticketing fee settles as ~$12 face value, so the venue/platform still collects its $3 per ticket."
                      : "The ticketing fee and facility fee are added on top of the ticket price at checkout, as usual."}
                  </p>
                </div>
              )}
              </div>
            </section>
          )}

          {eeTab === "promo" && (
            <>
              <section className="card ee-card">
                <div className="ee-card-head">
                  <span className="ee-eyebrow">Promo codes, landing page &amp; tracking links</span>
                  <span className="ee-card-aside">orders attribute on first touch</span>
                </div>
                <div className="admin-form ee-fields">
                {/* ── Promo Codes (only for hard ticket events) ── */}
                {isHardTicket && (
                  <div className="admin-form-label admin-form-full" style={{
                    padding: 16, borderRadius: 10,
                    background: "rgba(255, 255, 255, 0.04)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    marginTop: 8,
                  }}>
                    <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
                      Promo Codes
                    </span>

                    {/* Existing promo codes */}
                    {promoCodes.length > 0 && (
                      <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                        {promoCodes.map((pc) => (
                          <div key={pc.id} style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 12px", borderRadius: 8,
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.06)",
                          }}>
                            <span style={{ fontWeight: 700, color: "#ffffff", fontSize: 13, minWidth: 80 }}>{pc.code}</span>
                            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", flex: 1 }}>
                              {pc.discount_type === "fixed" ? `$${pc.discount_value}` : `${pc.discount_value}%`} off
                              {pc.max_uses ? ` · ${pc.current_uses}/${pc.max_uses} used` : ` · ${pc.current_uses} used`}
                              {pc.expires_at ? ` · Exp ${new Date(pc.expires_at).toLocaleDateString()}` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                await fetch(`/api/promo-codes?id=${pc.id}`, { method: "DELETE" });
                                setPromoCodes((prev) => prev.filter((p) => p.id !== pc.id));
                              }}
                              style={{
                                background: "transparent", border: "none",
                                color: "rgba(255,107,107,0.7)", cursor: "pointer", fontSize: 14,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new promo code */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                      <div style={{ flex: "1 1 120px" }}>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Code</label>
                        <input
                          type="text"
                          className="admin-form-input"
                          value={newPromo.code}
                          onChange={(e) => setNewPromo({ ...newPromo, code: e.target.value.toUpperCase() })}
                          placeholder="e.g. VIP20"
                          style={{ textTransform: "uppercase" }}
                        />
                      </div>
                      <div style={{ flex: "0 0 100px" }}>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Type</label>
                        <select
                          className="admin-form-input"
                          value={newPromo.discount_type}
                          onChange={(e) => setNewPromo({ ...newPromo, discount_type: e.target.value })}
                        >
                          <option value="fixed">Fixed $</option>
                          <option value="percentage">Percent %</option>
                        </select>
                      </div>
                      <div style={{ flex: "0 0 80px" }}>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Value</label>
                        <input
                          type="number"
                          className="admin-form-input"
                          value={newPromo.discount_value}
                          onChange={(e) => setNewPromo({ ...newPromo, discount_value: e.target.value })}
                          placeholder="10"
                          min="0"
                          step="0.01"
                        />
                      </div>
                      <div style={{ flex: "0 0 70px" }}>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Max Uses</label>
                        <input
                          type="number"
                          className="admin-form-input"
                          value={newPromo.max_uses}
                          onChange={(e) => setNewPromo({ ...newPromo, max_uses: e.target.value })}
                          placeholder="∞"
                          min="1"
                        />
                      </div>
                      <div style={{ flex: "0 0 130px" }}>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Expires</label>
                        <input
                          type="date"
                          className="admin-form-input"
                          value={newPromo.expires_at}
                          onChange={(e) => setNewPromo({ ...newPromo, expires_at: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        disabled={promoLoading || !newPromo.code.trim() || !newPromo.discount_value}
                        onClick={async () => {
                          setPromoLoading(true);
                          try {
                            const res = await fetch("/api/promo-codes", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                event_id: id,
                                code: newPromo.code.trim(),
                                discount_type: newPromo.discount_type,
                                discount_value: newPromo.discount_value,
                                max_uses: newPromo.max_uses || null,
                                expires_at: newPromo.expires_at ? `${newPromo.expires_at}T23:59:59Z` : null,
                              }),
                            });
                            if (res.ok) {
                              const created = await res.json();
                              setPromoCodes((prev) => [created, ...prev]);
                              setNewPromo({ code: "", discount_type: "fixed", discount_value: "", max_uses: "", expires_at: "" });
                            } else {
                              const err = await res.json();
                              setError(err.error || "Failed to create promo code");
                            }
                          } catch {
                            setError("Failed to create promo code");
                          } finally {
                            setPromoLoading(false);
                          }
                        }}
                        style={{
                          padding: "8px 14px", borderRadius: 8,
                          border: "1px solid rgba(255, 255, 255, 0.3)",
                          background: "rgba(255, 255, 255, 0.1)",
                          color: "#ffffff", fontSize: 12, fontWeight: 600,
                          cursor: promoLoading || !newPromo.code.trim() || !newPromo.discount_value ? "not-allowed" : "pointer",
                          opacity: promoLoading || !newPromo.code.trim() || !newPromo.discount_value ? 0.5 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {promoLoading ? "..." : "+ Add"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Landing Page URL (only for hard ticket events) ── */}
                {isHardTicket && (
                  <div className="admin-form-label admin-form-full" style={{
                    padding: 16, borderRadius: 10,
                    background: "rgba(168,85,247,0.04)",
                    border: "1px solid rgba(168,85,247,0.12)",
                    marginTop: 8,
                  }}>
                    <span style={{ color: "#a855f7", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
                      Landing Page
                    </span>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 10px" }}>
                      Conversion-optimized page with no navigation — ideal for ad campaigns and social links.
                    </p>
                    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 200px" }}>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Slug</label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>/e/</span>
                          <input
                            type="text"
                            className="admin-form-input"
                            value={landingPageSlug}
                            onChange={(e) => setLandingPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                            placeholder="auto-generated-from-title"
                            style={{ flex: 1 }}
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={landingPageSlugSaving || !landingPageSlug.trim()}
                        onClick={async () => {
                          setLandingPageSlugSaving(true);
                          try {
                            await fetch(`/api/events/${id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ landing_page_slug: landingPageSlug.trim() }),
                            });
                          } catch {}
                          setLandingPageSlugSaving(false);
                        }}
                        style={{
                          padding: "8px 14px", borderRadius: 8,
                          border: "1px solid rgba(168,85,247,0.3)",
                          background: "rgba(168,85,247,0.1)",
                          color: "#a855f7", fontSize: 12, fontWeight: 600,
                          cursor: landingPageSlugSaving || !landingPageSlug.trim() ? "not-allowed" : "pointer",
                          opacity: landingPageSlugSaving || !landingPageSlug.trim() ? 0.5 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {landingPageSlugSaving ? "Saving..." : "Save Slug"}
                      </button>
                      {landingPageSlug && (
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/e/${landingPageSlug}`;
                            navigator.clipboard.writeText(url);
                            setLandingPageCopied(true);
                            setTimeout(() => setLandingPageCopied(false), 2000);
                          }}
                          style={{
                            padding: "8px 14px", borderRadius: 8,
                            border: `1px solid ${landingPageCopied ? "rgba(34,197,94,0.3)" : "rgba(168,85,247,0.3)"}`,
                            background: landingPageCopied ? "rgba(34,197,94,0.1)" : "rgba(168,85,247,0.1)",
                            color: landingPageCopied ? "#22c55e" : "#a855f7",
                            fontSize: 12, fontWeight: 600,
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          {landingPageCopied ? "Copied!" : "Copy URL"}
                        </button>
                      )}
                      {landingPageSlug && (
                        <a
                          href={`/e/${landingPageSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: "8px 14px", borderRadius: 8,
                            border: "1px solid rgba(168,85,247,0.3)",
                            background: "rgba(168,85,247,0.1)",
                            color: "#a855f7", fontSize: 12, fontWeight: 600,
                            textDecoration: "none", whiteSpace: "nowrap",
                          }}
                        >
                          Preview
                        </a>
                      )}
                    </div>
                    {landingPageSlug && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>
                        {window.location.origin}/e/{landingPageSlug}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Trackable Links (only for hard ticket events) ── */}
                {isHardTicket && (
                  <div className="admin-form-label admin-form-full" style={{
                    padding: 16, borderRadius: 10,
                    background: "rgba(6,182,212,0.04)",
                    border: "1px solid rgba(6,182,212,0.12)",
                    marginTop: 8,
                  }}>
                    <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
                      Trackable Links
                    </span>

                    {/* Existing trackable links */}
                    {trackableLinks.length > 0 && (
                      <div style={{ marginBottom: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                        {trackableLinks.map((link) => (
                          <div key={link.id}>
                            <div style={{
                              display: "flex",
                              flexDirection: isMobile ? "column" : "row",
                              alignItems: isMobile ? "stretch" : "center",
                              gap: isMobile ? 8 : 10,
                              padding: isMobile ? 12 : "8px 12px", borderRadius: 8,
                              background: "rgba(255,255,255,0.03)",
                              border: "1px solid rgba(255,255,255,0.06)",
                              flexWrap: isMobile ? "nowrap" : "wrap",
                            }}>
                              {/* ── Row 1 (mobile) / left cluster (desktop): label + slug + source/medium pills ── */}
                              <div style={{
                                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                                flex: isMobile ? "none" : "0 1 auto", minWidth: 0,
                              }}>
                                <span style={{ fontWeight: 700, color: "#06b6d4", fontSize: 13, wordBreak: "break-word" }}>
                                  {link.label}
                                </span>
                                <span style={{
                                  fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "monospace",
                                  background: "rgba(6,182,212,0.08)", padding: "2px 8px", borderRadius: 4,
                                  wordBreak: "break-all",
                                }}>
                                  /t/{link.slug}
                                </span>
                                {link.source && (
                                  <span style={{
                                    fontSize: 10, color: "rgba(6,182,212,0.8)", background: "rgba(6,182,212,0.1)",
                                    padding: "1px 6px", borderRadius: 10, fontWeight: 600,
                                  }}>
                                    {link.source}
                                  </span>
                                )}
                                {link.medium && (
                                  <span style={{
                                    fontSize: 10, color: "rgba(6,182,212,0.7)", background: "rgba(6,182,212,0.07)",
                                    padding: "1px 6px", borderRadius: 10, fontWeight: 600,
                                  }}>
                                    {link.medium}
                                  </span>
                                )}
                              </div>

                              {/* ── Stats (pushed right on desktop, own line on mobile) ── */}
                              <span style={{
                                fontSize: 11, color: "rgba(255,255,255,0.4)",
                                marginLeft: isMobile ? 0 : "auto",
                                whiteSpace: "nowrap",
                              }}>
                                {link.clicks ?? 0} clicks · {link.conversions ?? 0} conv · ${Number(link.revenue ?? 0).toFixed(0)} rev
                              </span>

                              {/* ── Actions row ── */}
                              <div style={{
                                display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                                justifyContent: isMobile ? "flex-start" : undefined,
                              }}>
                                <button
                                  type="button"
                                  onClick={() => copyTrackableLink(link.slug, link.id)}
                                  style={{
                                    background: copiedLinkId === link.id ? "rgba(34,197,94,0.15)" : "rgba(6,182,212,0.1)",
                                    border: `1px solid ${copiedLinkId === link.id ? "rgba(34,197,94,0.3)" : "rgba(6,182,212,0.2)"}`,
                                    color: copiedLinkId === link.id ? "#22c55e" : "#06b6d4",
                                    fontSize: 11, fontWeight: 600, padding: isMobile ? "6px 10px" : "2px 8px", borderRadius: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  {copiedLinkId === link.id ? "Copied!" : "Copy"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setQrLink({
                                    url: `${window.location.origin}/t/${link.slug}`,
                                    label: link.label,
                                  })}
                                  style={{
                                    background: "rgba(6,182,212,0.1)",
                                    border: "1px solid rgba(6,182,212,0.2)",
                                    color: "#06b6d4",
                                    fontSize: 11, fontWeight: 600, padding: isMobile ? "6px 10px" : "2px 8px", borderRadius: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  QR
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleLinkActive(link.id, link.is_active !== false)}
                                  style={{
                                    background: link.is_active !== false ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.05)",
                                    border: `1px solid ${link.is_active !== false ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.1)"}`,
                                    color: link.is_active !== false ? "#22c55e" : "rgba(255,255,255,0.4)",
                                    fontSize: 10, fontWeight: 600, padding: isMobile ? "6px 10px" : "2px 6px", borderRadius: 4,
                                    cursor: "pointer",
                                  }}
                                >
                                  {link.is_active !== false ? "Active" : "Off"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextId = expandedLinkId === link.id ? null : link.id;
                                    setExpandedLinkId(nextId);
                                    if (nextId) loadLinkAnalytics(nextId);
                                  }}
                                  style={{
                                    background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.15)",
                                    color: "#06b6d4", fontSize: 10, fontWeight: 600,
                                    padding: isMobile ? "6px 10px" : "2px 6px",
                                    borderRadius: 4, cursor: "pointer",
                                  }}
                                >
                                  {expandedLinkId === link.id ? "▲ Stats" : "▼ Stats"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteTrackableLink(link.id)}
                                  style={{
                                    background: "transparent",
                                    border: isMobile ? "1px solid rgba(255,107,107,0.2)" : "none",
                                    color: "rgba(255,107,107,0.7)", cursor: "pointer",
                                    fontSize: 14,
                                    padding: isMobile ? "6px 10px" : 0,
                                    borderRadius: 4,
                                    marginLeft: isMobile ? "auto" : 0,
                                  }}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* Expanded Analytics Dashboard */}
                            {expandedLinkId === link.id && (
                              <div style={{
                                padding: 14, marginTop: 4, borderRadius: 8,
                                background: "rgba(6,182,212,0.03)",
                                border: "1px solid rgba(6,182,212,0.08)",
                              }}>
                                {linkAnalytics[link.id] ? (() => {
                                  const a = linkAnalytics[link.id];
                                  const stats = a.analytics || a;
                                  const dailyClicks: { date: string; count: number }[] = stats.daily_clicks || [];
                                  const maxClicks = Math.max(...dailyClicks.map((d: { count: number }) => d.count), 1);
                                  const convRate = stats.total_clicks > 0
                                    ? ((stats.total_conversions || 0) / stats.total_clicks * 100).toFixed(1)
                                    : "0.0";
                                  return (
                                    <>
                                      <div style={{
                                        display: "grid",
                                        gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(5, 1fr)",
                                        gap: isMobile ? 8 : 10, marginBottom: 14,
                                      }}>
                                        {[
                                          { label: "Total Clicks", value: stats.total_clicks ?? 0, bg: "rgba(6,182,212,0.1)" },
                                          { label: "Unique Clicks", value: stats.unique_clicks ?? 0, bg: "rgba(99,102,241,0.1)" },
                                          { label: "Conversions", value: stats.total_conversions ?? 0, bg: "rgba(34,197,94,0.1)" },
                                          { label: "Revenue", value: `$${Number(stats.total_revenue ?? 0).toFixed(2)}`, bg: "rgba(255, 255, 255, 0.1)" },
                                          { label: "Conv Rate", value: `${convRate}%`, bg: "rgba(244,114,182,0.1)" },
                                        ].map((s) => (
                                          <div key={s.label} style={{
                                            background: s.bg, borderRadius: 8, padding: "10px 8px", textAlign: "center",
                                          }}>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{s.value}</div>
                                            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{s.label}</div>
                                          </div>
                                        ))}
                                      </div>
                                      {dailyClicks.length > 0 && (
                                        <>
                                          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, fontWeight: 600 }}>
                                            Clicks — Last 30 Days
                                          </div>
                                          <div style={{
                                            display: "flex", alignItems: "flex-end", gap: 2, height: 60,
                                          }}>
                                            {dailyClicks.map((d: { date: string; count: number }, i: number) => (
                                              <div
                                                key={i}
                                                title={`${d.date}: ${d.count} clicks`}
                                                style={{
                                                  flex: 1, minWidth: 4,
                                                  height: `${Math.max((d.count / maxClicks) * 100, 4)}%`,
                                                  background: d.count > 0
                                                    ? "rgba(6,182,212,0.6)"
                                                    : "rgba(255,255,255,0.05)",
                                                  borderRadius: 2,
                                                  transition: "height 0.2s",
                                                }}
                                              />
                                            ))}
                                          </div>
                                        </>
                                      )}
                                    </>
                                  );
                                })() : (
                                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>Loading analytics…</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new trackable link */}
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill, minmax(140px, 1fr))",
                      gap: 8,
                      alignItems: "flex-end",
                    }}>
                      <div style={{ gridColumn: isMobile ? "1 / -1" : undefined }}>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Label</label>
                        <input
                          type="text"
                          className="admin-form-input"
                          value={newLink.label}
                          onChange={(e) => handleLinkLabelChange(e.target.value)}
                          placeholder="e.g. Facebook Ad - Spring Show"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Slug</label>
                        <input
                          type="text"
                          className="admin-form-input"
                          value={newLink.slug}
                          onChange={(e) => setNewLink(prev => ({ ...prev, slug: e.target.value }))}
                          placeholder="auto-generated"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Source</label>
                        <select
                          className="admin-form-input"
                          value={newLink.source}
                          onChange={(e) => setNewLink(prev => ({ ...prev, source: e.target.value }))}
                        >
                          <option value="">— Source —</option>
                          {["facebook", "instagram", "twitter", "email", "flyer", "radio", "tv", "website", "other"].map((s) => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Medium</label>
                        <input
                          type="text"
                          className="admin-form-input"
                          value={newLink.medium}
                          onChange={(e) => setNewLink(prev => ({ ...prev, medium: e.target.value }))}
                          placeholder="e.g. paid"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Campaign</label>
                        <input
                          type="text"
                          className="admin-form-input"
                          value={newLink.campaign}
                          onChange={(e) => setNewLink(prev => ({ ...prev, campaign: e.target.value }))}
                          placeholder="optional"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Destination</label>
                        <select
                          className="admin-form-input"
                          value={newLink.destination_type}
                          onChange={(e) => setNewLink(prev => ({ ...prev, destination_type: e.target.value }))}
                        >
                          <option value="event_page">Event Page</option>
                          {landingPageSlug && <option value="landing_page">Landing Page</option>}
                        </select>
                      </div>
                      <button
                        type="button"
                        disabled={creatingLink || !newLink.label.trim() || !newLink.slug.trim()}
                        onClick={createTrackableLink}
                        style={{
                          gridColumn: isMobile ? "1 / -1" : undefined,
                          padding: isMobile ? "12px 14px" : "8px 14px", borderRadius: 8,
                          border: "1px solid rgba(6,182,212,0.3)",
                          background: "rgba(6,182,212,0.1)",
                          color: "#06b6d4", fontSize: 13, fontWeight: 600,
                          cursor: creatingLink || !newLink.label.trim() || !newLink.slug.trim() ? "not-allowed" : "pointer",
                          opacity: creatingLink || !newLink.label.trim() || !newLink.slug.trim() ? 0.5 : 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {creatingLink ? "..." : "+ Create Link"}
                      </button>
                    </div>
                  </div>
                )}
                </div>
              </section>
              <section className="card ee-card">
                <div className="ee-card-head">
                  <span className="ee-eyebrow">Selling elsewhere &amp; partner pixels</span>
                </div>
                <div className="admin-form ee-fields">
                {/* ── External Ticketing Link ── */}
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: externalTicketUrl ? "rgba(245,158,11,0.06)" : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${externalTicketUrl ? "rgba(245,158,11,0.2)" : "rgba(255, 255, 255, 0.12)"}`,
                  marginTop: 8,
                }}>
                  <span style={{ color: externalTicketUrl ? "#f59e0b" : "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
                    External Ticketing Link
                  </span>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "0 0 10px" }}>
                    If tickets are sold on another platform (Eventbrite, AXS, venue box office, etc.), paste the link here.
                    The &ldquo;Buy Tickets&rdquo; button on your event page will route directly to that URL instead of VenueCore checkout.
                  </p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 2 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Ticketing URL</span>
                      <input
                        className="admin-form-input"
                        type="url"
                        placeholder="https://www.eventbrite.com/e/..."
                        value={externalTicketUrl}
                        onChange={(e) => setExternalTicketUrl(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Button Label (optional)</span>
                      <input
                        className="admin-form-input"
                        placeholder="Get Tickets"
                        value={externalTicketLabel}
                        onChange={(e) => setExternalTicketLabel(e.target.value)}
                      />
                    </div>
                  </div>
                  {externalTicketUrl && (
                    <p style={{ fontSize: 11, color: "#f59e0b", marginTop: 8, margin: "8px 0 0" }}>
                      VenueCore checkout is disabled for this event. Tickets link out to the URL above.
                    </p>
                  )}
                </div>

                {/* ── Co-Promoter / Guest Meta Pixel ── */}
                <div className="admin-form-label admin-form-full" style={{
                  padding: 16, borderRadius: 10,
                  background: metaPixelId ? "rgba(59,130,246,0.06)" : "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${metaPixelId ? "rgba(59,130,246,0.2)" : "rgba(255, 255, 255, 0.12)"}`,
                  marginTop: 8,
                }}>
                  <span style={{ color: metaPixelId ? "#3b82f6" : "rgba(255,255,255,0.6)", fontWeight: 700, fontSize: 13, display: "block", marginBottom: 6 }}>
                    Co-Promoter Meta Pixel ID
                  </span>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "0 0 10px" }}>
                    If a co-promoter or advertiser needs their Meta Pixel to fire on this event&apos;s pages
                    (for retargeting their paid social ads), paste their Pixel ID here.
                    It fires alongside the venue&apos;s pixel — both on the event detail and landing pages.
                  </p>
                  <input
                    className="admin-form-input"
                    type="text"
                    placeholder="e.g. 1660200431930684"
                    value={metaPixelId}
                    onChange={(e) => setMetaPixelId(e.target.value.trim())}
                  />
                  {metaPixelId && (
                    <p style={{ fontSize: 11, color: "#3b82f6", marginTop: 8 }}>
                      Co-promoter pixel active — firing on event detail and landing pages.
                    </p>
                  )}
                </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* ── Money rail: on screen across all four tabs, because every edit
            here has a number attached to it. ── */}
        <aside className="ee-rail">
          <section className="card ee-card ee-money">
            <span className="ee-eyebrow">Sold so far</span>
            <dl className="ee-money-rows">
              <div>
                <dt>Gross sold</dt>
                <dd>{ticketing ? fmtUSD(ticketing.gross) : "—"}</dd>
              </div>
              <div>
                <dt>Fees retained</dt>
                <dd>{ticketing ? fmtUSD(ticketing.feesRetained) : "—"}</dd>
              </div>
              <div>
                <dt>Tickets out</dt>
                <dd>
                  {ticketing
                    ? `${ticketing.paidTickets.toLocaleString()}${ticketing.sellable ? ` / ${ticketing.sellable.toLocaleString()}` : ""}`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>Comps issued</dt>
                <dd>{ticketing ? ticketing.compedTickets.toLocaleString() : "—"}</dd>
              </div>
              {/* The mockup's last row, stated as tickets still to sell. */}
              <div className="ee-money-rows-total">
                <dt>To break even</dt>
                <dd>
                  {breakEven === null
                    ? "No offer linked"
                    : breakEven.tickets === null
                      ? "Not at sellout"
                      : Math.max(0, breakEven.tickets - soldTotal) === 0
                        ? "Passed"
                        : `${Math.max(0, breakEven.tickets - soldTotal).toLocaleString()} tickets`}
                </dd>
              </div>
            </dl>
            {ticketing && ticketing.sellable > 0 && (
              <>
                <div className="ee-meter">
                  <span style={{ width: `${Math.min(100, ticketing.sellThrough)}%` }} />
                </div>
                {/* The meter counts every seat gone, comps included — a
                    comped seat cannot be sold to anyone else. "Tickets out"
                    above is paid only, so the note names both rather than
                    letting one percentage stand for two different figures. */}
                <p className="ee-rail-note">
                  {ticketing.sellThrough}% of the sellable room is gone —{" "}
                  {ticketing.paidTickets.toLocaleString()} paid
                  {ticketing.compedTickets > 0 ? `, ${ticketing.compedTickets.toLocaleString()} comped` : ""}.
                  {breakEven && breakEven.tickets !== null
                    ? ` ${breakEven.tickets.toLocaleString()} paid tickets clear the guarantee and costs, per the offer's walkout.`
                    : breakEven && breakEven.tickets === null
                      ? " The offer loses money even sold out."
                      : " Link an offer to see what it takes to break even."}
                </p>
              </>
            )}
          </section>

          <button type="submit" className="btn btn-primary ee-btn-lg ee-save" disabled={saving || uploading}>
            {saving ? "Saving…" : "Save changes"}
          </button>

          <section className="card ee-card">
            <span className="ee-eyebrow">Actions that leave this form</span>
            {/* The mockup's three. Each one is a decision with consequences
                for people who already paid, so none of them is a field on this
                form — they are somewhere else on purpose. Where a flow does
                not exist yet, the row says so rather than pretending. */}
            <div className="ee-actions">
              <Link href={`/admin/events/${id}`} className="ee-action">
                <strong>{eventStatus === "published" ? "Unpublish listing" : "Publish listing"}</strong>
                <span>
                  {eventStatus === "published"
                    ? "Pulls it off the storefront. Sold tickets stay valid and scannable. In the workspace, with its own confirm."
                    : "Puts it on the storefront. In the workspace, with its own confirm."}
                </span>
              </Link>
              <div className="ee-action ee-action--none">
                <strong>Postpone or move</strong>
                <span>
                  No guided flow yet. Change the date above, then notify buyers and settle refund-or-honor per order from the
                  workspace&apos;s orders tab.
                </span>
              </div>
              <div className="ee-action ee-action--none">
                <strong>Cancel show</strong>
                <span>
                  Set Booking status to Cancelled above. That marks the show; it does not refund anything — refunds are issued
                  per order, and {soldTotal > 0 ? `${soldTotal.toLocaleString()} are out.` : "none are out yet."}
                </span>
              </div>
            </div>
            <div className="ee-actions ee-actions--more">
              <Link href={`/admin/events/${id}`} className="ee-action">
                <strong>Event workspace</strong>
                <span>Inventory and holds, orders, settlement.</span>
              </Link>
              <Link href={`/admin/events/${id}/ads`} className="ee-action">
                <strong>Ad Engine</strong>
                <span>Paid campaigns for this show.</span>
              </Link>
            </div>
          </section>

          {auditEntries.length > 0 && (
            <section className="card ee-card">
              <span className="ee-eyebrow">Recent changes</span>
              <ul className="ee-changes">
                {auditEntries.map((a) => (
                  <li key={a.id}>
                    <strong>
                      {new Date(a.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </strong>
                    {" — "}
                    {describeAudit(a)}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </form>

      {/* Crop modal */}
      {rawImageSrc && (
        <ImageCropper
          imageSrc={rawImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspect={16 / 9}
        />
      )}

      {/* Trackable Link QR modal */}
      {qrLink && (
        <TrackableLinkQRModal
          url={qrLink.url}
          label={qrLink.label}
          eventTitle={form.title}
          onClose={() => setQrLink(null)}
        />
      )}
    </div>
  );
}
