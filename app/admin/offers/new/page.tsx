"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import type { ShowLineupItem, TicketScalingRow, ExpenseItem, VariableExpenseItem } from "@/lib/types/offer";
import { formatPhoneNumber } from "@/lib/formatPhone";
import DealLabPanel from "@/app/components/deal-lab/DealLabPanel";

type Agent = { id: string; agency: string; agent_name: string; agent_phone: string | null; agent_email: string | null };
type EventVenue = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null };

const DEFAULT_FIXED: ExpenseItem[] = [
  { name: "Rent", amount: 500 },
  { name: "Production", amount: 1000 },
  { name: "Catering", amount: 0 },
  { name: "Hospitality", amount: 250 },
  { name: "Support", amount: 250 },
  { name: "Talent", amount: 0 },
  { name: "Marketing", amount: 1000 },
  { name: "Labor", amount: 0 },
  { name: "Insurance", amount: 400 },
  { name: "Security", amount: 0 },
  { name: "Ushers", amount: 0 },
  { name: "Police", amount: 0 },
  { name: "Cleaning", amount: 0 },
  { name: "Medical", amount: 0 },
];

const DEFAULT_VARIABLE: VariableExpenseItem[] = [
  { name: "ASCAP", rate: 0.008, amount: 0 },
  { name: "BMI", rate: 0.008, amount: 0 },
  { name: "SESAC", rate: 0.0003, amount: 0 },
  { name: "GMR", rate: 0.0015, amount: 0 },
];

function emptyScalingRow(): TicketScalingRow {
  return { name: "General Admission", seats: 0, comps: 0, kills: 0, sellable_cap: 0, price: 0, net_price: 0, facility_fee: 0, ticketing_fee: 0 };
}

function emptyLineup(): ShowLineupItem {
  return { time: "", artist: "", set_length: "" };
}

export default function AdminCreateOfferPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [isOwnerRole, setIsOwnerRole] = useState(false);

  // Linked event — populated when arriving from event creation flow
  const [linkedEventId, setLinkedEventId] = useState<string | null>(null);

  // Resolved venue_id — from cookie or admin_users table
  const [resolvedVenueId, setResolvedVenueId] = useState<string | null>(null);

  // Resolve venue_id from cookie or admin_users table (ensures offers are tagged correctly)
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

  // Venue info
  const [venueName, setVenueName] = useState("");
  const [venueAddressField, setVenueAddressField] = useState("");
  const [venueContact, setVenueContact] = useState("");
  const [venuePhone, setVenuePhone] = useState("");
  const [selectedEventVenueId, setSelectedEventVenueId] = useState<string | null>(null);

  // Purchaser info (auto-filled from settings)
  const [buyerName, setBuyerName] = useState("");
  const [contractSignatory, setContractSignatory] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [promoterAddress, setPromoterAddress] = useState("");
  const [venueAddress, setVenueAddress] = useState("");

  // Prefill from URL params when arriving from event creation flow
  // e.g. /admin/offers/new?event_id=xxx&event_date=2026-06-15&deal_type=VS
  useEffect(() => {
    const eventId = searchParams.get("event_id");
    const eventDate = searchParams.get("event_date");
    const dealType = searchParams.get("deal_type");
    if (eventId) setLinkedEventId(eventId);
    if (eventDate) setEventDate(eventDate);
    if (dealType) setDealType(dealType);
  }, [searchParams]);

  // Fetch agents + buyer info once resolvedVenueId is available
  useEffect(() => {
    const role = getCookie("user-role") || "";
    setIsOwnerRole(role === "owner");
    const params = resolvedVenueId ? `?venue_id=${resolvedVenueId}` : "";

    // Fetch agents
    fetch(`/api/agents${params}`)
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAgents(data); })
      .catch(() => {});

    // Fetch event venues (non-platform venues)
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
      getSupabaseBrowser()
        .from("event_venues")
        .select("id, name, full_address, contact_name, phone")
        .order("name")
        .then(({ data }: { data: EventVenue[] | null }) => {
          if (data) setEventVenues(data);
        });
    });

    // Fetch owner's global defaults (radius clause, ticketing fee)
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((users: Array<Record<string, unknown>>) => {
        if (!Array.isArray(users)) return;
        const owner = users.find((u) => u.role === "owner");
        if (owner) {
          if (owner.default_radius_distance) setRadiusDistance(String(owner.default_radius_distance));
          if (owner.default_radius_days_prior) setRadiusDaysPrior(String(owner.default_radius_days_prior));
          if (owner.default_radius_days_after) setRadiusDaysAfter(String(owner.default_radius_days_after));
          if (owner.default_ticketing_fee) setTicketingFee(String(owner.default_ticketing_fee));
        }
      })
      .catch(() => {});

    // Auto-fill buyer info from venue (for venue_admin) or admin_users (for owner)
    if (resolvedVenueId) {
      fetch("/api/venues")
        .then((r) => r.json())
        .then((venues: Array<Record<string, string | number | null>>) => {
          if (!Array.isArray(venues)) return;
          const v = venues.find((x) => x.id === resolvedVenueId);
          if (v) {
            setBuyerName(String(v.buyer_name || ""));
            setContractSignatory(String(v.contract_signatory || ""));
            setBuyerPhone(String(v.buyer_phone || ""));
            setBuyerEmail(String(v.buyer_email || ""));
            setPromoterAddress(String(v.promoter_address || ""));
            const addr = [v.address_street, v.address_city, v.address_state, v.address_zip].filter(Boolean).join(", ");
            setVenueAddress(addr);
            // Auto-fill venue info fields
            if (v.name) setVenueName(String(v.name));
            if (addr) setVenueAddressField(addr);
            if (v.buyer_name) setVenueContact(String(v.buyer_name));
            if (v.buyer_phone) setVenuePhone(String(v.buyer_phone));
            // Override radius defaults with venue-specific values (if set)
            if (v.default_radius_distance) setRadiusDistance(String(v.default_radius_distance));
            if (v.default_radius_days_prior) setRadiusDaysPrior(String(v.default_radius_days_prior));
            if (v.default_radius_days_after) setRadiusDaysAfter(String(v.default_radius_days_after));
            // Auto-fill fees from venue settings
            if (v.facility_fee != null) setFacilityFee(String(v.facility_fee));
            if (v.ticketing_fee != null) setTicketingFee(String(v.ticketing_fee));
            if (v.tax_rate != null) {
              const rate = Number(v.tax_rate);
              setTaxRate(String(rate > 1 ? rate : rate * 100));
            }
          }
        })
        .catch(() => {});
    } else if (role === "owner") {
      // Fetch owner's buyer info from admin_users
      fetch("/api/admin/users")
        .then((r) => r.json())
        .then((users: Array<Record<string, string | null>>) => {
          if (!Array.isArray(users)) return;
          // Find current user by matching the cookie email or just first owner
          const me = users.find((u) => u.role === "owner");
          if (me) {
            setBuyerName(me.buyer_name || "");
            setContractSignatory(me.contract_signatory || "");
            setBuyerPhone(me.buyer_phone || "");
            setBuyerEmail(me.buyer_email || "");
            setPromoterAddress(me.promoter_address || "");
          }
        })
        .catch(() => {});
    }
  }, [resolvedVenueId]);

  const selectEventVenue = (venueId: string) => {
    const v = eventVenues.find((x) => x.id === venueId);
    if (v) {
      setSelectedEventVenueId(v.id);
      setVenueName(v.name);
      setVenueAddressField(v.full_address || "");
      setVenueContact(v.contact_name || "");
      setVenuePhone(v.phone || "");
    }
  };

  const selectAgent = (agentId: string) => {
    const a = agents.find((x) => x.id === agentId);
    if (a) {
      setAgency(a.agency);
      setAgentName(a.agent_name);
      setAgentPhone(a.agent_phone || "");
      setAgentEmail(a.agent_email || "");
    }
  };

  // ── Section 1: Agency & Artist ──
  const [agency, setAgency] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [agentEmail, setAgentEmail] = useState("");
  const [artistName, setArtistName] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [dateMode, setDateMode] = useState<"ma" | "date">("date");
  const [dayOfEvent, setDayOfEvent] = useState("");
  const [numShows, setNumShows] = useState("1");
  const [showLength, setShowLength] = useState("");
  const [showTime, setShowTime] = useState("");
  const [billing, setBilling] = useState("100% Headline");

  // ── Section 2: Show Lineup ──
  const [lineup, setLineup] = useState<ShowLineupItem[]>([emptyLineup()]);

  // ── Section 3: Deal Terms ──
  const [guarantee, setGuarantee] = useState("");
  const [dealType, setDealType] = useState("FLAT");
  const [backendPct, setBackendPct] = useState("");
  const [otherTerms, setOtherTerms] = useState("After taxes and approved expenses, Promoter to cover up to 3 hotel rooms (pending availability)");
  const [radiusDistance, setRadiusDistance] = useState("");
  const [radiusDaysPrior, setRadiusDaysPrior] = useState("");
  const [radiusDaysAfter, setRadiusDaysAfter] = useState("");
  const [productionBy, setProductionBy] = useState("In House");
  const [depositPct, setDepositPct] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDue, setDepositDue] = useState("");
  const [balanceDue, setBalanceDue] = useState("Day of Show");
  const [merchSplit, setMerchSplit] = useState("80/20 Soft, 90/10 Hard | Sells: Artist");
  const [merchSeller, setMerchSeller] = useState("Artist");
  const [comps, setComps] = useState("0");
  const [artistComps, setArtistComps] = useState("0");
  const [marketingComps, setMarketingComps] = useState("0");

  // ── Section 4: Ticket Scaling ──
  const [scaling, setScaling] = useState<TicketScalingRow[]>([emptyScalingRow()]);
  const [facilityFee, setFacilityFee] = useState("0");
  const [ticketingFee, setTicketingFee] = useState("3.00");

  // ── Section 5: Expenses ──
  const [fixedExpenses, setFixedExpenses] = useState<ExpenseItem[]>(DEFAULT_FIXED);
  const [variableExpenses, setVariableExpenses] = useState<VariableExpenseItem[]>(DEFAULT_VARIABLE);

  // ── Section 6: Tax ──
  const [taxRate, setTaxRate] = useState("9.5"); // percentage (e.g., 9.5 = 9.5%)
  const [taxMode, setTaxMode] = useState<"divisor" | "multiplier">("multiplier");

  // ── Section 7: Offer Validity ──
  const [offerValidDays, setOfferValidDays] = useState("14");

  // Tab state
  const [activeTab, setActiveTab] = useState<"details" | "pnl" | "deal_lab">("details");

  // Ancillary revenue state (P&L tab)
  const [ancillaryItems, setAncillaryItems] = useState([
    { name: "Concessions", income: 0, expenses: 0 },
    { name: "Bars", income: 0, expenses: 0 },
    { name: "Catering/F&B", income: 0, expenses: 0 },
    { name: "Merch", income: 0, expenses: 0 },
    { name: "Venue Merch", income: 0, expenses: 0 },
  ]);

  // ── Calculated values ──
  // grossPotential = face + fees (used for variable expense % calc — PRO fees base)
  const grossPotential = scaling.reduce((sum, r) => sum + r.sellable_cap * r.price, 0);
  const totalFees = scaling.reduce((sum, r) => sum + ((r.ticketing_fee || 0) + (r.facility_fee || 0)) * r.sellable_cap, 0);
  // adjGross = face × sellable (traditional basis, drives net/splitpoint)
  const adjGross = grossPotential - totalFees;

  const taxRateDecimal = parseFloat(taxRate || "0") / 100;
  let netPotential: number;
  let taxAmount: number;
  if (taxMode === "divisor") {
    netPotential = Math.round((adjGross / (1 + taxRateDecimal)) * 100) / 100;
    taxAmount = Math.round((adjGross - netPotential) * 100) / 100;
  } else {
    taxAmount = Math.round((adjGross * taxRateDecimal) * 100) / 100;
    netPotential = adjGross; // = face × sellable; taxes collected separately and remitted
  }

  // Display gross: what the box office actually collects from customers (excl. CC fees).
  // displayGross = true all-in × sellable: what customers collectively pay (incl. CC).
  const displayGross = scaling.reduce((sum, r) => {
    const taxPer = taxMode === "divisor"
      ? 0
      : Math.round((r.net_price || 0) * taxRateDecimal * 100) / 100;
    const preCC = (r.price || 0) + taxPer;
    const cc = Math.round(preCC * 0.027 * 100) / 100;
    return sum + r.sellable_cap * (preCC + cc);
  }, 0);
  // totalCC = Stripe's share — customer-funded, goes to Stripe not promoter
  const totalCC = scaling.reduce((sum, r) => {
    const taxPer = taxMode === "divisor" ? 0 : Math.round((r.net_price || 0) * taxRateDecimal * 100) / 100;
    const preCC = (r.price || 0) + taxPer;
    return sum + r.sellable_cap * Math.round(preCC * 0.027 * 100) / 100;
  }, 0);
  const preCCGross = displayGross - totalCC;      // what promoter receives from Stripe
  const displayAdjGross = preCCGross - totalFees; // after ticketing/facility fees removed

  const totalFixed = fixedExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalVariable = variableExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const totalExpenses = totalFixed + totalVariable;

  const guaranteeNum = parseFloat(guarantee || "0");
  const backendNum = parseFloat(backendPct || "0") / 100;

  // FLAT: no splitpoint — promoter gets net - expenses - guarantee
  // VS/PLUS/BONUS: splitpoint = net - expenses, then artist backend calculated from that
  let splitpoint = 0;
  let artistBackend = 0;
  let artistPAS = guaranteeNum;
  let potWalkout = 0;

  if (dealType === "FLAT") {
    // No splitpoint for FLAT deals. Guarantee IS already in expenses as Talent.
    // So promoter walkout = net - expenses (guarantee already counted in expenses)
    potWalkout = netPotential - totalExpenses;
    artistPAS = guaranteeNum;
  } else {
    // VS, PLUS, BONUS — have splitpoints and backends
    splitpoint = netPotential - totalExpenses;
    artistBackend = splitpoint > 0 ? splitpoint * backendNum : 0;

    if (dealType === "VS") {
      artistPAS = Math.max(guaranteeNum, artistBackend);
    } else {
      // PLUS or BONUS — guarantee + backend
      artistPAS = guaranteeNum + artistBackend;
    }
    potWalkout = splitpoint - artistPAS;
  }

  // Recalculate variable expenses when gross changes
  const recalcVariables = useCallback(() => {
    setVariableExpenses((prev) =>
      prev.map((v) => ({ ...v, amount: Math.round(grossPotential * v.rate * 100) / 100 }))
    );
  }, [grossPotential]);

  useEffect(() => { recalcVariables(); }, [recalcVariables]);

  // Auto-calc: user edits net_price → price = net_price + facility_fee + ticketing_fee
  const ff = parseFloat(facilityFee || "0");
  const tf = parseFloat(ticketingFee || "0");

  const updateScaling = (index: number, field: keyof TicketScalingRow, value: number) => {
    setScaling((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const updated = { ...r, [field]: value };
        updated.sellable_cap = updated.seats - updated.comps - updated.kills;
        updated.facility_fee = ff;
        updated.ticketing_fee = tf;
        // Price = net_price + facility_fee + ticketing_fee
        updated.price = updated.net_price + ff + tf;
        return updated;
      })
    );
  };

  // ── Submit ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!artistName.trim()) { setError("Artist name is required."); return; }
    setLoading(true);

    // Auto-save agent for future use
    if (agency && agentName) {
      fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency, agent_name: agentName, agent_phone: agentPhone, agent_email: agentEmail, venue_id: resolvedVenueId || null }),
      }).catch(() => {}); // fire-and-forget
    }

    // Auto-save event venue for future use (if not already in list)
    if (venueName && !eventVenues.some((v) => v.name.toLowerCase() === venueName.toLowerCase())) {
      import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) => {
        getSupabaseBrowser()
          .from("event_venues")
          .insert({
            name: venueName,
            full_address: venueAddressField || null,
            contact_name: venueContact || null,
            phone: venuePhone || null,
          })
          .then(() => {}); // fire-and-forget
      });
    }

    try {
      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artist_name: artistName,
          venue: venueName || null,
          venue_address: venueAddressField || null,
          venue_contact: venueContact || null,
          venue_phone: venuePhone || null,
          venue_id: resolvedVenueId || null,
          event_venue_id: selectedEventVenueId || null,
          event_id: linkedEventId || null,
          event_date: eventDate || null,
          agency, agent_name: agentName, agent_phone: agentPhone, agent_email: agentEmail,
          day_of_event: dayOfEvent, num_shows: parseInt(numShows) || 1,
          show_length: showLength, show_time: showTime, billing,
          show_lineup: lineup.filter((l) => l.artist),
          guarantee: guaranteeNum, deal_type: dealType,
          backend_percentage: backendPct, other_terms: otherTerms,
          radius_distance: radiusDistance,
          radius_days_prior: parseInt(radiusDaysPrior) || null,
          radius_days_after: parseInt(radiusDaysAfter) || null,
          production_by: productionBy,
          deposit_pct: parseFloat(depositPct) || null,
          deposit_amount: parseFloat(depositAmount) || null,
          deposit_due: depositDue, balance_due: balanceDue,
          merch_split: merchSplit, merch_seller: merchSeller,
          comps: parseInt(comps) || 0,
          artist_comps: parseInt(artistComps) || 0,
          marketing_comps: parseInt(marketingComps) || 0,
          ticket_scaling: scaling, fixed_expenses: fixedExpenses, variable_expenses: variableExpenses,
          total_fixed: totalFixed, total_variable: totalVariable, total_expenses: totalExpenses,
          gross_potential: grossPotential, adj_gross: adjGross,
          tax_rate: taxRateDecimal, tax_method: taxMode, net_potential: netPotential,
          splitpoint, artist_backend: artistBackend, pot_walkout: potWalkout,
          offer_valid_days: parseInt(offerValidDays) || 14,
          status: "draft",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create offer");
      }

      const created = await res.json().catch(() => null);
      // If we came from an event creation flow, go directly to the offer detail
      // so the user can finish filling out deal terms
      if (created?.id) {
        router.push(`/admin/offers/${created.id}`);
      } else {
        router.push("/admin/offers");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-form-page" style={{ maxWidth: 1100 }}>
      <h1 className="admin-page-title">New Offer</h1>

      {/* Tab Bar */}
      <div style={{
        display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,0.1)",
        marginBottom: 20, marginTop: 8,
      }}>
        {(["details", "pnl", "deal_lab"] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 600,
              color: activeTab === tab ? "#d0c290" : "rgba(255,255,255,0.4)",
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #d0c290" : "2px solid transparent",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {tab === "details"
              ? "Offer Details"
              : tab === "pnl"
              ? "P&L / Breakeven"
              : "Deal Lab (Simulated)"}
          </button>
        ))}
      </div>

      {activeTab === "details" && (
      <>
      <form className="admin-form offer-form" onSubmit={(e) => e.preventDefault()} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault(); }}>
        {error && <div className="admin-form-error">{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
          {/* ═══ VENUE INFO ═══ */}
          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Venue Info</h2>
            {eventVenues.length > 0 && (
              <label className="admin-form-label" style={{ marginBottom: 12 }}>
                Select Previous Venue
                <select className="admin-form-input" onChange={(e) => selectEventVenue(e.target.value)} defaultValue="">
                  <option value="" disabled>— Choose a venue —</option>
                  {eventVenues.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}{v.full_address ? ` (${v.full_address})` : ""}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="admin-form-grid">
              <label className="admin-form-label">Venue *<input type="text" className="admin-form-input" placeholder="e.g. The Shoals Theatre" value={venueName} onChange={(e) => setVenueName(e.target.value)} required /></label>
              <label className="admin-form-label admin-form-full">Venue Address<input type="text" className="admin-form-input" placeholder="e.g. 123 Main St, Florence, AL 35630" value={venueAddressField} onChange={(e) => setVenueAddressField(e.target.value)} /></label>
              <label className="admin-form-label">Venue Contact <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span><input type="text" className="admin-form-input" placeholder="e.g. John Smith" value={venueContact} onChange={(e) => setVenueContact(e.target.value)} /></label>
              <label className="admin-form-label">Venue Phone <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span><input type="tel" className="admin-form-input" placeholder="e.g. (555)-123-4567" value={venuePhone} onChange={(e) => setVenuePhone(formatPhoneNumber(e.target.value))} /></label>
            </div>
          </div>

          {/* ═══ SECTION 1: Agency & Artist ═══ */}
          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Agency & Artist</h2>
            {agents.length > 0 && (
              <label className="admin-form-label" style={{ marginBottom: 12 }}>
                Select Previous Agent
                <select className="admin-form-input" onChange={(e) => selectAgent(e.target.value)} defaultValue="">
                  <option value="" disabled>— Choose an agent —</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.agent_name} ({a.agency})</option>
                  ))}
                </select>
              </label>
            )}
            <div className="admin-form-grid">
              <label className="admin-form-label">Agency<input type="text" className="admin-form-input" value={agency} onChange={(e) => setAgency(e.target.value)} /></label>
              <label className="admin-form-label">Agent Name<input type="text" className="admin-form-input" value={agentName} onChange={(e) => setAgentName(e.target.value)} /></label>
              <label className="admin-form-label">Agent Phone<input type="tel" className="admin-form-input" value={agentPhone} onChange={(e) => setAgentPhone(formatPhoneNumber(e.target.value))} /></label>
              <label className="admin-form-label">Agent Email<input type="email" className="admin-form-input" value={agentEmail} onChange={(e) => setAgentEmail(e.target.value)} /></label>
              <label className="admin-form-label">Artist Name *<input type="text" className="admin-form-input" value={artistName} onChange={(e) => setArtistName(e.target.value)} required /></label>
              <label className="admin-form-label">Date of Engagement
                <select className="admin-form-input" value={dateMode} onChange={(e) => { const m = e.target.value as "ma" | "date"; setDateMode(m); if (m === "ma") setEventDate(""); }} style={{ marginBottom: 6 }}>
                  <option value="ma">MA — No date attached</option>
                  <option value="date">Specific date</option>
                </select>
              </label>
              {dateMode === "date" && (
                <label className="admin-form-label">Event Date<input type="date" className="admin-form-input" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
              )}
              <label className="admin-form-label">Day of Event<input type="text" className="admin-form-input" value={dayOfEvent} onChange={(e) => setDayOfEvent(e.target.value)} placeholder="e.g. Saturday" /></label>
              <label className="admin-form-label"># of Shows<input type="number" className="admin-form-input" value={numShows} onChange={(e) => setNumShows(e.target.value)} min="1" /></label>
              <label className="admin-form-label">Length of Show<input type="text" className="admin-form-input" value={showLength} onChange={(e) => setShowLength(e.target.value)} placeholder="75-90" /></label>
              <label className="admin-form-label">Time of Show<input type="time" className="admin-form-input" value={showTime} onChange={(e) => setShowTime(e.target.value)} /></label>
              <label className="admin-form-label">Billing<select className="admin-form-input" value={billing} onChange={(e) => setBilling(e.target.value)}>
                <option>100% Headline</option><option>Co-Headline</option><option>Support</option>
              </select></label>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 2: Show Lineup ═══ */}
        <h2 className="admin-form-section-title">Show Lineup</h2>
        <div className="admin-tiers-list">
          {lineup.map((l, i) => (
            <div key={i} className="admin-tier-row">
              <input type="time" className="admin-form-input admin-tier-input" value={l.time} onChange={(e) => setLineup((p) => p.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} />
              <input type="text" className="admin-form-input admin-tier-input" placeholder="Artist / Act" value={l.artist} onChange={(e) => setLineup((p) => p.map((x, j) => j === i ? { ...x, artist: e.target.value } : x))} />
              <input type="text" className="admin-form-input admin-tier-input admin-tier-capacity" placeholder="Set length" value={l.set_length} onChange={(e) => setLineup((p) => p.map((x, j) => j === i ? { ...x, set_length: e.target.value } : x))} />
              {lineup.length > 1 && <button type="button" className="admin-tier-remove-btn" onClick={() => setLineup((p) => p.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
        </div>
        <button type="button" className="admin-tier-add-btn" onClick={() => setLineup((p) => [...p, emptyLineup()])}>+ Add Act</button>

        {/* ═══ PURCHASER INFO (auto-filled from settings) ═══ */}
        <h2 className="admin-form-section-title">Purchaser Info</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">Buyer<input type="text" className="admin-form-input" placeholder="e.g. Acme Entertainment LLC" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} /></label>
          <label className="admin-form-label">Contract Signatory<input type="text" className="admin-form-input" placeholder="e.g. Jane Smith" value={contractSignatory} onChange={(e) => setContractSignatory(e.target.value)} /></label>
          <label className="admin-form-label">Phone<input type="tel" className="admin-form-input" placeholder="e.g. (555)-123-4567" value={buyerPhone} onChange={(e) => setBuyerPhone(formatPhoneNumber(e.target.value))} /></label>
          <label className="admin-form-label">Email<input type="email" className="admin-form-input" placeholder="e.g. booking@company.com" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} /></label>
          <label className="admin-form-label admin-form-full">Promoter Address<input type="text" className="admin-form-input" placeholder="e.g. 123 Main St, Nashville, TN 37201" value={promoterAddress} onChange={(e) => setPromoterAddress(e.target.value)} /></label>
          <label className="admin-form-label admin-form-full">Venue Address<input type="text" className="admin-form-input" placeholder="Auto-filled from venue settings" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} /></label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
          {/* ═══ SECTION 3: Deal Terms ═══ */}
          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Deal</h2>
            <div className="admin-form-grid">
              <label className="admin-form-label">Guarantee ($)<input type="number" className="admin-form-input" value={guarantee} onChange={(e) => setGuarantee(e.target.value)} step="0.01" min="0" /></label>
              <label className="admin-form-label">Deal Type<select className="admin-form-input" value={dealType} onChange={(e) => setDealType(e.target.value)}>
                <option>VS</option><option>FLAT</option><option>PLUS</option><option>BONUS</option>
              </select></label>
              <label className="admin-form-label">Backend %<input type="text" className="admin-form-input" value={backendPct} onChange={(e) => setBackendPct(e.target.value)} placeholder="80" /></label>
              <label className="admin-form-label admin-form-full">Other Terms<input type="text" className="admin-form-input" value={otherTerms} onChange={(e) => setOtherTerms(e.target.value)} /></label>
              <label className="admin-form-label">Radius (mi)<input type="text" className="admin-form-input" value={radiusDistance} onChange={(e) => setRadiusDistance(e.target.value)} /></label>
              <label className="admin-form-label">Days Prior<input type="number" className="admin-form-input" value={radiusDaysPrior} onChange={(e) => setRadiusDaysPrior(e.target.value)} /></label>
              <label className="admin-form-label">Days After<input type="number" className="admin-form-input" value={radiusDaysAfter} onChange={(e) => setRadiusDaysAfter(e.target.value)} /></label>
              <label className="admin-form-label">Production By<input type="text" className="admin-form-input" value={productionBy} onChange={(e) => setProductionBy(e.target.value)} /></label>
              <label className="admin-form-label">Deposit %<input type="number" className="admin-form-input" value={depositPct} onChange={(e) => { setDepositPct(e.target.value); const pct = parseFloat(e.target.value) / 100; setDepositAmount(String(Math.round(guaranteeNum * pct * 100) / 100)); }} step="0.01" /></label>
              <label className="admin-form-label">Deposit $<input type="number" className="admin-form-input" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} step="0.01" /></label>
              <label className="admin-form-label">Deposit Due<input type="text" className="admin-form-input" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} placeholder="30 Days w/ FEC" /></label>
              <label className="admin-form-label">Balance Due<input type="text" className="admin-form-input" value={balanceDue} onChange={(e) => setBalanceDue(e.target.value)} /></label>
              <label className="admin-form-label">Merch<input type="text" className="admin-form-input" value={merchSplit} onChange={(e) => setMerchSplit(e.target.value)} /></label>
              <label className="admin-form-label">Who Sells<select className="admin-form-input" value={merchSeller} onChange={(e) => setMerchSeller(e.target.value)}>
                <option>Artist</option><option>Venue</option><option>Split</option>
              </select></label>
              <label className="admin-form-label">Total Comps<input type="number" className="admin-form-input" value={comps} onChange={(e) => setComps(e.target.value)} min="0" /></label>
              <label className="admin-form-label">Artist Comps<input type="number" className="admin-form-input" value={artistComps} onChange={(e) => setArtistComps(e.target.value)} min="0" /></label>
              <label className="admin-form-label">Marketing Comps<input type="number" className="admin-form-input" value={marketingComps} onChange={(e) => setMarketingComps(e.target.value)} min="0" /></label>
            </div>
          </div>

          <div>
            <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Tax</h2>
            <div className="admin-form-grid">
              <label className="admin-form-label">
                Tax Method
                <select className="admin-form-input" value={taxMode} onChange={(e) => setTaxMode(e.target.value as "divisor" | "multiplier")}>
                  <option value="multiplier">Multiplier (default — customer pays tax on top)</option>
                  <option value="divisor">Divisor (tax baked into face price)</option>
                </select>
              </label>
              <label className="admin-form-label">
                Tax Rate (%)
                <input type="number" className="admin-form-input" style={{ opacity: isOwnerRole ? 1 : 0.5 }} value={taxRate} onChange={(e) => { if (!isOwnerRole) return; setTaxRate(e.target.value); }} readOnly={!isOwnerRole} step="0.5" min="0" placeholder="9.5" title={isOwnerRole ? "" : "Set by platform owner"} />
              </label>
            </div>
          </div>
        </div>

        {/* ═══ SECTION 4: Ticket Scaling ═══ */}
        <h2 className="admin-form-section-title">Ticket Scaling</h2>
        <div className="offer-scaling-table">
          <div className="offer-scaling-header">
            <span>Name</span><span># Seats</span><span>Comps</span><span>Kills</span><span>Sellable</span><span>Net Price</span><span>Fac. Fee</span><span>Tkt Fee</span><span>Sub.</span><span>Tax/Ticket</span><span>CC/Ticket</span><span>Price</span><span>Gross</span>
          </div>
          {scaling.map((r, i) => {
            const taxPerTicket = taxMode === "divisor"
              ? Math.round(r.net_price * taxRateDecimal / (1 + taxRateDecimal) * 100) / 100
              : Math.round(r.net_price * taxRateDecimal * 100) / 100;
            const preCC = taxMode === "divisor" ? r.price : r.price + taxPerTicket;
            const ccPerTicket = Math.round(preCC * 0.027 * 100) / 100;
            const allIn = preCC + ccPerTicket;
            const tierGross = r.sellable_cap * allIn;
            return (
            <div key={i} className="offer-scaling-row">
              <input type="text" className="admin-form-input" value={r.name} onChange={(e) => { const v = e.target.value; setScaling((p) => p.map((x, j) => j === i ? { ...x, name: v } : x)); }} />
              <input type="number" className="admin-form-input" value={r.seats || ""} onChange={(e) => updateScaling(i, "seats", parseInt(e.target.value) || 0)} />
              <input type="number" className="admin-form-input" value={r.comps || ""} onChange={(e) => updateScaling(i, "comps", parseInt(e.target.value) || 0)} />
              <input type="number" className="admin-form-input" value={r.kills || ""} onChange={(e) => updateScaling(i, "kills", parseInt(e.target.value) || 0)} />
              <span className="offer-calc-cell">{r.sellable_cap}</span>
              <input type="number" className="admin-form-input" value={r.net_price || ""} onChange={(e) => updateScaling(i, "net_price", parseFloat(e.target.value) || 0)} step="0.01" />
              <span className="offer-calc-cell">${(r.facility_fee || 0).toFixed(2)}</span>
              <span className="offer-calc-cell">${(r.ticketing_fee || 0).toFixed(2)}</span>
              <span className="offer-calc-cell">${r.price.toFixed(2)}</span>
              <span className="offer-calc-cell">${taxPerTicket.toFixed(2)}</span>
              <span className="offer-calc-cell">${ccPerTicket.toFixed(2)}</span>
              <span className="offer-calc-cell">${allIn.toFixed(2)}</span>
              <span className="offer-calc-cell">${tierGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              {scaling.length > 1 && <button type="button" className="admin-tier-remove-btn" onClick={() => setScaling((p) => p.filter((_, j) => j !== i))}>✕</button>}
            </div>
            );
          })}
        </div>
        <div className="offer-scaling-footer">
          <button type="button" className="admin-tier-add-btn" onClick={() => setScaling((p) => [...p, { ...emptyScalingRow(), name: "General Admission" }])}>+ Add Tier</button>
          <label className="admin-form-label offer-inline-label">Facility Fee $<input type="number" className="admin-form-input" style={{ width: 80, opacity: isOwnerRole ? 1 : 0.5 }} value={facilityFee} onChange={(e) => { if (!isOwnerRole) return; setFacilityFee(e.target.value); const fee = parseFloat(e.target.value) || 0; const tFee = parseFloat(ticketingFee || "0"); setScaling((p) => p.map((r) => ({ ...r, facility_fee: fee, price: r.net_price + fee + tFee }))); }} readOnly={!isOwnerRole} step="0.01" title={isOwnerRole ? "" : "Set by platform owner"} /></label>
          <label className="admin-form-label offer-inline-label">Ticketing Fee $<input type="number" className="admin-form-input" style={{ width: 80, opacity: isOwnerRole ? 1 : 0.5 }} value={ticketingFee} onChange={(e) => { if (!isOwnerRole) return; setTicketingFee(e.target.value); const tFee = parseFloat(e.target.value) || 0; const fFee = parseFloat(facilityFee || "0"); setScaling((p) => p.map((r) => ({ ...r, ticketing_fee: tFee, price: r.net_price + fFee + tFee }))); }} readOnly={!isOwnerRole} step="0.01" title={isOwnerRole ? "" : "Set by platform owner"} /></label>
        </div>
        <div className="offer-totals-row">
          <span>Total Cap: <strong>{scaling.reduce((s, r) => s + r.seats, 0)}</strong></span>
          <span>Sellable: <strong>{scaling.reduce((s, r) => s + r.sellable_cap, 0)}</strong></span>
          <span>Gross Potential: <strong>${displayGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
          <span>Adj. Gross: <strong>${displayAdjGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
        </div>

        {/* ═══ SECTION 5: Expenses ═══ */}
        <h2 className="admin-form-section-title">Expenses</h2>
        <div className="offer-expenses-grid">
          <div className="offer-expenses-col">
            <h3 className="offer-expenses-heading">Fixed Expenses</h3>
            {fixedExpenses.map((exp, i) => (
              <div key={i} className="offer-expense-row">
                <input type="text" className="admin-form-input" value={exp.name} onChange={(e) => setFixedExpenses((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <input type="number" className="admin-form-input" value={exp.amount || ""} onChange={(e) => setFixedExpenses((p) => p.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} step="0.01" placeholder="$0.00" />
                {fixedExpenses.length > 1 && <button type="button" className="admin-tier-remove-btn" onClick={() => setFixedExpenses((p) => p.filter((_, j) => j !== i))}>✕</button>}
              </div>
            ))}
            <button type="button" className="admin-tier-add-btn" onClick={() => setFixedExpenses((p) => [...p, { name: "", amount: 0 }])}>+ New Expense</button>
            <div className="offer-expense-total">Fixed Total: <strong>${totalFixed.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
          </div>

          <div className="offer-expenses-col">
            <h3 className="offer-expenses-heading">Variable Expenses</h3>
            {variableExpenses.map((exp, i) => (
              <div key={i} className="offer-expense-row">
                <span className="offer-var-name">{exp.name}</span>
                <input type="number" className="admin-form-input" value={exp.rate} onChange={(e) => { const rate = parseFloat(e.target.value) || 0; setVariableExpenses((p) => p.map((x, j) => j === i ? { ...x, rate, amount: Math.round(grossPotential * rate * 100) / 100 } : x)); }} step="0.0001" style={{ width: 80 }} />
                <span className="offer-var-amount">${exp.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="offer-expense-total">Variable Total: <strong>${totalVariable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
          </div>
        </div>
        <div className="offer-total-expenses">Total Expenses: <strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>



        {/* ═══ SECTION 6: Potential at Sellout ═══ */}
        <h2 className="admin-form-section-title">Potential at Sellout</h2>
        <div className="offer-potential-grid">
          <div className="offer-potential-col">
            <div className="offer-potential-row"><span>Gross (Price × Sellable):</span><strong>${displayGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Less: Stripe Fees (~2.9%):</span><strong>(${totalCC.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</strong></div>
            <div className="offer-potential-row"><span>Less: Tkt &amp; Fac. Fees:</span><strong>(${totalFees.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</strong></div>
            <div className="offer-potential-row"><span>Adj. Gross:</span><strong>${displayAdjGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>{taxMode === "multiplier" ? `Less: Tax (${taxRate}% — remitted to govt):` : `Less: Tax (${taxRate}% — extracted from price):`}</span><strong>(${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</strong></div>
            <div className="offer-potential-row"><span>Net Potential:</span><strong>${netPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Total Expenses:</span><strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            {dealType !== "FLAT" && (
              <div className="offer-potential-row highlight"><span>Splitpoint:</span><strong>${splitpoint.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            )}
          </div>
          <div className="offer-potential-col">
            <h3 className="offer-expenses-heading">Artist Potential at Sellout</h3>
            <div className="offer-potential-row"><span>Guarantee:</span><strong>${guaranteeNum.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            {dealType !== "FLAT" && (
              <div className="offer-potential-row"><span>Backend ({dealType}):</span><strong>${artistBackend.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            )}
            <div className="offer-potential-row highlight"><span>Artist Total:</span><strong>${artistPAS.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
          </div>
        </div>

        {/* ═══ Offer Validity ═══ */}
        <div className="admin-form-grid" style={{ marginTop: 16 }}>
          <label className="admin-form-label">Offer Valid (days)<input type="number" className="admin-form-input" value={offerValidDays} onChange={(e) => setOfferValidDays(e.target.value)} min="1" /></label>
          <label className="admin-form-label admin-form-full">Notes<textarea className="admin-form-textarea" rows={3} onChange={(e) => {/* stored on submit */}} placeholder="Additional notes..." /></label>
        </div>

        <button type="button" className="admin-form-submit" disabled={loading} onClick={handleSubmit as unknown as () => void}>
          {loading ? "Creating…" : "Create Offer"}
        </button>
      </form>
      </>
      )}

      {activeTab === "pnl" && (() => {
        // ── P&L Calculations (use already-computed values from this page) ──
        const pnlTotalFixed = totalFixed;
        const pnlTotalVariable = totalVariable;
        const pnlTotalExpenses = totalExpenses;
        const pnlGrossPotential = grossPotential;
        const pnlAdjGross = adjGross;
        const pnlTaxRate = parseFloat(taxRate || "0");
        const pnlTaxAmount = taxAmount;
        const pnlNetPotential = netPotential;
        const pnlGuarantee = guaranteeNum;
        const pnlDealType = dealType;

        // Artist backend calculation (mirrors details tab logic)
        let backendAmount = 0;
        let pnlArtistTotal = pnlGuarantee;
        if (pnlDealType === "VS") {
          pnlArtistTotal = splitpoint * (backendNum);
          backendAmount = Math.max(pnlArtistTotal - pnlGuarantee, 0);
        } else if (pnlDealType === "PLUS" || pnlDealType === "BONUS") {
          backendAmount = splitpoint * (backendNum);
          pnlArtistTotal = pnlGuarantee + backendAmount;
        }
        // FLAT: backendAmount = 0, pnlArtistTotal = guarantee

        // For FLAT / PLUS / BONUS deals, the guarantee is entered as the "Talent" line in
        // fixed_expenses. It's already baked into totalExpenses — do NOT subtract it again
        // in breakeven or P&L, or it will be double-counted. Only VS deals treat the guarantee
        // as a separate outflow from show expenses.
        const guaranteeInExpenses = pnlDealType === "FLAT" || pnlDealType === "PLUS" || pnlDealType === "BONUS";

        // Breakeven
        const tierCount = scaling.length || 1;
        const avgTicketPrice = tierCount > 0
          ? scaling.reduce((s, r) => s + (r.net_price || 0), 0) / tierCount
          : 0;
        // For FLAT: no extra artist cost beyond expenses. For PLUS/BONUS: add just the backend
        // (guarantee already in expenses). For VS: add the full artist total.
        const artistCostForBreakeven = guaranteeInExpenses ? backendAmount : pnlArtistTotal;
        const breakevenOffer = avgTicketPrice > 0
          ? Math.round(((pnlTotalExpenses + artistCostForBreakeven) / avgTicketPrice) * 100) / 100
          : 0;

        // Ancillary totals
        const ancillaryTotal = ancillaryItems.reduce((s, item) => s + (item.income - item.expenses), 0);

        // Final P&L — avoid double-counting the guarantee when it's already in expenses
        const netTicketRevenue = pnlNetPotential;
        const totalAllExpenses = guaranteeInExpenses
          ? (pnlTotalExpenses + backendAmount)
          : (pnlTotalExpenses + pnlGuarantee + backendAmount);
        const finalPnl = (netTicketRevenue + ancillaryTotal) - totalAllExpenses;

        // P&L at sellout (without ancillary)
        const pnlOffer = pnlNetPotential - totalAllExpenses;

        const fmtDollar = (v: number) => {
          const abs = Math.abs(v);
          const formatted = abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return v < 0 ? `$(${formatted})` : `$${formatted}`;
        };

        return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 24 }}>
            {/* ── Section A: Breakeven Point ── */}
            <div>
              <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Breakeven Point (Based on Offer)</h2>
              <div className="offer-potential-grid">
                <div className="offer-potential-col">
                  <div className="offer-potential-row"><span>Total Expenses:</span><strong>${pnlTotalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Artist Pot (at Walkout):</span><strong>${pnlArtistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Avg Ticket Price (Net):</span><strong>${avgTicketPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>Breakeven:</span>
                    <strong style={{ color: "#d0c290", fontSize: 16 }}>{breakevenOffer.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tickets</strong>
                  </div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>Tickets to Pay Band:</span>
                    <strong style={{ color: "#d0c290", fontSize: 16 }}>{avgTicketPrice > 0 ? (pnlGuarantee / avgTicketPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"} tickets</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section B: Potential at Sellout ── */}
            <div>
              <h2 className="admin-form-section-title" style={{ marginTop: 0 }}>Potential at Sellout (Based on Offer)</h2>
              <div className="offer-potential-grid">
                <div className="offer-potential-col">
                  <div className="offer-potential-row"><span>Gross Potential:</span><strong>${pnlGrossPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Adj. Gross Potential:</span><strong>${pnlAdjGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Tax Rate: {pnlTaxRate}%</span><strong>${pnlTaxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Net Potential:</span><strong>${pnlNetPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row"><span>Total Expenses:</span><strong>${pnlTotalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  <div className="offer-potential-row">
                    <span style={{ fontWeight: 700 }}>P&amp;L (Offer):</span>
                    <strong style={{ color: pnlOffer >= 0 ? "#7ddb7d" : "#ff9a9a" }}>{fmtDollar(pnlOffer)}</strong>
                  </div>
                </div>
                <div className="offer-potential-col">
                  <h3 className="offer-expenses-heading">Artist Potential at Sellout</h3>
                  <div className="offer-potential-row"><span>Guarantee:</span><strong>${pnlGuarantee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  {pnlDealType !== "FLAT" && (
                    <div className="offer-potential-row"><span>Backend ({pnlDealType}):</span><strong>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  )}
                  <div className="offer-potential-row highlight"><span>Artist Total:</span><strong>${pnlArtistTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  {pnlDealType !== "FLAT" && (
                    <div className="offer-potential-row"><span>Artist Lift:</span><strong style={{ color: "#d0c290" }}>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Section C: Ancillary Revenue ── */}
          <h2 className="admin-form-section-title">Ancillary Revenue</h2>
          <div style={{ overflowX: "auto" }}>
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
                    <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: (item.income - item.expenses) >= 0 ? "#7ddb7d" : "#ff9a9a" }}>
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
                  <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: ancillaryTotal >= 0 ? "#7ddb7d" : "#ff9a9a" }}>
                    {fmtDollar(ancillaryTotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* ── Section D: Profit & Loss Summary ── */}
          <h2 className="admin-form-section-title">Profit &amp; Loss (Based on Actuals / Offer)</h2>
          <div className="offer-potential-grid">
            <div className="offer-potential-col">
              <div className="offer-potential-row"><span>Net Ticket Revenue:</span><strong>${netTicketRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div className="offer-potential-row"><span>Ancillary Revenue:</span><strong>{fmtDollar(ancillaryTotal)}</strong></div>
              <div style={{ height: 12 }} />
              <div className="offer-potential-row">
                <span>Artist Guarantee{guaranteeInExpenses ? " (in Show Expenses)" : ""}:</span>
                <strong style={{ opacity: guaranteeInExpenses ? 0.55 : 1 }}>
                  ${pnlGuarantee.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </div>
              {pnlDealType !== "FLAT" && backendAmount > 0 && (
                <div className="offer-potential-row"><span>Backend ({pnlDealType}):</span><strong>${backendAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              )}
              <div className="offer-potential-row"><span>Show Expenses{guaranteeInExpenses ? " (incl. Talent)" : ""}:</span><strong>${pnlTotalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <div className="offer-potential-row">
                <span style={{ fontWeight: 700 }}>Total Expenses:</span>
                <strong style={{ color: "#ff9a9a" }}>${totalAllExpenses.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ height: 12 }} />
              <div className="offer-potential-row" style={{ padding: "12px 16px" }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>P&amp;L:</span>
                <strong style={{ color: finalPnl >= 0 ? "#7ddb7d" : "#ff9a9a", fontSize: 16 }}>{fmtDollar(finalPnl)}</strong>
              </div>
            </div>
          </div>

        </div>
        );
      })()}

      {activeTab === "deal_lab" && (
        <DealLabPanel
          inputs={{
            gross_potential_full: grossPotential,
            adj_gross_full: adjGross,
            net_potential_full: netPotential,
            total_capacity: scaling.reduce(
              (s, r) => s + (Number(r.sellable_cap) || 0),
              0
            ),
            fixed_expenses: fixedExpenses.map((e) => ({
              name: e.name,
              amount: Number(e.amount) || 0,
            })),
            variable_expense_rates: variableExpenses.map((e) => ({
              name: e.name,
              rate: Number(e.rate) || 0,
            })),
            offer_guarantee: guaranteeNum,
            offer_deal_type: dealType as "FLAT" | "VS" | "PLUS" | "BONUS",
            offer_backend_percentage: backendNum * 100,
          }}
        />
      )}

    </div>
  );
}
