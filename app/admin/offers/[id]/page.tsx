"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useTabParam } from "@/lib/admin/useTabParam";
import { getCookie } from "@/lib/cookies";
import type { ArtistOffer, ShowLineupItem, TicketScalingRow, ExpenseItem, VariableExpenseItem } from "@/lib/types/offer";
import type { Venue } from "@/lib/types/venue";
import type { Contract } from "@/lib/types/contract";
import { exportContractPDF } from "@/lib/pdf/contract-pdf";
import { formatPhoneNumber } from "@/lib/formatPhone";
import DealLabPanel from "@/app/components/deal-lab/DealLabPanel";
import { offerSurchargePerTicket, rateLabel } from "@/lib/fees/rates";
import { Button, Card, Eyebrow, PageHeader, StatusBadge, fmtUSD } from "@/app/components/admin/ui";
import { walkoutAt, type WalkoutBasis } from "@/lib/offers/walkout";
import OfferRail from "../_parts/OfferRail";

/**
 * Deal lab — the mockup's four levers (offers.dc.html): move one, read the
 * venue's net at the bottom. The arithmetic is lib/offers/walkout.ts, the same
 * function the rail and the settlement use, so a scenario here and a walkout
 * there can't disagree.
 *
 * Nothing here writes to the offer until "Copy to the offer" is pressed.
 */
function DealLevers({
  basis,
  faceTier,
  onCopy,
}: {
  basis: WalkoutBasis;
  faceTier: { netPrice: number; sellable: number } | null;
  onCopy: (patch: { guarantee?: number; backendPct?: number; facePrice?: number }) => void;
}) {
  const [guarantee, setGuarantee] = useState(basis.guarantee);
  const [backendPct, setBackendPct] = useState(basis.backendPct);
  const [face, setFace] = useState(faceTier?.netPrice ?? 0);
  const [costs, setCosts] = useState(basis.totalFixed + basis.totalVariable);
  const [share, setShare] = useState(1);

  const asWritten = walkoutAt(share, basis);
  // A face-price move changes net receipts by the tier's own quantity.
  const faceDelta = faceTier ? (face - faceTier.netPrice) * faceTier.sellable : 0;
  const lab = walkoutAt(share, {
    ...basis,
    netPotential: basis.netPotential + faceDelta,
    guarantee,
    backendPct,
    totalFixed: Math.max(0, costs - basis.totalVariable),
  });
  const delta = lab.venue - asWritten.venue;
  const money = (n: number) => fmtUSD(n, { cents: false });

  const levers: Array<{ label: string; value: string; note: string; input: React.ReactNode }> = [
    {
      label: "Guarantee",
      value: money(guarantee),
      note: "What the artist is promised before any split",
      input: <input type="range" min={0} max={Math.max(5000, Math.round(basis.guarantee * 3))} step={100} value={guarantee} onChange={(e) => setGuarantee(Number(e.target.value))} />,
    },
    {
      label: "Artist split after costs",
      value: `${backendPct}%`,
      note: "Backend percentage on net after expenses",
      input: <input type="range" min={0} max={100} step={1} value={backendPct} onChange={(e) => setBackendPct(Number(e.target.value))} />,
    },
    {
      label: "Face price — first tier",
      value: faceTier ? fmtUSD(face) : "—",
      note: faceTier ? `${faceTier.sellable.toLocaleString()} seats at this price` : "no tiers on the offer yet",
      input: <input type="range" min={0} max={Math.max(50, Math.round((faceTier?.netPrice ?? 0) * 3))} step={1} value={face} disabled={!faceTier} onChange={(e) => setFace(Number(e.target.value))} />,
    },
    {
      label: "Show costs",
      value: money(costs),
      note: "Fixed plus variable at sellout",
      input: <input type="range" min={0} max={Math.max(10000, Math.round((basis.totalFixed + basis.totalVariable) * 3))} step={100} value={costs} onChange={(e) => setCosts(Number(e.target.value))} />,
    },
  ];

  return (
    <Card>
      <div className="ofb-card-head">
        <Eyebrow>Deal lab — move one lever</Eyebrow>
        <span className="filter-spacer" />
        <label className="ofl-share">
          against
          <input type="range" min={0.3} max={1} step={0.01} value={share} onChange={(e) => setShare(Number(e.target.value))} />
          {Math.round(share * 100)}% sell-through
        </label>
      </div>

      <div className="ofl">
        {levers.map((l) => (
          <div key={l.label} className="ofl-row">
            <div className="ofl-head">
              <span className="ofl-label">{l.label}</span>
              <span className="ofl-value">{l.value}</span>
            </div>
            {l.input}
            <div className="ofl-note">{l.note}</div>
          </div>
        ))}
      </div>

      <div className="ofl-out">
        <div className="ofl-out-head">
          <span>Venue net at these settings</span>
          <b className={delta > 0.5 ? "ofb-tone-good" : delta < -0.5 ? "ofb-tone-bad" : ""}>{money(lab.venue)}</b>
        </div>
        <div className="ofl-out-sub">
          Versus {money(asWritten.venue)} on the offer as written — {delta >= 0 ? "+" : "−"}{money(Math.abs(delta))}.
          The artist walks with {money(lab.artist)} in this scenario. The lab never writes to the offer; copy a setting across when you like it.
        </div>
        <div className="ofl-out-actions">
          <Button size="sm" onClick={() => onCopy({ guarantee, backendPct, facePrice: faceTier ? face : undefined })}>
            Copy to the offer
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** Convert 24hr time (e.g. "19:00") to 12hr format (e.g. "7:00 PM") */
function formatTime12hr(time: string): string {
  if (!time) return time;
  const match = time.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return time;
  let hours = parseInt(match[1]);
  const minutes = match[2];
  const ampm = hours >= 12 ? "PM" : "AM";
  if (hours === 0) hours = 12;
  else if (hours > 12) hours -= 12;
  return `${hours}:${minutes} ${ampm}`;
}

const DEFAULT_FIXED: ExpenseItem[] = [
  { name: "Rent", amount: 0 }, { name: "Production", amount: 0 }, { name: "Catering", amount: 0 },
  { name: "Hospitality", amount: 0 }, { name: "Support", amount: 0 }, { name: "Talent", amount: 0 },
  { name: "Marketing", amount: 0 }, { name: "Labor", amount: 0 }, { name: "Insurance", amount: 0 },
  { name: "Security", amount: 0 }, { name: "Ushers", amount: 0 }, { name: "Police", amount: 0 },
  { name: "Cleaning", amount: 0 }, { name: "Medical", amount: 0 },
];

const DEFAULT_VARIABLE: VariableExpenseItem[] = [
  { name: "ASCAP", rate: 0.008, amount: 0 }, { name: "BMI", rate: 0.008, amount: 0 },
  { name: "SESAC", rate: 0.0003, amount: 0 }, { name: "GMR", rate: 0.0015, amount: 0 },
];

const OFFER_TABS = ["details", "pnl", "deal_lab"] as const;

export default function AdminOfferDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  type EventVenueOption = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null };
  const [offer, setOffer] = useState<ArtistOffer | null>(null);
  const [venue, setVenue] = useState<Venue | null>(null);
  const [eventVenues, setEventVenues] = useState<EventVenueOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  /** The show a confirmed offer just created, so the banner can link to it. */
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  // Contract state
  const [contract, setContract] = useState<Contract | null>(null);
  const [contractLoading, setContractLoading] = useState(false);
  const [signedByArtist, setSignedByArtist] = useState("");
  const [signedByBuyer, setSignedByBuyer] = useState("");

  // Tab state
  // Keys verbatim from before (merge plan § 10.1); now held in `?tab=` so
  // the sidebar's tab rows and a pasted link open the same tab.
  const [activeTab, setActiveTab] = useTabParam(OFFER_TABS);

  // Ancillary revenue state (P&L tab)
  const [ancillaryItems, setAncillaryItems] = useState([
    { name: "Concessions", income: 0, expenses: 0 },
    { name: "Bars", income: 0, expenses: 0 },
    { name: "Catering/F&B", income: 0, expenses: 0 },
    { name: "Merch", income: 0, expenses: 0 },
    { name: "Venue Merch", income: 0, expenses: 0 },
  ]);

  // Editable fields
  const [form, setForm] = useState<Record<string, unknown>>({});

  // Fetch contract for this offer
  const fetchContract = async () => {
    try {
      const res = await fetch(`/api/contracts?venue_id=${getCookie("venue-id") || ""}`);
      if (res.ok) {
        const all: Contract[] = await res.json();
        const found = all.find((c) => c.offer_id === id);
        if (found) {
          setContract(found);
          setSignedByArtist(found.signed_by_artist || "");
          setSignedByBuyer(found.signed_by_buyer || "");
        }
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const venueId = getCookie("venue-id");

    fetch(`/api/offers/${id}`).then((r) => r.json())
      .then(async (offerData) => {
        if (offerData.error) { setError(offerData.error); return; }
        setOffer(offerData);
        setForm(offerData);

        // Resolve venue: use venue-id cookie, offer's venue_id, or first available venue (for owner)
        try {
          const venues: Venue[] = await fetch("/api/venues").then((r) => r.json());
          if (Array.isArray(venues) && venues.length > 0) {
            const resolveVenueId = venueId || offerData.venue_id;
            const found = resolveVenueId
              ? venues.find((v) => v.id === resolveVenueId) || venues[0]
              : venues[0]; // owner without cookie — use first venue
            setVenue(found);
          }
        } catch { /* ignore */ }
      })
      .catch(() => setError("Failed to load offer"))
      .finally(() => setLoading(false));

    // Also load contract
    fetchContract();

    // Fetch event venues for dropdown
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      getSupabaseBrowser()
        .from("event_venues")
        .select("id, name, full_address, contact_name, phone")
        .order("name")
        .then(({ data }: { data: EventVenueOption[] | null }) => {
          if (data) setEventVenues(data);
        });
    });
  }, [id]);

  const updateField = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ── Live-computed financials (recalculate whenever tiers/expenses/tax change) ──
  const live = useMemo(() => {
    const scaling = Array.isArray(form.ticket_scaling) ? form.ticket_scaling as Array<Record<string, number>> : [];
    const fixedExp = Array.isArray(form.fixed_expenses) ? form.fixed_expenses as Array<{ amount: number }> : [];
    const varExp = Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<{ rate: number; amount: number }> : [];

    // grossPotential = face + fees (base for PRO/variable expense % calc)
    const grossPotential = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.price) || 0), 0);
    const totalFees = scaling.reduce((s, r) => s + ((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0)) * (Number(r.sellable_cap) || 0), 0);
    const adjGross = grossPotential - totalFees; // = face × sellable; drives net/splitpoint

    const rawTaxRate = Number(form.tax_rate) || 0;
    const taxRatePct = rawTaxRate > 0 && rawTaxRate < 1 ? rawTaxRate * 100 : rawTaxRate;
    const taxRateDecimal = taxRatePct / 100;
    const taxMethod = (form.tax_method as string) || "multiplier";

    let netPotential: number;
    let taxAmount: number;
    if (taxMethod === "divisor") {
      netPotential = Math.round((adjGross / (1 + taxRateDecimal)) * 100) / 100;
      taxAmount = Math.round((adjGross - netPotential) * 100) / 100;
    } else {
      taxAmount = Math.round((adjGross * taxRateDecimal) * 100) / 100;
      netPotential = adjGross; // = face × sellable; taxes collected from customers and remitted
    }

    // displayGross = true all-in × sellable: what customers collectively pay (incl. CC).
    const displayGross = scaling.reduce((s, r) => {
      const taxPer = taxMethod === "divisor"
        ? 0
        : Math.round((Number(r.net_price) || 0) * taxRateDecimal * 100) / 100;
      const preCC = (Number(r.price) || 0) + taxPer;
      const cc = offerSurchargePerTicket(preCC);
      return s + (Number(r.sellable_cap) || 0) * (preCC + cc);
    }, 0);
    const totalCC = scaling.reduce((s, r) => {
      const taxPer = taxMethod === "divisor" ? 0 : Math.round((Number(r.net_price) || 0) * taxRateDecimal * 100) / 100;
      const preCC = (Number(r.price) || 0) + taxPer;
      return s + (Number(r.sellable_cap) || 0) * offerSurchargePerTicket(preCC);
    }, 0);
    const preCCGross = displayGross - totalCC;
    const displayAdjGross = preCCGross - totalFees;

    const totalFixed = fixedExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const totalVariable = varExp.reduce((s, e) => s + ((Number(e.rate) || 0) * grossPotential), 0);
    const totalExpenses = totalFixed + totalVariable;

    // Artist payment model — identical to the create page and to the
    // settlement page. "Splitpoint" is the pool the backend percentage is
    // measured against — net receipts/potential minus expenses. Always
    // netAfterExpenses, regardless of deal type; it's a factual "what's left
    // after expenses" figure, not the guarantee. The guarantee is the
    // threshold the pool gets measured against to compute overage below.
    const netAfterExpenses = netPotential - totalExpenses;
    const guaranteeNum = Number(form.guarantee || 0);
    const backendPctDecimal = Number(form.backend_percentage || 0) / 100;
    const dealTypeNow = String(form.deal_type || "");
    const splitpoint = netAfterExpenses;
    // (pool × backend%) − guarantee, i.e. max(guarantee, pool × backend%).
    const overage = netAfterExpenses * backendPctDecimal - guaranteeNum;
    const artistBackend =
      dealTypeNow === "FLAT" || overage <= 0 ? 0 : overage;
    const artistTotal = guaranteeNum + artistBackend;
    const potWalkout = netAfterExpenses - artistTotal;

    return {
      grossPotential,
      adjGross,
      displayGross,
      totalCC,
      preCCGross,
      displayAdjGross,
      totalFees,
      taxRatePct,
      taxAmount,
      netPotential,
      totalFixed,
      totalVariable,
      totalExpenses,
      netAfterExpenses,
      splitpoint,
      overage,
      artistBackend,
      artistTotal,
      potWalkout,
    };
  }, [
    form.ticket_scaling, form.fixed_expenses, form.variable_expenses, form.tax_rate, form.tax_method,
    // artistBackend / artistTotal / potWalkout read these — without them the
    // artist figures sat stale after a guarantee or backend edit.
    form.guarantee, form.backend_percentage, form.deal_type,
  ]);

  // ── Scaling rows, as the six-column table reads them ──────────────────────
  // Same arithmetic the 13-column sheet did; the working columns now open per
  // tier instead of all being on screen at once.
  const [openTier, setOpenTier] = useState<number | null>(null);

  const scalingRaw = Array.isArray(form.ticket_scaling)
    ? (form.ticket_scaling as Array<Record<string, number | string>>)
    : [];

  const setTier = (i: number, patch: Record<string, string | number>) => {
    const s = [...scalingRaw];
    s[i] = { ...s[i], ...patch };
    updateField("ticket_scaling", s);
  };
  /** Seats, comps and kills all feed sellable — keep it in step. */
  const setSeats = (i: number, key: "seats" | "comps" | "kills", v: number) => {
    const s = [...scalingRaw];
    const row = { ...s[i], [key]: v };
    row.sellable_cap = Number(row.seats || 0) - Number(row.comps || 0) - Number(row.kills || 0);
    s[i] = row;
    updateField("ticket_scaling", s);
  };
  const globalFees = {
    fac: Number(scalingRaw[0]?.facility_fee ?? 0),
    tkt: Number(scalingRaw[0]?.ticketing_fee ?? 0),
  };
  const applyFeesToAll = (fac: number, tkt: number) => {
    updateField(
      "ticket_scaling",
      scalingRaw.map((r) => ({ ...r, facility_fee: fac, ticketing_fee: tkt, price: Number(r.net_price || 0) + fac + tkt })),
    );
  };

  const scalingRows = scalingRaw.map((r, i) => {
    const rawTax = Number(form.tax_rate) || 0;
    const trd = (rawTax > 0 && rawTax < 1 ? rawTax * 100 : rawTax) / 100;
    const tm = (form.tax_method as string) || "multiplier";
    const netPrice = Number(r.net_price || 0);
    const facFee = Number(r.facility_fee || 0);
    const tktFee = Number(r.ticketing_fee || 0);
    const price = Number(r.price || netPrice + facFee + tktFee);
    const taxEach = tm === "divisor"
      ? Math.round((netPrice * trd) / (1 + trd) * 100) / 100
      : Math.round(netPrice * trd * 100) / 100;
    const preCC = tm === "divisor" ? price : price + taxEach;
    const ccEach = offerSurchargePerTicket(preCC);
    const allIn = preCC + ccEach;
    const sellable = Number(r.sellable_cap || 0);
    return {
      i,
      raw: r,
      name: String(r.name || ""),
      seats: Number(r.seats || 0),
      comps: Number(r.comps || 0),
      kills: Number(r.kills || 0),
      netPrice, facFee, tktFee, price, taxEach, ccEach, allIn, sellable,
      feesEach: facFee + tktFee + taxEach + ccEach,
      gross: sellable * allIn,
      net: sellable * netPrice,
    };
  });
  // Column sums, so the total line adds up the rows above it exactly.
  const scalingTotals = {
    seats: scalingRows.reduce((t, r) => t + r.seats, 0),
    sellable: scalingRows.reduce((t, r) => t + r.sellable, 0),
    gross: scalingRows.reduce((t, r) => t + r.gross, 0),
    net: scalingRows.reduce((t, r) => t + r.net, 0),
  };

  // Merge live-computed derived totals into form state before saving so the
  // database always has the up-to-date totals/splitpoint/net_potential/etc.
  const buildSavePayload = (overrides: Record<string, unknown> = {}) => ({
    ...form,
    gross_potential: live.grossPotential,
    adj_gross: live.adjGross,
    net_potential: live.netPotential,
    tax_amount: live.taxAmount,
    total_fixed: live.totalFixed,
    total_variable: live.totalVariable,
    total_expenses: live.totalExpenses,
    splitpoint: live.splitpoint,
    // Re-sync variable expense amounts so stored amounts match live display
    variable_expenses: (Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<Record<string, unknown>> : [])
      .map((e) => ({
        ...e,
        amount: Math.round((Number(e.rate) || 0) * live.grossPotential * 100) / 100,
      })),
    ...overrides,
  });

  const handleSave = async () => {
    setSaving(true); setError(""); setSuccess(""); setCreatedEventId(null);
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload()),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setOffer(updated);
      setForm(updated);
      setSuccess("Offer saved.");
    } catch { setError("Failed to save."); }
    finally { setSaving(false); }
  };

  const handleStatusChange = async (status: string) => {
    setSaving(true); setError(""); setSuccess(""); setCreatedEventId(null);
    try {
      const res = await fetch(`/api/offers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload({ status })),
      });
      if (!res.ok) throw new Error("Failed");
      const updated = await res.json();
      setOffer(updated);
      setForm(updated);

      if (status === "accepted") {
        // Create the show from the offer — as a DRAFT.
        //
        // This used to POST status: "published", so countersigning an offer
        // put a live, buyable show on the storefront with no artwork and
        // nobody's say-so. Confirming an offer is a booking decision; it
        // belongs on the calendar and in the Shows list straight away, which
        // booking_status: "confirmed" does. Being on sale is a separate,
        // deliberate act — the Publish button in the event workspace.
        setSuccess("Offer confirmed! Creating the show as a draft…");

        // Build date with show time (local string, not ISO — matches how events are stored)
        const offerDate = updated.event_date ? String(updated.event_date).slice(0, 10) : "";
        const showTime = updated.show_time || "19:00"; // default 7 PM
        const eventDate = offerDate
          ? `${offerDate}T${showTime.length === 5 ? showTime : "19:00"}:00`
          : new Date().toISOString();

        // Build ticket tiers from offer scaling
        const scaling = Array.isArray(updated.ticket_scaling) ? updated.ticket_scaling : [];
        const tiers = scaling
          .filter((r: { sellable_cap: number; price: number }) => r.sellable_cap > 0)
          .map((r: { name: string; price: number; net_price?: number; sellable_cap: number }) => ({
            tier_name: r.name || "General Admission",
            price: r.net_price ?? r.price ?? 0,
            capacity: r.sellable_cap || 500,
          }));

        // Display price = lowest tier price, or 0 if no tiers
        const displayPrice = tiers.length > 0
          ? Math.min(...tiers.map((t: { price: number }) => t.price))
          : 0;

        const eventRes = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: updated.artist_name,
            venue: updated.venue || venue?.name || "TBD",
            date: eventDate,
            price: displayPrice,
            venue_id: updated.venue_id || getCookie("venue-id") || null,
            event_venue_id: updated.event_venue_id || null,
            status: "draft",
            booking_status: "confirmed",
            description: `${updated.artist_name} - ${updated.billing || "Live Performance"}`,
            tiers: tiers.length > 0 ? tiers : undefined,
          }),
        });
        if (eventRes.ok) {
          const created = await eventRes.json().catch(() => null);
          setCreatedEventId(created?.id ?? null);
          // Point the offer at the show it just made. Without this the two
          // records never know about each other: the workspace reads "no offer
          // linked" and the break-even row on the edit rail stays empty,
          // because both look the offer up by event_id.
          if (created?.id) {
            await fetch(`/api/offers/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ event_id: created.id }),
            }).catch(() => {});
          }
          setSuccess(
            "Offer confirmed. The show is on the calendar as a draft with its tiers — add artwork, then publish it from the event workspace when you want it on sale.",
          );
        } else {
          setSuccess("Offer confirmed, but the show wasn't created. Create it from Create a show.");
        }
      } else if (status === "declined") {
        setSuccess("Offer declined.");
      }
    } catch { setError("Failed to update status."); }
    finally { setSaving(false); }
  };

  // ── Excel Export ── builds a full ArtistOffer-shaped object from the
  // loaded record + any live/unsaved form edits (same assembly pattern as
  // buildPdfSettlement() in the settlements admin page), so the export
  // always matches what's on screen, not just what's last been saved.
  const exportPDF = async () => {
    if (!offer) return;
    setExporting(true);
    try {
      const xlsxOffer: ArtistOffer = {
        ...offer,
        venue: form.venue as string,
        venue_address: form.venue_address as string,
        venue_contact: form.venue_contact as string,
        venue_phone: form.venue_phone as string,
        agency: form.agency as string,
        agent_name: form.agent_name as string,
        agent_phone: form.agent_phone as string,
        agent_email: form.agent_email as string,
        artist_name: form.artist_name as string,
        event_date: form.event_date as string,
        num_shows: form.num_shows as number,
        show_length: form.show_length as string,
        show_time: form.show_time as string,
        billing: form.billing as string,
        show_lineup: (form.show_lineup as { time: string; artist: string; set_length: string }[]) || [],
        guarantee: form.guarantee as number,
        deal_type: form.deal_type as ArtistOffer["deal_type"],
        backend_percentage: form.backend_percentage as string,
        other_terms: form.other_terms as string,
        radius_distance: form.radius_distance as string,
        radius_days_prior: form.radius_days_prior as number,
        radius_days_after: form.radius_days_after as number,
        production_by: form.production_by as string,
        deposit_amount: form.deposit_amount as number,
        deposit_pct: form.deposit_pct as number,
        deposit_due: form.deposit_due as string,
        balance_due: form.balance_due as string,
        merch_split: form.merch_split as string,
        merch_seller: form.merch_seller as string,
        comps: form.comps as number,
        artist_comps: form.artist_comps as number,
        marketing_comps: form.marketing_comps as number,
        ticket_scaling: form.ticket_scaling as TicketScalingRow[],
        fixed_expenses: form.fixed_expenses as ExpenseItem[],
        variable_expenses: form.variable_expenses as VariableExpenseItem[],
        total_fixed: live.totalFixed,
        total_variable: live.totalVariable,
        total_expenses: live.totalExpenses,
        gross_potential: live.grossPotential,
        adj_gross: live.adjGross,
        tax_rate: form.tax_rate as number,
        tax_method: (form.tax_method as "divisor" | "multiplier") || "multiplier",
        net_potential: live.netPotential,
        splitpoint: live.splitpoint,
        artist_backend: form.artist_backend as number,
        offer_valid_days: form.offer_valid_days as number,
      };

      const res = await fetch(`/api/offers/${offer.id}/export-xlsx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: xlsxOffer }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = /filename="([^"]+)"/.exec(disposition);
      const filename = filenameMatch?.[1] || "Offer.xlsx";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) { console.error("Excel export failed:", err); }
    finally { setExporting(false); }
  };

  if (loading) return <div className="ofb-state">Loading offer…</div>;
  if (!offer) return <div className="ofb-state">Offer not found.</div>;

  const tabLabel: Record<(typeof OFFER_TABS)[number], string> = { details: "Details", pnl: "P&L", deal_lab: "Deal lab" };
  const dateLabel = form.event_date
    ? new Date(String(form.event_date).slice(0, 10) + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    : "MA — no date";
  const updatedAt = (offer as { updated_at?: string }).updated_at;
  const walkoutBasis = {
    netPotential: live.netPotential,
    totalFixed: live.totalFixed,
    totalVariable: live.totalVariable,
    sellable: scalingTotals.sellable,
    guarantee: Number(form.guarantee) || 0,
    backendPct: Number(form.backend_percentage) || 0,
    dealType: String(form.deal_type || "FLAT"),
  };

  return (
    <div className="ofb">
      <PageHeader
        eyebrow="Offer"
        title={String(form.artist_name || "Offer")}
        sub={[dateLabel, String(form.venue || ""), form.agency ? String(form.agency) : ""].filter(Boolean).join(" · ")}
        actions={
          <>
            <Button variant="ghost" onClick={() => router.push("/admin/offers")}>← Offers</Button>
            <Button onClick={exportPDF} disabled={exporting}>{exporting ? "Generating…" : "Export Excel"}</Button>
            <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </>
        }
      />

      {error && <div className="ofb-banner ofb-banner--bad">{error}</div>}
      {success && (
        <div className="ofb-banner ofb-banner--good">
          {success}
          {createdEventId && (
            <>
              {" "}
              <Link href={`/admin/events/${createdEventId}`} className="ofb-banner-link">
                Open the show →
              </Link>
            </>
          )}
        </div>
      )}

      {/* Status + Confirm/Deny */}
      <div className="ofb-status">
        <StatusBadge variant={offer.status === "accepted" ? "good" : offer.status === "declined" ? "bad" : "draft"}>
          {offer.status}
        </StatusBadge>
        {offer.status !== "accepted" && offer.status !== "declined" && (
          <>
            <Button size="sm" onClick={() => handleStatusChange("accepted")} disabled={saving}>✓ Confirm offer</Button>
            <Button size="sm" variant="danger" onClick={() => handleStatusChange("declined")} disabled={saving}>✕ Deny offer</Button>
          </>
        )}
        {/* A countersigned offer is a contract: its terms are read-only here
            (the save route refuses changes) and change only by revision. */}
        {offer.status === "accepted" && (
          <Link href={`/admin/offers/${offer.id}/edit`} className="ofb-status-link">
            <strong>Countersigned</strong>
            <span>terms are locked — view signed terms &amp; create a revision →</span>
          </Link>
        )}
        {typeof offer.revision_of === "string" && offer.status !== "accepted" && (
          <Link href={`/admin/offers/${offer.revision_of}/edit`} className="ofb-status-link">
            <strong>Revision v{String(offer.version ?? "")}</strong>
            <span>the signed version stays in force until this one is countersigned →</span>
          </Link>
        )}
      </div>

      {/* Tabs — keys verbatim (details / pnl / deal_lab), held in ?tab= */}
      <div className="merged-tabs ofb-tabs" role="tablist">
        {OFFER_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`merged-tab${activeTab === tab ? " is-on" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tabLabel[tab]}
          </button>
        ))}
        <span className="ofb-tabs-note">
          {offer.version ? `v${String(offer.version)}` : ""}
          {offer.version && updatedAt ? " · " : ""}
          {updatedAt ? `updated ${new Date(updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
        </span>
      </div>

      <div className="ofb-grid">
      <div className="ofb-main">
      {activeTab === "details" && (
      <>
      {/* ── Deal structure — the mockup's nine fields, three across ── */}
      <Card
        title="Deal structure"
        actions={<span className="ofb-kind">{String(form.deal_type || "FLAT")} · {form.event_date ? "dated" : "MA — no date"}</span>}
      >
        <div className="ofb-fields">
          <label className="ofb-field">
            <span className="ofb-field-label">Artist</span>
            <input value={String(form.artist_name || "")} onChange={(e) => updateField("artist_name", e.target.value)} />
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Agency / agent</span>
            <span className="ofb-field-pair">
              <input value={String(form.agency || "")} placeholder="Agency" onChange={(e) => updateField("agency", e.target.value)} />
              <input value={String(form.agent_name || "")} placeholder="Agent" onChange={(e) => updateField("agent_name", e.target.value)} />
            </span>
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Date</span>
            <input
              type="date"
              value={form.event_date ? String(form.event_date).slice(0, 10) : ""}
              onChange={(e) => updateField("event_date", e.target.value || null)}
            />
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Venue / room</span>
            <input value={String(form.venue || "")} onChange={(e) => updateField("venue", e.target.value)} />
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Deal type</span>
            <select value={String(form.deal_type || "FLAT")} onChange={(e) => updateField("deal_type", e.target.value)}>
              <option>VS</option><option>FLAT</option><option>PLUS</option><option>BONUS</option>
            </select>
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Guarantee</span>
            <input type="number" step="0.01" value={String(form.guarantee || "")} onChange={(e) => updateField("guarantee", parseFloat(e.target.value) || 0)} />
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Backend split</span>
            <input
              value={String(form.backend_percentage || "")}
              placeholder="% after costs"
              onChange={(e) => updateField("backend_percentage", e.target.value)}
            />
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Billing</span>
            <select value={String(form.billing || "100% Headline")} onChange={(e) => updateField("billing", e.target.value)}>
              <option>100% Headline</option><option>Co-Headline</option><option>Support</option>
            </select>
          </label>
          <label className="ofb-field">
            <span className="ofb-field-label">Merch rate</span>
            <input value={String(form.merch_split || "")} placeholder="e.g. 80/20 · venue sells" onChange={(e) => updateField("merch_split", e.target.value)} />
          </label>
        </div>

        {/* Everything else the offer carries — the export and the contract read
            these, so they stay on the page, out of the way. */}
        <details className="ofb-terms">
          <summary>
            <span className="ui-eyebrow">More terms</span>
            <span className="ofb-terms-sub">venue contact · agent contact · radius · deposit · comps · tax · notes</span>
          </summary>
          <div className="ofb-terms-body">
            <div className="ofb-fields">
              {eventVenues.length > 0 && (
                <label className="ofb-field">
                  <span className="ofb-field-label">Copy a previous venue</span>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const v = eventVenues.find((x) => x.id === e.target.value);
                      if (v) {
                        updateField("event_venue_id", v.id);
                        updateField("venue", v.name);
                        updateField("venue_address", v.full_address || "");
                        updateField("venue_contact", v.contact_name || "");
                        updateField("venue_phone", v.phone || "");
                      }
                    }}
                  >
                    <option value="" disabled>— choose —</option>
                    {eventVenues.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="ofb-field ofb-field--wide">
                <span className="ofb-field-label">Venue address</span>
                <input value={String(form.venue_address || "")} onChange={(e) => updateField("venue_address", e.target.value)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Venue contact</span>
                <input value={String(form.venue_contact || "")} onChange={(e) => updateField("venue_contact", e.target.value)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Venue phone</span>
                <input type="tel" value={String(form.venue_phone || "")} onChange={(e) => updateField("venue_phone", formatPhoneNumber(e.target.value))} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Agent phone</span>
                <input type="tel" value={String(form.agent_phone || "")} onChange={(e) => updateField("agent_phone", formatPhoneNumber(e.target.value))} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Agent email</span>
                <input type="email" value={String(form.agent_email || "")} onChange={(e) => updateField("agent_email", e.target.value)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Radius (mi)</span>
                <input value={String(form.radius_distance || "")} onChange={(e) => updateField("radius_distance", e.target.value)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Days prior</span>
                <input type="number" value={String(form.radius_days_prior || "")} onChange={(e) => updateField("radius_days_prior", parseInt(e.target.value) || null)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Days after</span>
                <input type="number" value={String(form.radius_days_after || "")} onChange={(e) => updateField("radius_days_after", parseInt(e.target.value) || null)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Deposit $</span>
                <input type="number" step="0.01" value={String(form.deposit_amount || "")} onChange={(e) => updateField("deposit_amount", parseFloat(e.target.value) || 0)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Balance due</span>
                <input value={String(form.balance_due || "")} onChange={(e) => updateField("balance_due", e.target.value)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Total comps</span>
                <input type="number" value={String(form.comps || "")} onChange={(e) => updateField("comps", parseInt(e.target.value) || 0)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Artist comps</span>
                <input type="number" value={String(form.artist_comps || "")} onChange={(e) => updateField("artist_comps", parseInt(e.target.value) || 0)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Marketing comps</span>
                <input type="number" value={String(form.marketing_comps || "")} onChange={(e) => updateField("marketing_comps", parseInt(e.target.value) || 0)} />
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Tax method</span>
                <select value={String(form.tax_method || "multiplier")} onChange={(e) => updateField("tax_method", e.target.value)}>
                  <option value="multiplier">Multiplier — on top of face</option>
                  <option value="divisor">Divisor — baked into face</option>
                </select>
              </label>
              <label className="ofb-field">
                <span className="ofb-field-label">Tax rate (%)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={(() => { const r = Number(form.tax_rate || 0); return r > 0 && r < 1 ? r * 100 : r; })()}
                  onChange={(e) => updateField("tax_rate", parseFloat(e.target.value) / 100 || 0)}
                />
              </label>
              <label className="ofb-field ofb-field--wide">
                <span className="ofb-field-label">Notes</span>
                <textarea rows={3} value={String(form.notes || "")} onChange={(e) => updateField("notes", e.target.value)} />
              </label>
            </div>
          </div>
        </details>
      </Card>

      {/* ── Scaling & gross potential — the mockup's six columns; the working
             figures (seats, comps, kills, net price) open per tier ── */}
      <Card
        title="Scaling & gross potential"
        sub={`${scalingTotals.sellable.toLocaleString()} sellable of ${scalingTotals.seats.toLocaleString()} in the room`}
      >
        <div className="ofs">
          <div className="ofs-row ofs-row--head">
            <div>Tier</div>
            <div className="ofs-num">Qty</div>
            <div className="ofs-num">Price</div>
            <div className="ofs-num">Fees</div>
            <div className="ofs-num">Gross</div>
            <div className="ofs-num">Net to show</div>
            <div />
          </div>

          {scalingRows.map((r) => (
            <div key={r.i} className="ofs-tier">
              <div className="ofs-row">
                <div className="ofs-name">{r.name || "Untitled tier"}</div>
                <div className="ofs-num">{r.sellable.toLocaleString()}</div>
                <div className="ofs-num">{fmtUSD(r.allIn)}</div>
                <div className="ofs-num ofs-dim">{fmtUSD(r.feesEach)} ea</div>
                <div className="ofs-num">{fmtUSD(r.gross, { cents: false })}</div>
                <div className="ofs-num ofs-strong">{fmtUSD(r.net, { cents: false })}</div>
                <button
                  type="button"
                  className="ofs-toggle"
                  aria-expanded={openTier === r.i}
                  onClick={() => setOpenTier(openTier === r.i ? null : r.i)}
                >
                  {openTier === r.i ? "▾" : "▸"}
                </button>
              </div>
              {openTier === r.i && (
                <div className="ofs-edit">
                  <label className="ofb-field">
                    <span className="ofb-field-label">Tier name</span>
                    <input value={r.name} onChange={(e) => setTier(r.i, { name: e.target.value })} />
                  </label>
                  <label className="ofb-field">
                    <span className="ofb-field-label"># Seats</span>
                    <input type="number" value={r.seats || ""} onChange={(e) => setSeats(r.i, "seats", parseInt(e.target.value) || 0)} />
                  </label>
                  <label className="ofb-field">
                    <span className="ofb-field-label">Comps</span>
                    <input type="number" value={r.comps || ""} onChange={(e) => setSeats(r.i, "comps", parseInt(e.target.value) || 0)} />
                  </label>
                  <label className="ofb-field">
                    <span className="ofb-field-label">Kills</span>
                    <input type="number" value={r.kills || ""} onChange={(e) => setSeats(r.i, "kills", parseInt(e.target.value) || 0)} />
                  </label>
                  <label className="ofb-field">
                    <span className="ofb-field-label">Net price (face)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={r.netPrice || ""}
                      onChange={(e) => {
                        const np = parseFloat(e.target.value) || 0;
                        setTier(r.i, { net_price: np, price: np + r.facFee + r.tktFee });
                      }}
                    />
                  </label>
                  <div className="ofs-derived">
                    <span>Sub {fmtUSD(r.price)}</span>
                    <span>Tax {fmtUSD(r.taxEach)}</span>
                    <span>Card {fmtUSD(r.ccEach)}</span>
                    <span>All-in {fmtUSD(r.allIn)}</span>
                    {scalingRows.length > 1 && (
                      <button type="button" className="ofs-remove" onClick={() => { setOpenTier(null); updateField("ticket_scaling", scalingRows.filter((x) => x.i !== r.i).map((x) => x.raw)); }}>
                        Remove tier
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="ofs-row ofs-row--total">
            <div>Gross potential</div>
            <div className="ofs-num">{scalingTotals.sellable.toLocaleString()}</div>
            <div />
            <div />
            <div className="ofs-num">{fmtUSD(scalingTotals.gross, { cents: false })}</div>
            <div className="ofs-num">{fmtUSD(scalingTotals.net, { cents: false })}</div>
            <div />
          </div>
        </div>

        <div className="ofs-foot">
          <Button
            onClick={() => updateField("ticket_scaling", [...scalingRows.map((x) => x.raw), { name: "General Admission", seats: 0, comps: 0, kills: 0, sellable_cap: 0, price: globalFees.fac + globalFees.tkt, net_price: 0, facility_fee: globalFees.fac, ticketing_fee: globalFees.tkt }])}
          >
            + Add tier
          </Button>
          <label className="ofs-fee">
            Facility fee $
            <input type="number" step="0.01" value={globalFees.fac} onChange={(e) => applyFeesToAll(parseFloat(e.target.value) || 0, globalFees.tkt)} />
          </label>
          <label className="ofs-fee">
            Ticketing fee $
            <input type="number" step="0.01" value={globalFees.tkt} onChange={(e) => applyFeesToAll(globalFees.fac, parseFloat(e.target.value) || 0)} />
          </label>
          <span className="filter-spacer" />
          <span className="ofb-rail-sub">Fees apply to every tier · comps and kills come out of the room before sellable</span>
        </div>
      </Card>

      {/* ════════════════════════════════════════════
          CONTRACT SECTION
      ════════════════════════════════════════════ */}
      {/* Not in the mockup — the contract workflow lives here, collapsed. */}
      <details className="ofb-terms">
        <summary>
          <span className="ui-eyebrow">Contract</span>
          <span className="ofb-terms-sub">
            {contract ? `${contract.status} · v${contract.version}` : "none on file — generate or upload"}
          </span>
        </summary>
        <div className="ofb-terms-body">

      {!contract ? (
        /* ── No contract yet ── */
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          <button
            className="admin-form-submit"
            style={{ padding: "10px 20px" }}
            disabled={contractLoading}
            onClick={async () => {
              if (!offer) return;
              setContractLoading(true);
              setError("");
              try {
                // Build a fallback venue from offer fields if no venue object
                const contractVenue: Venue = venue || {
                  id: offer.venue_id || "",
                  name: String(form.venue || "Venue"),
                  slug: "",
                  logo_url: null,
                  nickname: null,
                  capacity: null,
                  address_street: String(form.venue_address || "").split(",")[0]?.trim() || null,
                  address_city: String(form.venue_address || "").split(",")[1]?.trim() || null,
                  address_state: String(form.venue_address || "").split(",")[2]?.trim() || null,
                  address_zip: String(form.venue_address || "").split(",")[3]?.trim() || null,
                  buyer_name: null,
                  contract_signatory: null,
                  buyer_phone: String(form.venue_phone || "") || null,
                  buyer_email: null,
                  promoter_address: null,
                  ticketing_fee: null,
                  facility_fee: null,
                  tax_rate: null,
                  venue_rebate: null,
                  primary_color: "#ffffff",
                  secondary_color: "#111827",
                  created_at: new Date().toISOString(),
                };
                // Resolve venue_id: offer's venue_id, cookie, or fallback venue's id
                const contractVenueId = offer.venue_id || getCookie("venue-id") || contractVenue.id;
                if (!contractVenueId) {
                  throw new Error("No venue is associated with this offer. Please assign a venue first.");
                }
                // Create contract record
                const res = await fetch("/api/contracts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    offer_id: offer.id,
                    venue_id: contractVenueId,
                    source: "generated",
                    guarantee: offer.guarantee,
                    deal_type: offer.deal_type,
                    backend_percentage: offer.backend_percentage,
                    deposit_amount: offer.deposit_amount,
                    status: "draft",
                  }),
                });
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}));
                  throw new Error(errData.error || "Failed to create contract");
                }
                const created: Contract = await res.json();
                setContract(created);

                // Generate PDF
                await exportContractPDF(created, offer, contractVenue);
                setSuccess("Contract generated & PDF downloaded.");
              } catch (err) {
                console.error("Contract generation error:", err);
                setError(err instanceof Error ? err.message : "Failed to generate contract.");
              } finally {
                setContractLoading(false);
              }
            }}
          >
            {contractLoading ? "Generating…" : "Generate Contract"}
          </button>

          <button
            className="admin-header-btn"
            style={{ padding: "10px 20px" }}
            disabled={contractLoading}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file || !offer) return;
                setContractLoading(true);
                setError("");
                try {
                  // Upload file
                  const formData = new FormData();
                  formData.append("file", file);
                  const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
                  if (!uploadRes.ok) throw new Error("Upload failed");
                  const { url } = await uploadRes.json();

                  // Create contract record
                  const res = await fetch("/api/contracts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      offer_id: offer.id,
                      venue_id: offer.venue_id || getCookie("venue-id"),
                      source: "uploaded",
                      file_url: url,
                      file_name: file.name,
                      guarantee: offer.guarantee,
                      deal_type: offer.deal_type,
                      backend_percentage: offer.backend_percentage,
                      deposit_amount: offer.deposit_amount,
                      status: "draft",
                    }),
                  });
                  if (!res.ok) throw new Error("Failed to create contract");
                  const created: Contract = await res.json();
                  setContract(created);
                  setSuccess("Contract uploaded successfully.");
                } catch {
                  setError("Failed to upload contract.");
                } finally {
                  setContractLoading(false);
                }
              };
              input.click();
            }}
          >
            Upload Contract
          </button>
        </div>
      ) : (
        /* ── Contract exists ── */
        <div style={{ marginTop: 8 }}>
          {/* Status badge */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
            <span
              style={{
                background:
                  contract.status === "signed" ? "rgba(100,200,100,0.15)" :
                  contract.status === "sent" ? "rgba(100,180,255,0.12)" :
                  contract.status === "void" ? "rgba(255,100,100,0.12)" :
                  "rgba(255,200,50,0.12)",
                color:
                  contract.status === "signed" ? "var(--lg-good)" :
                  contract.status === "sent" ? "#6ab4ff" :
                  contract.status === "void" ? "var(--lg-bad)" :
                  "#e8c94a",
                padding: "4px 14px",
                borderRadius: 4,
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
              }}
            >
              {contract.status}
            </span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
              Source: {contract.source} · v{contract.version}
            </span>
            {contract.signed_at && (
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
                Signed: {new Date(contract.signed_at).toLocaleDateString()}
              </span>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            {/* Download / Generate PDF */}
            <button
              className="admin-header-btn"
              style={{ padding: "8px 16px" }}
              disabled={contractLoading}
              onClick={async () => {
                if (contract.source === "uploaded" && contract.file_url) {
                  window.open(contract.file_url, "_blank");
                } else if (offer) {
                  setContractLoading(true);
                  try {
                    // Use venue or build fallback from offer fields
                    const dlVenue: Venue = venue || {
                      id: offer.venue_id || "", name: String(form.venue || "Venue"), slug: "",
                      logo_url: null, nickname: null, capacity: null,
                      address_street: String(form.venue_address || "").split(",")[0]?.trim() || null,
                      address_city: String(form.venue_address || "").split(",")[1]?.trim() || null,
                      address_state: String(form.venue_address || "").split(",")[2]?.trim() || null,
                      address_zip: String(form.venue_address || "").split(",")[3]?.trim() || null,
                      buyer_name: null, contract_signatory: null, buyer_phone: String(form.venue_phone || "") || null,
                      buyer_email: null, promoter_address: null,
                      ticketing_fee: null, facility_fee: null, tax_rate: null, venue_rebate: null,
                      primary_color: "#ffffff", secondary_color: "#111827",
                      created_at: new Date().toISOString(),
                    };
                    await exportContractPDF(contract, offer, dlVenue);
                  } catch {
                    setError("Failed to generate PDF.");
                  } finally {
                    setContractLoading(false);
                  }
                }
              }}
            >
              {contract.source === "uploaded" ? "Download Contract" : "Download Contract PDF"}
            </button>

            {/* Mark as Sent */}
            {contract.status === "draft" && (
              <button
                className="admin-header-btn"
                style={{
                  padding: "8px 16px",
                  background: "rgba(100,180,255,0.1)",
                  borderColor: "rgba(100,180,255,0.3)",
                  color: "#6ab4ff",
                }}
                disabled={contractLoading}
                onClick={async () => {
                  setContractLoading(true);
                  try {
                    const res = await fetch(`/api/contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "sent" }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    const updated = await res.json();
                    setContract(updated);
                    setSuccess("Contract marked as sent.");
                  } catch {
                    setError("Failed to update contract.");
                  } finally {
                    setContractLoading(false);
                  }
                }}
              >
                Mark as Sent
              </button>
            )}

            {/* Mark as Signed */}
            {(contract.status === "draft" || contract.status === "sent") && (
              <button
                className="admin-form-submit"
                style={{
                  padding: "8px 16px",
                  background: "rgba(100,200,100,0.15)",
                  borderColor: "rgba(100,200,100,0.4)",
                  color: "var(--lg-good)",
                }}
                disabled={contractLoading}
                onClick={async () => {
                  if (!signedByArtist && !signedByBuyer) {
                    setError("Enter at least one signer name before marking as signed.");
                    return;
                  }
                  setContractLoading(true);
                  try {
                    const res = await fetch(`/api/contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        status: "signed",
                        signed_at: new Date().toISOString(),
                        signed_by_artist: signedByArtist || null,
                        signed_by_buyer: signedByBuyer || null,
                      }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    const updated = await res.json();
                    setContract(updated);
                    setSuccess("Contract marked as signed.");
                  } catch {
                    setError("Failed to update contract.");
                  } finally {
                    setContractLoading(false);
                  }
                }}
              >
                ✓ Mark as Signed
              </button>
            )}

            {/* Upload countersigned copy */}
            <button
              className="admin-header-btn"
              style={{ padding: "8px 16px" }}
              disabled={contractLoading}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
                input.onchange = async () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setContractLoading(true);
                  try {
                    const formData = new FormData();
                    formData.append("file", file);
                    const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
                    if (!uploadRes.ok) throw new Error("Upload failed");
                    const { url } = await uploadRes.json();

                    const res = await fetch(`/api/contracts/${contract.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        file_url: url,
                        file_name: file.name,
                        version: (contract.version || 1) + 1,
                      }),
                    });
                    if (!res.ok) throw new Error("Failed");
                    const updated = await res.json();
                    setContract(updated);
                    setSuccess("Countersigned copy uploaded.");
                  } catch {
                    setError("Failed to upload countersigned copy.");
                  } finally {
                    setContractLoading(false);
                  }
                };
                input.click();
              }}
            >
              Upload Countersigned Copy
            </button>
          </div>

          {/* Signed-by fields (visible when not yet signed) */}
          {contract.status !== "signed" && contract.status !== "void" && (
            <div className="admin-form-grid" style={{ maxWidth: 500 }}>
              <label className="admin-form-label">
                Signed by Artist
                <input
                  type="text"
                  className="admin-form-input"
                  value={signedByArtist}
                  onChange={(e) => setSignedByArtist(e.target.value)}
                  placeholder="Artist or agent name"
                />
              </label>
              <label className="admin-form-label">
                Signed by Buyer
                <input
                  type="text"
                  className="admin-form-input"
                  value={signedByBuyer}
                  onChange={(e) => setSignedByBuyer(e.target.value)}
                  placeholder="Buyer / promoter name"
                />
              </label>
            </div>
          )}

          {/* Show signer info if already signed */}
          {contract.status === "signed" && (
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginTop: 8 }}>
              {contract.signed_by_artist && <div>Artist: <strong style={{ color: "#fff" }}>{contract.signed_by_artist}</strong></div>}
              {contract.signed_by_buyer && <div>Buyer: <strong style={{ color: "#fff" }}>{contract.signed_by_buyer}</strong></div>}
            </div>
          )}
        </div>
      )}
        </div>
      </details>
      </>
      )}

      {activeTab === "pnl" && (() => {
        // ── P&L Calculations ──
        const scaling = Array.isArray(form.ticket_scaling) ? form.ticket_scaling as Array<Record<string, number>> : [];
        const fixedExp = Array.isArray(form.fixed_expenses) ? form.fixed_expenses as Array<{name: string; amount: number}> : [];
        const varExp = Array.isArray(form.variable_expenses) ? form.variable_expenses as Array<{name: string; rate: number; amount: number}> : [];

        const totalFixed = fixedExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const totalVariable = varExp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const totalExpenses = totalFixed + totalVariable;

        const grossPotential = scaling.reduce((s, r) => s + (Number(r.sellable_cap) || 0) * (Number(r.price) || 0), 0);
        const totalFees = scaling.reduce((s, r) => s + ((Number(r.ticketing_fee) || 0) + (Number(r.facility_fee) || 0)) * (Number(r.sellable_cap) || 0), 0);
        const adjGross = grossPotential - totalFees;
        const rawTaxRate = Number(form.tax_rate) || 0;
        // Handle tax_rate stored as decimal (0.095) or percentage (9.5)
        const taxRate = rawTaxRate > 0 && rawTaxRate < 1 ? rawTaxRate * 100 : rawTaxRate;
        const taxRateDecimal = taxRate / 100;
        const taxMethod = (form.tax_method as string) || "divisor";
        let netPotential: number;
        let taxAmount: number;
        if (taxMethod === "divisor") {
          // Tax is baked into the face price — back it out of adjusted gross.
          netPotential = Math.round((adjGross / (1 + taxRateDecimal)) * 100) / 100;
          taxAmount = Math.round((adjGross - netPotential) * 100) / 100;
        } else {
          // Multiplier: tax is charged ON TOP of face, so it was never inside
          // adjusted gross and must not be subtracted from it. It's collected
          // from the customer and remitted. This tab used to subtract it,
          // making the P&L tab disagree with the Details tab on the same offer.
          taxAmount = Math.round((adjGross * taxRateDecimal) * 100) / 100;
          netPotential = adjGross;
        }

        const guarantee = Number(form.guarantee) || 0;
        const backendPct = Number(form.backend_percentage) || 0;
        const dealType = String(form.deal_type || "FLAT");
        const netAfterExpenses = netPotential - totalExpenses;

        // Backend is earned on the overage above the guarantee and added to it.
        // (pool × backend%) − guarantee, matching the Details tab.
        const overage = netAfterExpenses * (backendPct / 100) - guarantee;
        const backendAmount = dealType === "FLAT" || overage <= 0 ? 0 : overage;
        const artistTotal = guarantee + backendAmount;

        // For FLAT / PLUS / BONUS deals, the guarantee is entered as the "Talent" line in
        // fixed_expenses. It's already baked into totalExpenses — do NOT subtract it again
        // in breakeven or P&L, or it will be double-counted. Only VS deals treat the guarantee
        // as a separate outflow from show expenses.
        const guaranteeInExpenses = dealType === "FLAT" || dealType === "PLUS" || dealType === "BONUS";

        // Breakeven
        const tierCount = scaling.length || 1;
        const avgTicketPrice = tierCount > 0
          ? scaling.reduce((s, r) => s + (Number(r.net_price) || 0), 0) / tierCount
          : 0;
        // For FLAT: no extra artist cost beyond expenses. For PLUS/BONUS: add just the backend
        // (guarantee already in expenses). For VS: add the full artist total.
        const artistCostForBreakeven = guaranteeInExpenses ? backendAmount : artistTotal;
        const breakevenOffer = avgTicketPrice > 0
          ? Math.round(((totalExpenses + artistCostForBreakeven) / avgTicketPrice) * 100) / 100
          : 0;

        // Ancillary totals
        const ancillaryTotal = ancillaryItems.reduce((s, item) => s + (item.income - item.expenses), 0);

        // Final P&L — avoid double-counting the guarantee when it's already in expenses
        const netTicketRevenue = netPotential;
        const totalAllExpenses = guaranteeInExpenses
          ? (totalExpenses + backendAmount)
          : (totalExpenses + guarantee + backendAmount);
        const finalPnl = (netTicketRevenue + ancillaryTotal) - totalAllExpenses;

        // P&L at sellout (without ancillary)
        const pnlOffer = netPotential - totalAllExpenses;

        const fmtDollar = (v: number) => {
          const abs = Math.abs(v);
          const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return v < 0 ? `$(${formatted})` : `$${formatted}`;
        };

        const fixedRows = Array.isArray(form.fixed_expenses) ? (form.fixed_expenses as Array<{ name: string; amount: number }>) : [];
        const varRows = Array.isArray(form.variable_expenses) ? (form.variable_expenses as Array<{ name: string; rate: number; amount: number }>) : [];

        return (
        <div className="ofb-stack">

          {/* ── Show expenses — where the mockup puts them ── */}
          <Card title="Show expenses — offer estimate" sub="Fixed amounts and rates on gross; the rate lines recompute as scaling changes">
            <div className="ofe">
              {fixedRows.map((e, i) => (
                <div key={`f${i}`} className="ofe-row">
                  <input
                    className="ofe-name"
                    value={e.name}
                    placeholder="Expense"
                    onChange={(ev) => {
                      const f = [...fixedRows];
                      f[i] = { ...f[i], name: ev.target.value };
                      updateField("fixed_expenses", f);
                    }}
                  />
                  <span className="ofe-kind">Fixed</span>
                  <input
                    className="ofe-amt"
                    type="number"
                    step="0.01"
                    value={e.amount || ""}
                    onChange={(ev) => {
                      const f = [...fixedRows];
                      f[i] = { ...f[i], amount: parseFloat(ev.target.value) || 0 };
                      updateField("fixed_expenses", f);
                    }}
                  />
                </div>
              ))}
              {varRows.map((e, i) => {
                const liveAmount = Math.round((Number(e.rate) || 0) * live.grossPotential * 100) / 100;
                return (
                  <div key={`v${i}`} className="ofe-row">
                    <span className="ofe-name ofe-name--static">{e.name}</span>
                    <span className="ofe-kind ofe-kind--var">Variable</span>
                    <span className="ofe-var">
                      <input
                        type="number"
                        step="0.0001"
                        value={e.rate}
                        onChange={(ev) => {
                          const v = [...varRows];
                          const rate = parseFloat(ev.target.value) || 0;
                          v[i] = { ...v[i], rate, amount: Math.round(live.grossPotential * rate * 100) / 100 };
                          updateField("variable_expenses", v);
                        }}
                      />
                      <b>{fmtUSD(liveAmount)}</b>
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="ofe-foot">
              <Button onClick={() => updateField("fixed_expenses", [...fixedRows, { name: "", amount: 0 }])}>+ New expense</Button>
              <span className="filter-spacer" />
              <span className="ofe-total">
                <span>Total show costs</span>
                <b>{fmtUSD(live.totalExpenses)}</b>
              </span>
            </div>
          </Card>

          <details className="ofb-terms">
            <summary>
              <span className="ui-eyebrow">More</span>
              <span className="ofb-terms-sub">breakeven · potential at sellout · ancillary revenue · profit &amp; loss</span>
            </summary>
            <div className="ofb-terms-body ofb-stack">

          <div className="ofb-pair">
            {/* ── Section A: Breakeven Point ── */}
            <div className="card ofb-card">
              <div className="card-head"><h3>Breakeven point</h3></div>
              <div className="card-sub">Based on the offer</div>
              <div className="offer-potential-grid">
                <div className="offer-potential-col">
                  <div className="offer-potential-row"><span>Total Expenses:</span><strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Artist Pot (at Walkout):</span><strong>${artistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Avg Ticket Price (Net):</span><strong>${avgTicketPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>Breakeven:</span>
                    <strong style={{ color: "#ffffff", fontSize: 16 }}>{breakevenOffer.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tickets</strong>
                  </div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>Tickets to Pay Band:</span>
                    <strong style={{ color: "#ffffff", fontSize: 16 }}>{avgTicketPrice > 0 ? (guarantee / avgTicketPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} tickets</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section B: Potential at Sellout ── */}
            <div className="card ofb-card">
              <div className="card-head"><h3>Potential at sellout</h3></div>
              <div className="card-sub">Based on the offer</div>
              <div className="offer-potential-grid">
                <div className="offer-potential-col">
                  <div className="offer-potential-row"><span>Gross Potential:</span><strong>${grossPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Adj. Gross Potential:</span><strong>${adjGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Tax ({taxRate}% — {taxMethod}):</span><strong>${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Net Potential:</span><strong>${netPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Total Expenses:</span><strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>P&amp;L (Offer):</span>
                    <strong style={{ color: pnlOffer >= 0 ? "var(--lg-good)" : "var(--lg-bad)" }}>{fmtDollar(pnlOffer)}</strong>
                  </div>
                </div>
                <div className="offer-potential-col">
                  <h3 className="offer-expenses-heading">Artist Potential at Sellout</h3>
                  <div className="offer-potential-row"><span>Guarantee:</span><strong>${guarantee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  {dealType !== "FLAT" && (
                    <div className="offer-potential-row"><span>Backend ({dealType}):</span><strong>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  )}
                  <div className="offer-potential-row highlight"><span>Artist Total:</span><strong>${artistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  {dealType !== "FLAT" && (
                    <div className="offer-potential-row"><span>Artist Lift:</span><strong style={{ color: "#ffffff" }}>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section C: Ancillary Revenue ── */}
          <div className="card ofb-card">
          <div className="card-head"><h3>Ancillary revenue</h3></div>
          <div className="ofb-table-scroll">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Category</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Income</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Expenses</th>
                  <th style={{ textAlign: "right", padding: "8px 12px", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {ancillaryItems.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <td style={{ padding: "6px 12px", color: "rgba(255,255,255,0.8)" }}>{item.name}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      <input
                        type="number"
                        className="admin-form-input"
                        style={{ width: 100, textAlign: "right", padding: "4px 8px", fontSize: 16 }}
                        value={item.income || ""}
                        onChange={(e) => {
                          const updated = [...ancillaryItems];
                          updated[idx] = { ...updated[idx], income: parseFloat(e.target.value) || 0 };
                          setAncillaryItems(updated);
                        }}
                        step="0.01"
                        placeholder="0.00"
                      />
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right" }}>
                      <input
                        type="number"
                        className="admin-form-input"
                        style={{ width: 100, textAlign: "right", padding: "4px 8px", fontSize: 16 }}
                        value={item.expenses || ""}
                        onChange={(e) => {
                          const updated = [...ancillaryItems];
                          updated[idx] = { ...updated[idx], expenses: parseFloat(e.target.value) || 0 };
                          setAncillaryItems(updated);
                        }}
                        step="0.01"
                        placeholder="0.00"
                      />
                    </td>
                    <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: (item.income - item.expenses) >= 0 ? "var(--lg-good)" : "var(--lg-bad)" }}>
                      {fmtDollar(item.income - item.expenses)}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.15)" }}>
                  <td style={{ padding: "8px 12px", fontWeight: 700, color: "#fff" }}>Total</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#fff" }}>
                    ${ancillaryItems.reduce((s, i) => s + i.income, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#fff" }}>
                    ${ancillaryItems.reduce((s, i) => s + i.expenses, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: ancillaryTotal >= 0 ? "var(--lg-good)" : "var(--lg-bad)" }}>
                    {fmtDollar(ancillaryTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          </div>

          {/* ── Section D: Profit & Loss Summary ── */}
          <div className="card ofb-card">
          <div className="card-head"><h3>Profit &amp; loss</h3></div>
          <div className="card-sub">Based on actuals where entered, the offer otherwise</div>
          <div className="offer-potential-grid">
            <div className="offer-potential-col">
              <div className="offer-potential-row"><span>Net Ticket Revenue:</span><strong>${netTicketRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div className="offer-potential-row"><span>Ancillary Revenue:</span><strong>{fmtDollar(ancillaryTotal)}</strong></div>
              <div style={{ height: 12 }} />
              <div className="offer-potential-row">
                <span>Artist Guarantee{guaranteeInExpenses ? " (in Show Expenses)" : ""}:</span>
                <strong style={{ opacity: guaranteeInExpenses ? 0.55 : 1 }}>
                  ${guarantee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              {dealType !== "FLAT" && backendAmount > 0 && (
                <div className="offer-potential-row"><span>Backend ({dealType}):</span><strong>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              )}
              <div className="offer-potential-row"><span>Show Expenses{guaranteeInExpenses ? " (incl. Talent)" : ""}:</span><strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div className="offer-potential-row">
                <span style={{ fontWeight: 700 }}>Total Expenses:</span>
                <strong style={{ color: "var(--lg-bad)" }}>${totalAllExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ height: 12 }} />
              <div className="offer-potential-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>P&amp;L:</span>
                <strong style={{ color: finalPnl >= 0 ? "var(--lg-good)" : "var(--lg-bad)", fontSize: 16 }}>{fmtDollar(finalPnl)}</strong>
              </div>
            </div>
          </div>
          </div>

            </div>
          </details>
        </div>
        );
      })()}

      {activeTab === "deal_lab" && (() => {
        const scalingArr = Array.isArray(form.ticket_scaling)
          ? (form.ticket_scaling as Array<Record<string, number>>)
          : [];
        const fixedArr = Array.isArray(form.fixed_expenses)
          ? (form.fixed_expenses as Array<{ name: string; amount: number }>)
          : [];
        const varArr = Array.isArray(form.variable_expenses)
          ? (form.variable_expenses as Array<{ name: string; rate: number }>)
          : [];
        const totalCapacity = scalingArr.reduce(
          (s, r) => s + (Number(r.sellable_cap) || 0),
          0
        );
        const rawBackend = form.backend_percentage;
        const backendPct =
          rawBackend === null || rawBackend === undefined || rawBackend === ""
            ? null
            : Number(rawBackend);
        return (
          <div className="ofb-stack">
            {/* Keyed on the offer's own figures: edit the offer and the lab
                re-baselines by remounting, rather than syncing in an effect. */}
            <DealLevers
              key={`${walkoutBasis.guarantee}-${walkoutBasis.backendPct}-${walkoutBasis.totalFixed}-${scalingRows[0]?.netPrice ?? 0}`}
              basis={walkoutBasis}
              faceTier={scalingRows[0] ?? null}
              onCopy={(patch) => {
                if (patch.guarantee !== undefined) updateField("guarantee", patch.guarantee);
                if (patch.backendPct !== undefined) updateField("backend_percentage", String(patch.backendPct));
                if (patch.facePrice !== undefined && scalingRows[0]) {
                  setTier(scalingRows[0].i, {
                    net_price: patch.facePrice,
                    price: patch.facePrice + scalingRows[0].facFee + scalingRows[0].tktFee,
                  });
                }
              }}
            />

            <details className="ofb-terms">
              <summary>
                <span className="ui-eyebrow">Full deal lab</span>
                <span className="ofb-terms-sub">five structures side by side — flat, vs, plus, door split, tiered bonus</span>
              </summary>
              <div className="ofb-terms-body">
          <DealLabPanel
            inputs={{
              gross_potential_full: live.grossPotential,
              adj_gross_full: live.adjGross,
              net_potential_full: live.netPotential,
              total_capacity: totalCapacity,
              fixed_expenses: fixedArr.map((e) => ({
                name: String(e.name ?? ""),
                amount: Number(e.amount) || 0,
              })),
              variable_expense_rates: varArr.map((e) => ({
                name: String(e.name ?? ""),
                rate: Number(e.rate) || 0,
              })),
              offer_guarantee: Number(form.guarantee) || 0,
              offer_deal_type:
                (form.deal_type as "FLAT" | "VS" | "PLUS" | "BONUS") ?? null,
              offer_backend_percentage: backendPct,
            }}
          />
              </div>
            </details>
          </div>
        );
      })()}

      </div>
      <OfferRail
        basis={walkoutBasis}
        showWalkouts={activeTab !== "deal_lab"}
        venueId={venue?.id || offer.venue_id || getCookie("venue-id") || null}
        artistName={String(form.artist_name || "")}
        agentEmail={String(form.agent_email || "")}
        saving={saving}
        exporting={exporting}
        onSave={handleSave}
        onExport={exportPDF}
      />
      </div>
    </div>
  );
}
