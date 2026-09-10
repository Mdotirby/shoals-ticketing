"use client";

import { isHardTicket as isHardTicketType } from "@/lib/eventClass";
import { surchargeCents, ratePctLabel, DEFAULT_SURCHARGE_MODE } from "@/lib/fees/rates";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import ImageCropper from "@/app/components/ImageCropper";
import { TicketTierDraft } from "@/lib/types/ticket";
import { getCookie } from "@/lib/cookies";
import { formatPhoneNumber } from "@/lib/formatPhone";

type EventVenue = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null; facility_fee?: number | null; ticketing_fee?: number | null; tax_rate?: number | null };

type RevenueItem = {
  category: string;
  amount: string;
};

const ACCEPTED_IMAGE_TYPES = ".jpg,.jpeg,.png,.webp";
const MAX_TIERS = 8;

const REVENUE_CATEGORIES = [
  { value: "room_rental", label: "Room Rental" },
  { value: "production", label: "Production" },
  { value: "food_beverage", label: "Food & Beverage" },
  { value: "setup", label: "Setup - Tables & Chairs" },
  { value: "labor", label: "Labor" },
];

const BOOKING_STATUS_COLORS: Record<string, string> = {
  confirmed: "#50c878",
  hold: "#ffc832",
  cancelled: "#ff6b6b",
};

/**
 * The three steps, per ADMIN_MERGE_PLAN.md § 9.1.
 *
 * They answer, in order: what kind of show is this, what does it sell, and
 * when does it go on sale and for how much. Steps 2 and 3 are meaningless for
 * a class that does not sell through our ticketing, which is why the class
 * picker lives in step 1 — it decides whether the other two exist at all.
 */
type StepNumber = 1 | 2 | 3;
const STEPS: { n: StepNumber; label: string }[] = [
  { n: 1, label: "Setup" },
  { n: 2, label: "Tickets" },
  { n: 3, label: "On-sale & fees" },
];

const fmtMoney = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function emptyTier(): TicketTierDraft {
  return { tier_name: "General Admission", price: "", capacity: "", seats: "", comps: "", kills: "" };
}

/**
 * Sellable cap from the room's allocation, exactly as the offer computes it:
 * seats − comps − kills. Returns null when no seats figure is given, which is
 * how a tier that only knows its capacity keeps working unchanged.
 */
function sellableFrom(t: TicketTierDraft): number | null {
  const seats = parseInt(t.seats ?? "");
  if (isNaN(seats) || seats <= 0) return null;
  const comps = parseInt(t.comps ?? "") || 0;
  const kills = parseInt(t.kills ?? "") || 0;
  return Math.max(0, seats - comps - kills);
}

export default function AdminCreateEventPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [selectedEventVenueId, setSelectedEventVenueId] = useState<string | null>(null);
  const [facilityFeeEnabled, setFacilityFeeEnabled] = useState(true);
  // The venue query at line ~139 already selects ticketing_fee and tax_rate;
  // only facility_fee was ever kept. The money rail needs all three to project
  // anything true, so they are carried now. Nulls mean "use the platform
  // default", exactly as resolveVenueFees() does server-side.
  const [selectedVenueFees, setSelectedVenueFees] = useState<{
    facility_fee: number | null;
    ticketing_fee: number | null;
    tax_rate: number | null;
  }>({ facility_fee: null, ticketing_fee: null, tax_rate: null });

  // Resolved venue_id — from cookie or admin_users table
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(null);
  const [availableHosts, setAvailableHosts] = useState<{ id: string; name: string }[]>([]);

  const [form, setForm] = useState({
    title: "",
    venue: "",
    date: "",
    time: "",
    description: "",
    image_url: "",
    event_type: "hard_ticket",
    deal_type: "own_risk",
    booking_status: "confirmed",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
    // Private event client fields
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

  // Revenue items for private events
  const [revenueItems, setRevenueItems] = useState<RevenueItem[]>(
    REVENUE_CATEGORIES.map((c) => ({ category: c.value, amount: "" }))
  );

  // Resolve venue_id from cookie or admin_users table (ensures events are tagged correctly)
  useEffect(() => {
    const cookieVenueId = getCookie("venue-id");
    if (cookieVenueId) {
      setResolvedVenueId(cookieVenueId);
    } else {
      // Fallback: resolve from admin_users record
      import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
        const supabase = getSupabaseBrowser();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData?.user) return;
        const { data: adminRecord } = await supabase
          .from("admin_users")
          .select("venue_id")
          .eq("id", authData.user.id)
          .single();
        if (adminRecord?.venue_id) {
          setResolvedVenueId(adminRecord.venue_id);
        }
      });
    }
  }, []);

  // Fetch all venues (hosts) for the host selector dropdown
  useEffect(() => {
    fetch("/api/venues")
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAvailableHosts(data.map((v: { id: string; name: string }) => ({ id: v.id, name: v.name }))); })
      .catch(() => {});
  }, []);

  // Load event venues for dropdown
  useEffect(() => {
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      getSupabaseBrowser()
        .from("event_venues")
        .select("id, name, full_address, contact_name, phone, facility_fee, ticketing_fee, tax_rate")
        .order("name")
        .then(({ data }: { data: EventVenue[] | null }) => {
          if (data) setEventVenues(data);
        });
    });
  }, []);

  // Free event state
  const [isFree, setIsFree] = useState(false);

  // On-sale scheduler state
  const [onSaleDate, setOnSaleDate] = useState("");
  const [onSaleTime, setOnSaleTime] = useState("");

  // Tier builder state — starts with one default tier
  const [tiers, setTiers] = useState<TicketTierDraft[]>([emptyTier()]);

  // Reserved seating state
  const [reservedSeatingEnabled, setReservedSeatingEnabled] = useState(false);
  const [seatingLayouts, setSeatingCharts] = useState<{ id: string; name: string }[]>([]);
  const [selectedLayoutId, setSelectedChartId] = useState<string | null>(null);

  // Load seating charts
  useEffect(() => {
    fetch("/api/seating/layouts")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setSeatingCharts(data); })
      .catch(() => {});
  }, []);

  // Cropper state
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<StepNumber>(1);
  // Which button was pressed. Kept in state rather than passed through the
  // submit event because the label has to say "Publishing…" vs "Saving…".
  const [publishIntent, setPublishIntent] = useState<"draft" | "published">("draft");

  const [rawImageSrc, setRawImageSrc] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
      prev.map((t, i) => {
        if (i !== index) return t;
        const next = { ...t, [field]: value };
        // seats / comps / kills DERIVE capacity — the operator states the room
        // and the allocation, the form does the subtraction. Typing directly
        // into capacity still works and clears the derivation, because a tier
        // that only knows its sellable number is a legitimate thing to have.
        if (field === "seats" || field === "comps" || field === "kills") {
          const derived = sellableFrom(next);
          if (derived !== null) next.capacity = String(derived);
        }
        if (field === "capacity") {
          next.seats = "";
          next.comps = "";
          next.kills = "";
        }
        return next;
      })
    );
  };

  const addTier = () => {
    if (tiers.length >= MAX_TIERS) return;
    setTiers((prev) => [
      ...prev,
      { tier_name: "", price: "", capacity: "", seats: "", comps: "", kills: "" },
    ]);
  };

  const removeTier = (index: number) => {
    if (tiers.length <= 1) return; // always keep at least 1
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

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const isHardTicket = isHardTicketType(form.event_type);

    // Validate tiers only for hard ticket events
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

    setLoading(true);

    try {
      const dateTime = form.time
        ? `${form.date}T${form.time}:00`
        : `${form.date}T19:00:00`;

      // Use the lowest tier price as the event's display price (or 0 for non-ticketed)
      const lowestPrice = isHardTicket
        ? Math.min(...tiers.map((t) => parseFloat(t.price) || 0))
        : 0;

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          venue: form.venue,
          date: dateTime,
          price: lowestPrice,
          description: isPrivate ? null : (form.description || null),
          image_url: isPrivate ? null : (form.image_url || null),
          // WAS `"published"`, unconditionally. Creating a show put it on the
          // storefront the same second, with no draft state to work in — you
          // could not set a title and come back to the tiers without the show
          // being live and unsellable in between. The rail's two buttons carry
          // the intent now.
          status: publishIntent,
          venue_id: resolvedVenueId || null,
          event_venue_id: selectedEventVenueId || null,
          facility_fee_enabled: isFree ? false : facilityFeeEnabled,
          is_free: isFree,
          on_sale_at: onSaleDate ? `${onSaleDate}T${onSaleTime || "00:00"}:00` : null,
          event_type: form.event_type,
          deal_type: form.deal_type,
          booking_status: form.booking_status,
          contact_name: form.contact_name || null,
          contact_phone: form.contact_phone || null,
          contact_email: form.contact_email || null,
          // Private event client fields
          client_name: isPrivate ? (form.client_name || null) : null,
          client_email: isPrivate ? (form.client_email || null) : null,
          client_phone: isPrivate ? (form.client_phone || null) : null,
          client_billing_address: isPrivate ? (form.client_billing_address || null) : null,
          client_company: isPrivate ? (form.client_company || null) : null,
          tax_exempt: isPrivate ? form.tax_exempt : false,
          start_time: isPrivate && form.start_time ? `${form.date}T${form.start_time}:00` : null,
          end_time: isPrivate && form.end_time ? `${form.date}T${form.end_time}:00` : null,
          tiers: isHardTicket
            ? tiers.map((t, i) => ({
                tier_name: t.tier_name.trim(),
                price: parseFloat(t.price),
                capacity: parseInt(t.capacity),
                sort_order: i,
              }))
            : [],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create event");
      }

      const event = await res.json();

      // ── Record the comp / kill allocation ────────────────────────────────
      // The tier already carries the SELLABLE cap, which is what checkout
      // enforces — these rows do not reduce anything. They say WHO the
      // off-sale seats belong to, so the event workspace can print
      // "30 comps · 20 kills" instead of "50 seats not on sale". Best-effort:
      // a failure here must never lose the show that was just created.
      if (isHardTicket && event.id) {
        for (const t of tiers) {
          const comps = parseInt(t.comps ?? "") || 0;
          const kills = parseInt(t.kills ?? "") || 0;
          if (comps <= 0 && kills <= 0) continue;
          const label = t.tier_name.trim() || "General Admission";
          try {
            if (comps > 0) {
              await fetch(`/api/events/${event.id}/holds`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  quantity: comps,
                  hold_type: "house_comp",
                  owner_label: `${label} comps`,
                  reason: "Allocated at creation — artist, marketing and house",
                }),
              });
            }
            if (kills > 0) {
              await fetch(`/api/events/${event.id}/holds`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  quantity: kills,
                  hold_type: "production",
                  owner_label: `${label} kills`,
                  reason: "Allocated at creation — production and sightline kills",
                }),
              });
            }
          } catch {
            // The show exists and its tiers are right; only the attribution
            // is missing, and it can be added from the Inventory tab.
          }
        }
      }

      // Resolve the facility fee amount to persist on the event_venue row.
      // The checkbox toggles events.facility_fee_enabled; the $ amount lives
      // on event_venues.facility_fee and is read back at checkout + landing.
      const facilityFeeAmount = (isHardTicket && !isFree && facilityFeeEnabled)
        ? Math.max(0, Number(selectedVenueFees.facility_fee ?? 0) || 0)
        : null;

      const { getSupabaseBrowser } = await import("@/lib/supabase-browser");
      const supabase = getSupabaseBrowser();

      // Auto-save manually typed venue to event_venues table
      if (!selectedEventVenueId && form.venue.trim()) {
        const { data: newVenue } = await supabase
          .from("event_venues")
          .insert({
            name: form.venue.trim(),
            full_address: form.venue_address.trim() || null,
            facility_fee: facilityFeeAmount ?? 0,
          })
          .select("id")
          .single();

        // Link the new venue to the event
        if (newVenue?.id && event.id) {
          await supabase
            .from("events")
            .update({ event_venue_id: newVenue.id })
            .eq("id", event.id);
        }
      } else if (selectedEventVenueId && facilityFeeAmount !== null) {
        // Update the chosen venue's facility fee so the landing page /
        // checkout intent picks it up for this event.
        try {
          await supabase
            .from("event_venues")
            .update({ facility_fee: facilityFeeAmount })
            .eq("id", selectedEventVenueId);
        } catch (feeErr) {
          console.error("Failed to persist facility_fee on event_venue:", feeErr);
          // Non-fatal — event itself was created successfully.
        }
      }

      // Save private event revenue items if applicable
      if (form.event_type === "private" && resolvedVenueId && event.id) {
        const revenueToSave = revenueItems.filter((r) => r.amount && parseFloat(r.amount) > 0);
        if (revenueToSave.length > 0) {
          await fetch(`/api/private-events/${event.id}/revenue`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              venue_id: resolvedVenueId,
              items: revenueToSave.map((r, i) => ({
                category: r.category,
                amount: parseFloat(r.amount),
                sort_order: i,
              })),
            }),
          });
        }
      }

      // Create event_layout_maps record if reserved seating is enabled
      if (reservedSeatingEnabled && selectedLayoutId && event.id) {
        await fetch("/api/seating/events/" + event.id + "/map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layout_id: selectedLayoutId,
            enabled: true,
          }),
        }).catch(() => {}); // non-blocking
      }

      // Routing after event creation based on type
      if (form.event_type === "private") {
        // Private events → management hub (billing, client details, attachments)
        router.push(`/admin/private-events/${event.id}`);
      } else if (form.deal_type === "co_promote") {
        // Co-promote → offer creation pre-linked to this event (VS deal)
        router.push(`/admin/offers/new?event_id=${event.id}&event_date=${form.date}&deal_type=VS`);
      } else if (form.deal_type === "rental_box_office") {
        // Rental / Box Office → offer creation pre-linked (FLAT fee deal)
        router.push(`/admin/offers/new?event_id=${event.id}&event_date=${form.date}&deal_type=FLAT`);
      } else {
        router.push("/admin/events");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setLoading(false);
    }
  };

  const isHardTicket = isHardTicketType(form.event_type);
  /* The picker shows five buttons across two axes now: three classes, plus
     Co-Promote and Rental which are deal structures on a hard_ticket show.
     This is which button reads as selected. */
  const selectedTypeValue =
    form.deal_type === "co_promote" || form.deal_type === "rental_box_office"
      ? form.deal_type
      : form.event_type;
  const isPrivate = form.event_type === "private";

  /**
   * What the room is worth at the prices currently typed.
   *
   * Recomputed on every keystroke rather than shown on a summary screen: the
   * moment to know a $25 tier grosses less than the guarantee is while your
   * hand is still on the number, not after the show is saved.
   *
   * Uses the SAME rate card checkout bills against (lib/fees/rates), so this
   * cannot drift from what a buyer is actually charged. It is still an
   * estimate in one respect and says so in the rail: fee and tax rates resolve
   * from the venue server-side at checkout, so a venue whose rates differ from
   * the platform defaults will settle at its own numbers.
   */
  // The room's total allocation across tiers, when it has been stated. Gross
  // is figured on the SELLABLE cap — the offer does the same — so this is
  // context beside the number, not an input to it.
  const roomSeats = tiers.reduce((n, t) => n + (parseInt(t.seats ?? "") || 0), 0);

  const projection = (() => {
    const seats = tiers.reduce((n, t) => n + (parseInt(t.capacity) || 0), 0);
    if (isFree || !isHardTicket || seats === 0) {
      return { seats, face: 0, service: 0, facility: 0, tax: 0, gross: 0, card: 0, net: 0 };
    }
    const svcRate = selectedVenueFees.ticketing_fee ?? 3.0;
    const facRate = facilityFeeEnabled ? (selectedVenueFees.facility_fee ?? 0) : 0;
    const taxRate = selectedVenueFees.tax_rate ?? 0.095;

    let face = 0;
    for (const t of tiers) {
      face += (parseFloat(t.price) || 0) * (parseInt(t.capacity) || 0);
    }
    const service = Math.round(svcRate * seats * 100) / 100;
    const facility = Math.round(facRate * seats * 100) / 100;
    const tax = Math.round(face * taxRate * 100) / 100;

    // The buyer's subtotal before the card surcharge, then the surcharge on
    // top — the same order checkout applies it in.
    const subtotalCents = Math.round((face + service + facility + tax) * 100);
    const card = surchargeCents(subtotalCents, DEFAULT_SURCHARGE_MODE, "online") / 100;
    const gross = Math.round((face + service + facility + tax + card) * 100) / 100;

    // What the venue keeps: gross less the platform's service fee, less what
    // the card cost. Facility fee and tax are collected on the venue's behalf,
    // so they stay in.
    const net = Math.round((gross - service - card) * 100) / 100;
    return { seats, face, service, facility, tax, gross, card, net };
  })();

  /**
   * The publish gate.
   *
   * The mockup is emphatic that publishing is its own action and checks a list
   * first, and it is right for a reason this repo has already paid for: a show
   * published without a tier has a Get Tickets button that leads nowhere, and
   * a show published before its artwork exists is a grey box on the storefront.
   * Every item is derived from the form as it stands.
   */
  const publishChecks: { label: string; ok: boolean }[] = [
    { label: "Title and venue", ok: !!form.title.trim() && !!form.venue.trim() },
    { label: "Date and show time", ok: !!form.date && !!form.time },
    ...(isHardTicket && !isFree
      ? [
          {
            label: "At least one tier with a price and a capacity",
            ok:
              tiers.length > 0 &&
              tiers.every(
                (t) =>
                  t.tier_name.trim() !== "" &&
                  parseFloat(t.price) >= 0 &&
                  !isNaN(parseFloat(t.price)) &&
                  (parseInt(t.capacity) || 0) >= 1
              ),
          },
        ]
      : []),
    ...(!isPrivate ? [{ label: "Event artwork uploaded", ok: !!form.image_url }] : []),
    ...(isHardTicket
      ? [{ label: "On-sale date set", ok: !!onSaleDate }]
      : []),
    ...(reservedSeatingEnabled
      ? [{ label: "Reserved seating is on — a room map is selected", ok: !!selectedLayoutId }]
      : []),
  ];
  const outstanding = publishChecks.filter((c) => !c.ok).length;

  /**
   * Submit with an explicit visibility.
   *
   * This form used to POST `status: "published"` unconditionally, so creating
   * a show put it on the storefront the same second — there was no draft state
   * to work in. Both buttons go through here; the status is the argument.
   */
  const submitWith = (status: "draft" | "published") => {
    setPublishIntent(status);
    // Defer so the intent is in state before handleSubmit reads it.
    requestAnimationFrame(() => {
      formRef.current?.requestSubmit();
    });
  };

  return (
    <div className="admin-form-page cshow">
      <h1 className="admin-page-title">Create a show</h1>
      <p className="cshow-note" style={{ marginTop: -4, marginBottom: 18, maxWidth: 640 }}>
        Pick the class first — it decides the rest of the form. A private rental never
        shows a tier editor; a non-ticketed night never asks for a price. Booking status
        and the on-sale time are independent of each other, so a show can sit confirmed
        on the calendar with its on-sale still weeks out.
      </p>

      {/* ── Numbered steps ────────────────────────────────────────────────
          Three, per § 9.1: what the show is, what it sells, when and for how
          much. They are buttons, not a locked sequence — an operator who
          knows the form should not have to click through Setup to fix a
          price. The publish gate is what enforces completeness, not the
          step order. */}
      <div className="cshow-steps">
        {STEPS.map((s) => (
          <button
            key={s.n}
            type="button"
            className={`cshow-step ${step > s.n ? "cshow-step-done" : ""}`}
            aria-current={step === s.n}
            onClick={() => setStep(s.n)}
            disabled={s.n > 1 && !isHardTicket}
            title={s.n > 1 && !isHardTicket ? "Only ticketed shows have tiers and an on-sale" : undefined}
          >
            <span className="cshow-step-num">{step > s.n ? "\u2713" : s.n}</span>
            {s.label}
          </button>
        ))}
      </div>

      <div className="cshow-layout">
        <form ref={formRef} className="admin-form" onSubmit={handleSubmit}>
          {error && <div className="admin-form-error">{error}</div>}

          {/* ══ 1 · Setup ══════════════════════════════════════════════ */}
          <div hidden={step !== 1} className="cshow-panel">
        {/* Show Type Selector */}
        <div className="admin-form-label admin-form-full">
          Show Type
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            {[
              { value: "hard_ticket",        label: "Hard Ticket",        color: "#ffffff",           bg: "rgba(255, 255, 255, 0.1)" },
              { value: "non_ticketed",        label: "Non-Ticketed",       color: "rgba(100,149,237,0.9)", bg: "rgba(100,149,237,0.1)" },
              { value: "private",             label: "Private Event",      color: "rgba(180,100,200,0.9)", bg: "rgba(180,100,200,0.1)" },
              // Co-Promote and Rental keep their own buttons — the operator
              // still picks "what kind of show is this" in one place — but they
              // now set event_type + deal_type rather than a class of their own
              // (ADMIN_MERGE_PLAN.md § 9.1). Same UX, correct data. The numbered
              // Setup / Tickets / On-sale rebuild of this form is item 8.
              { value: "co_promote",          label: "Co-Promote",         color: "rgba(255,140,0,0.9)",   bg: "rgba(255,140,0,0.1)" },
              { value: "rental_box_office",   label: "Rental / Box Office", color: "rgba(80,200,220,0.9)", bg: "rgba(80,200,220,0.1)" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  const isDeal = opt.value === "co_promote" || opt.value === "rental_box_office";
                  setForm({
                    ...form,
                    event_type: isDeal ? "hard_ticket" : opt.value,
                    deal_type: isDeal ? opt.value : "own_risk",
                  });
                }}
                style={{
                  flex: "1 1 auto",
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${selectedTypeValue === opt.value ? opt.color : "rgba(255,255,255,0.1)"}`,
                  background: selectedTypeValue === opt.value ? opt.bg : "transparent",
                  color: selectedTypeValue === opt.value ? opt.color : "rgba(255,255,255,0.5)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(form.deal_type === "co_promote" || form.deal_type === "rental_box_office") && (
            <p style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
              {form.deal_type === "co_promote"
                ? "After creating this event you'll be taken to the offer builder to set deal terms (split %, guarantee, expenses)."
                : "After creating this event you'll be taken to the offer builder to set the flat rental fee and deal terms."}
            </p>
          )}
        </div>

        {/* Host / Organization Selector */}
        <div className="admin-form-label admin-form-full">
          Host / Organization
          <select
            className="admin-form-input"
            value={resolvedVenueId || ""}
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

        {/* Booking Status */}
        <div className="admin-form-label admin-form-full">
          Booking Status
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {[
              { value: "confirmed", label: "Confirmed" },
              { value: "hold", label: "Hold" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, booking_status: opt.value })}
                style={{
                  flex: 1,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: `1px solid ${form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] : "rgba(255,255,255,0.1)"}`,
                  background: form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] + "18" : "transparent",
                  color: form.booking_status === opt.value ? BOOKING_STATUS_COLORS[opt.value] : "rgba(255,255,255,0.5)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="admin-form-grid">
          <label className="admin-form-label">
            Event Name *
            <input
              type="text"
              name="title"
              className="admin-form-input"
              value={form.title}
              onChange={handleChange}
              placeholder="e.g. Jed Harrelson"
              required
            />
          </label>

          <label className="admin-form-label">
            Venue *
            {eventVenues.length > 0 && (
              <select
                className="admin-form-input"
                value={selectedEventVenueId || ""}
                onChange={(e) => {
                  const v = eventVenues.find((x) => x.id === e.target.value);
                  if (v) {
                    setSelectedEventVenueId(v.id);
                    setForm((prev) => ({ ...prev, venue: v.name, venue_address: v.full_address || "" }));
                    setSelectedVenueFees({ facility_fee: v.facility_fee ?? null, ticketing_fee: v.ticketing_fee ?? null, tax_rate: v.tax_rate ?? null });
                  } else {
                    setSelectedEventVenueId(null);
                    setSelectedVenueFees({ facility_fee: null, ticketing_fee: null, tax_rate: null });
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
              className="admin-form-input"
              value={form.venue}
              onChange={(e) => {
                handleChange(e);
                // Clear selected venue if user types manually
                setSelectedEventVenueId(null);
                setSelectedVenueFees({ facility_fee: null, ticketing_fee: null, tax_rate: null });
              }}
              placeholder="e.g. Singin River Live"
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
              className="admin-form-input"
              value={form.date}
              onChange={handleChange}
              required
            />
          </label>

          {/* Hide the generic Time dropdown for private events — they use Start/End Time instead */}
          {!isPrivate && (
            <label className="admin-form-label">
              Time
              <select
                name="time"
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
          )}

        </div>

        {/* Client Fields — shown for private events */}
        {isPrivate && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: "rgba(180,100,200,0.06)",
            border: "1px solid rgba(180,100,200,0.15)",
            marginTop: 8,
          }}>
            <span style={{ color: "rgba(180,100,200,0.8)", fontWeight: 700, fontSize: 13, marginBottom: 10, display: "block" }}>
              Client Information
            </span>
            <div className="admin-form-grid">
              <label className="admin-form-label">
                Client Name *
                <input
                  type="text"
                  name="client_name"
                  className="admin-form-input"
                  value={form.client_name}
                  onChange={handleChange}
                  placeholder="Client name"
                  required
                />
              </label>
              <label className="admin-form-label">
                Client Email
                <input
                  type="email"
                  name="client_email"
                  className="admin-form-input"
                  value={form.client_email}
                  onChange={handleChange}
                  placeholder="client@example.com"
                />
              </label>
              <label className="admin-form-label">
                Client Phone
                <input
                  type="tel"
                  name="client_phone"
                  className="admin-form-input"
                  value={form.client_phone}
                  onChange={(e) => setForm({ ...form, client_phone: formatPhoneNumber(e.target.value) })}
                  placeholder="(555)-123-4567"
                />
              </label>
              <label className="admin-form-label">
                Client Company
                <input
                  type="text"
                  name="client_company"
                  className="admin-form-input"
                  value={form.client_company}
                  onChange={handleChange}
                  placeholder="Company name (optional)"
                />
              </label>
              <label className="admin-form-label" style={{ gridColumn: "span 2" }}>
                Client Billing Address
                <input
                  type="text"
                  name="client_billing_address"
                  className="admin-form-input"
                  value={form.client_billing_address}
                  onChange={handleChange}
                  placeholder="123 Main St, City, ST 12345"
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
              <label className="admin-form-label" style={{ flex: 1 }}>
                Start Time
                <select
                  name="start_time"
                  className="admin-form-input"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                >
                  <option value="">— Select —</option>
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
              <label className="admin-form-label" style={{ flex: 1 }}>
                End Time
                <select
                  name="end_time"
                  className="admin-form-input"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                >
                  <option value="">— Select —</option>
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

            <label style={{
              display: "flex", alignItems: "center", gap: 10, marginTop: 14,
              color: "rgba(255,255,255,0.7)", fontSize: 14, cursor: "pointer",
            }}>
              <input
                type="checkbox"
                checked={form.tax_exempt}
                onChange={(e) => setForm({ ...form, tax_exempt: e.target.checked })}
                style={{ width: 18, height: 18, accentColor: "#ffffff" }}
              />
              Tax Exempt
            </label>
          </div>
        )}


        {/* Image upload section — hidden for private events */}
        {!isPrivate && <div className="admin-form-label admin-form-full">
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
        </div>}

        {!isPrivate && (
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
        )}
          </div>

          {/* ══ 2 · Tickets ════════════════════════════════════════════ */}
          <div hidden={step !== 2} className="cshow-panel">
            {!isHardTicket && (
              <div className="admin-form-full cshow-note">
                This class does not sell through our ticketing, so there is nothing to
                price here. Go back to Setup, or save the show.
              </div>
            )}
        {/* ── Free Event Checkbox (only for hard ticket events) ── */}
        {isHardTicket && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: isFree ? "rgba(34,197,94,0.06)" : "rgba(255, 255, 255, 0.04)",
            border: `1px solid ${isFree ? "rgba(34,197,94,0.15)" : "rgba(255, 255, 255, 0.12)"}`,
            marginTop: 8,
          }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              color: isFree ? "#22c55e" : "rgba(255,255,255,0.6)",
              fontWeight: 700, fontSize: 13,
            }}>
              <input
                type="checkbox"
                checked={isFree}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsFree(checked);
                  if (checked) {
                    setTiers((prev) => prev.map((t) => ({ ...t, price: "0" })));
                    setFacilityFeeEnabled(false);
                  }
                }}
                style={{ width: 18, height: 18, accentColor: "#22c55e" }}
              />
              Free Event
            </label>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "6px 0 0" }}>
              When enabled, all ticket prices are set to $0 and fees are disabled. Customers will register instead of paying.
            </p>
          </div>
        )}


        {/* ── Ticket Tiers (only for hard ticket events) ── */}
        {isHardTicket && (
          <div className="admin-form-label admin-form-full">
            Ticket Tiers *
            <div className="admin-tiers-list">
              {tiers.map((tier, i) => (
                <div key={i} className="admin-tier-row">
                  <span className="admin-tier-number">Tier {i + 1}</span>
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
                    min="0"
                    required
                    disabled={isFree}
                  />
                  <input
                    type="number"
                    className="admin-form-input admin-tier-input admin-tier-capacity"
                    placeholder="Capacity"
                    value={tier.capacity}
                    onChange={(e) =>
                      handleTierChange(i, "capacity", e.target.value)
                    }
                    min="1"
                    step="1"
                    required
                  />
                  {tiers.length > 1 && (
                    <button
                      type="button"
                      className="admin-tier-remove-btn"
                      onClick={() => removeTier(i)}
                      title="Remove tier"
                    >
                      ✕
                    </button>
                  )}

                  {/* ── Scaling ────────────────────────────────────────────
                      The room, and what comes off it, in the same three
                      fields the offer already uses. Capacity above is the
                      SELLABLE cap — the number checkout enforces a sale
                      against — so it is derived here rather than being a
                      subtraction the operator does in their head and types
                      the answer to. Leave seats blank to just state a
                      capacity; typing into capacity clears these. */}
                  <div className="cshow-scaling">
                    <label className="cshow-scaling-field">
                      <span>Room seats</span>
                      <input
                        type="number" min="0" step="1" placeholder="750"
                        className="admin-form-input"
                        value={tier.seats ?? ""}
                        onChange={(e) => handleTierChange(i, "seats", e.target.value)}
                      />
                    </label>
                    <span className="cshow-scaling-op">−</span>
                    <label className="cshow-scaling-field">
                      <span>Comps</span>
                      <input
                        type="number" min="0" step="1" placeholder="0"
                        className="admin-form-input"
                        value={tier.comps ?? ""}
                        onChange={(e) => handleTierChange(i, "comps", e.target.value)}
                      />
                    </label>
                    <span className="cshow-scaling-op">−</span>
                    <label className="cshow-scaling-field">
                      <span>Kills</span>
                      <input
                        type="number" min="0" step="1" placeholder="0"
                        className="admin-form-input"
                        value={tier.kills ?? ""}
                        onChange={(e) => handleTierChange(i, "kills", e.target.value)}
                      />
                    </label>
                    <span className="cshow-scaling-op">=</span>
                    <div className="cshow-scaling-result">
                      <span>Sellable</span>
                      <strong>{sellableFrom(tier) ?? (parseInt(tier.capacity) || 0)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="cshow-note" style={{ marginTop: 10 }}>
              Comps are the artist, marketing and house allocation — the same
              numbers the offer prices against. They come off the room before
              anything goes on sale, so gross potential in the rail is figured
              on the sellable cap, not the room.
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
                  if (!e.target.checked) setSelectedChartId(null);
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
                    onChange={(e) => setSelectedChartId(e.target.value || null)}
                    style={{ maxWidth: 400 }}
                  >
                    <option value="">— Select a seating layout —</option>
                    {seatingLayouts.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
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

          {/* ══ 3 · On-sale & fees ═════════════════════════════════════ */}
          <div hidden={step !== 3} className="cshow-panel">
            {!isHardTicket && (
              <div className="admin-form-full cshow-note">
                No on-sale and no fees for this class. Go back to Setup, or save the show.
              </div>
            )}
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
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", display: "block", marginBottom: 2 }}>Time</span>
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


        {/* ── Facility Fee Toggle + Amount (only for hard ticket events) ── */}
        {isHardTicket && !isFree && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: facilityFeeEnabled ? "rgba(34,197,94,0.06)" : "rgba(255, 255, 255, 0.04)",
            border: `1px solid ${facilityFeeEnabled ? "rgba(34,197,94,0.15)" : "rgba(255, 255, 255, 0.12)"}`,
            marginTop: 8,
          }}>
            <label style={{
              display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
              color: facilityFeeEnabled ? "#22c55e" : "rgba(255,255,255,0.6)",
              fontWeight: 700, fontSize: 13,
            }}>
              <input
                type="checkbox"
                checked={facilityFeeEnabled}
                onChange={(e) => setFacilityFeeEnabled(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: "#22c55e" }}
              />
              Apply Facility Fee
            </label>
            {facilityFeeEnabled && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: 600 }}>Amount per ticket</span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="admin-form-input"
                  style={{ width: 110, padding: "6px 10px", fontSize: 16 }}
                  value={selectedVenueFees.facility_fee ?? 0}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setSelectedVenueFees((prev) => ({ ...prev, facility_fee: isNaN(v) ? 0 : v }));
                  }}
                  placeholder="0.00"
                />
                <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
                  Saved on the venue; applies to this and future events here.
                </span>
              </div>
            )}
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: "8px 0 0" }}>
              When enabled, this amount is added to each ticket and shown to buyers as a line item.
            </p>
          </div>
        )}


        {/* ── Promo Codes note (only for hard ticket events) ── */}
        {isHardTicket && (
          <div className="admin-form-label admin-form-full" style={{
            padding: 16, borderRadius: 10,
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            marginTop: 8,
          }}>
            <span style={{ color: "#ffffff", fontWeight: 700, fontSize: 13, display: "block" }}>
              Promo Codes
            </span>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, margin: "6px 0 0" }}>
              Save this event first, then add promo codes from the Edit page.
            </p>
          </div>
        )}
          </div>

          <div className="cshow-nav">
            <button
              type="button"
              className="cshow-btn"
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as StepNumber) : s))}
              disabled={step === 1}
            >
              ← Back
            </button>
            <button
              type="button"
              className="cshow-btn"
              onClick={() => setStep((s) => (s < 3 ? ((s + 1) as StepNumber) : s))}
              disabled={step === 3 || !isHardTicket}
            >
              Next →
            </button>
          </div>
        </form>

        {/* ══ The rail — money and the publish gate, on every step ═════ */}
        <aside className="cshow-rail">

          {/* If it sells out. Recomputed live from the tiers as they are
              typed, using the same rate card checkout bills against — an
              operator setting a price should see what the room is worth at
              that price while their hand is still on the number. */}
          {isHardTicket && (
            <div className="cshow-card">
              <div className="cshow-eyebrow">If it sells out</div>
              <div style={{ marginTop: 12 }}>
                <div className="cshow-money-row">
                  <span className="lbl">
                    Face value · {projection.seats.toLocaleString()} sellable
                    {roomSeats > projection.seats && (
                      <span style={{ color: "var(--cshow-w32)" }}> of {roomSeats.toLocaleString()}</span>
                    )}
                  </span>
                  <span className="val">{fmtMoney(projection.face)}</span>
                </div>
                <div className="cshow-money-row">
                  <span className="lbl">Service fee to buyer</span>
                  <span className="val" style={{ color: "var(--cshow-good)" }}>+{fmtMoney(projection.service)}</span>
                </div>
                {projection.facility > 0 && (
                  <div className="cshow-money-row">
                    <span className="lbl">Facility fee to buyer</span>
                    <span className="val" style={{ color: "var(--cshow-good)" }}>+{fmtMoney(projection.facility)}</span>
                  </div>
                )}
                {projection.tax > 0 && (
                  <div className="cshow-money-row">
                    <span className="lbl">Tax collected</span>
                    <span className="val" style={{ color: "var(--cshow-w72)" }}>+{fmtMoney(projection.tax)}</span>
                  </div>
                )}
                <div className="cshow-money-row cshow-money-row--total">
                  <span className="lbl">Gross if sold out</span>
                  <span className="val" style={{ color: "var(--cshow-good)" }}>{fmtMoney(projection.gross)}</span>
                </div>
                <div className="cshow-money-row">
                  <span className="lbl">Card processing (est.)</span>
                  <span className="val" style={{ color: "var(--cshow-w72)" }}>−{fmtMoney(projection.card)}</span>
                </div>
                <div className="cshow-money-row">
                  <span className="lbl">Service fee retained</span>
                  <span className="val" style={{ color: "var(--cshow-w72)" }}>−{fmtMoney(projection.service)}</span>
                </div>
                <div className="cshow-money-row cshow-money-row--total">
                  <span className="lbl">Net to venue</span>
                  <span className="val">{fmtMoney(projection.net)}</span>
                </div>
              </div>
              <div className="cshow-note" style={{ marginTop: 12 }}>
                {isFree
                  ? "Free show — no fees, no tax, no card."
                  : `Card is estimated at ${ratePctLabel("online")} plus one flat fee. Stripe charges that flat fee PER ORDER, so a room this size sold in a few hundred orders costs more than this line — the real figure is Stripe's deduction at settlement. Fee and tax rates resolve from the venue at checkout, so these move if the venue's rates differ from the platform defaults.`}
              </div>
            </div>
          )}

          {/* The publish gate. Persistent because it is the thing that
              decides whether any of this reaches a buyer. */}
          <div className="cshow-card cshow-card--gate">
            <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <div className="cshow-eyebrow">Publish to the storefront</div>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 9.5, color: "var(--cshow-w32)" }}>separate action</span>
            </div>
            <div className="cshow-note" style={{ marginTop: 8 }}>
              Saving as a draft keeps the show off the storefront. Publishing is its own
              button and checks the list below first.
            </div>
            <div style={{ marginTop: 13 }}>
              {publishChecks.map((c: { label: string; ok: boolean }) => (
                <div key={c.label} className="cshow-check">
                  <span className={`cshow-check-mark ${c.ok ? "cshow-check-ok" : "cshow-check-todo"}`}>{c.ok ? "\u2713" : ""}</span>
                  <span className="cshow-check-text" style={{ color: c.ok ? "var(--cshow-w72)" : "var(--cshow-w44)" }}>{c.label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 16 }}>
              <button
                type="button"
                className="cshow-btn cshow-btn--publish"
                disabled={loading || uploading || outstanding > 0}
                onClick={() => submitWith("published")}
              >
                {loading && publishIntent === "published"
                  ? "Publishing\u2026"
                  : outstanding > 0
                    ? `Publish — ${outstanding} item${outstanding === 1 ? "" : "s"} outstanding`
                    : "Publish"}
              </button>
              <button
                type="button"
                className="cshow-btn"
                disabled={loading || uploading}
                onClick={() => submitWith("draft")}
              >
                {loading && publishIntent === "draft" ? "Saving\u2026" : "Save as draft"}
              </button>
            </div>
            <div className="cshow-note" style={{ marginTop: 11 }}>
              Unpublishing later pulls the listing and leaves orders, tickets and scans
              intact. Sold tickets stay valid.
            </div>
          </div>
        </aside>
      </div>

      {/* Crop modal */}
      {rawImageSrc && (
        <ImageCropper
          imageSrc={rawImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
          aspect={16 / 9}
        />
      )}
    </div>
  );
}
