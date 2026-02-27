"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";
import type { ShowLineupItem, TicketScalingRow, ExpenseItem, VariableExpenseItem } from "@/lib/types/offer";

type Agent = { id: string; agency: string; agent_name: string; agent_phone: string | null; agent_email: string | null };
type EventVenue = { id: string; name: string; full_address: string | null; contact_name: string | null; phone: string | null };

const DEFAULT_FIXED: ExpenseItem[] = [
  { name: "Rent", amount: 0 },
  { name: "Production", amount: 0 },
  { name: "Catering", amount: 0 },
  { name: "Hospitality", amount: 0 },
  { name: "Support", amount: 0 },
  { name: "Talent", amount: 0 },
  { name: "Marketing", amount: 0 },
  { name: "Labor", amount: 0 },
  { name: "Insurance", amount: 0 },
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
  { name: "Credit Card (Stripe)", rate: 0.03, amount: 0 },
];

function emptyScalingRow(): TicketScalingRow {
  return { name: "P1", seats: 0, comps: 0, kills: 0, sellable_cap: 0, price: 0, net_price: 0, facility_fee: 0 };
}

function emptyLineup(): ShowLineupItem {
  return { time: "", artist: "", set_length: "" };
}

export default function AdminCreateOfferPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [eventVenues, setEventVenues] = useState<EventVenue[]>([]);
  const [isOwnerRole, setIsOwnerRole] = useState(false);

  // Venue info
  const [venueName, setVenueName] = useState("");
  const [venueAddressField, setVenueAddressField] = useState("");
  const [venueContact, setVenueContact] = useState("");
  const [venuePhone, setVenuePhone] = useState("");

  // Purchaser info (auto-filled from settings)
  const [buyerName, setBuyerName] = useState("");
  const [contractSignatory, setContractSignatory] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [promoterAddress, setPromoterAddress] = useState("");
  const [venueAddress, setVenueAddress] = useState("");

  // Fetch agents + buyer info on mount
  useEffect(() => {
    const venueId = getCookie("venue-id");
    const role = getCookie("user-role") || "";
    setIsOwnerRole(role === "owner");
    const params = venueId ? `?venue_id=${venueId}` : "";

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
    if (venueId) {
      fetch("/api/venues")
        .then((r) => r.json())
        .then((venues: Array<Record<string, string | number | null>>) => {
          if (!Array.isArray(venues)) return;
          const v = venues.find((x) => x.id === venueId);
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
  }, []);

  const selectEventVenue = (venueId: string) => {
    const v = eventVenues.find((x) => x.id === venueId);
    if (v) {
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
  const [otherTerms, setOtherTerms] = useState("");
  const [radiusDistance, setRadiusDistance] = useState("");
  const [radiusDaysPrior, setRadiusDaysPrior] = useState("");
  const [radiusDaysAfter, setRadiusDaysAfter] = useState("");
  const [productionBy, setProductionBy] = useState("In House");
  const [depositPct, setDepositPct] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDue, setDepositDue] = useState("");
  const [balanceDue, setBalanceDue] = useState("Day of Show");
  const [merchSplit, setMerchSplit] = useState("100% Merch");
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
  const [taxMode, setTaxMode] = useState<"imposed" | "absorbed">("imposed");

  // ── Section 7: Offer Validity ──
  const [offerValidDays, setOfferValidDays] = useState("14");

  // ── Calculated values ──
  const grossPotential = scaling.reduce((sum, r) => sum + r.sellable_cap * r.price, 0);
  // Adj Gross = Gross - ticketing fees (facility fee stays in)
  const tfNum = parseFloat(ticketingFee || "0");
  const adjGross = grossPotential - scaling.reduce((sum, r) => sum + r.sellable_cap * tfNum, 0);

  // Tax: imposed = divisor (adjGross / (1 + rate)), absorbed = multiplier (adjGross - adjGross * rate)
  const taxRateDecimal = parseFloat(taxRate || "0") / 100;
  let netPotential: number;
  let taxAmount: number;
  if (taxMode === "imposed") {
    // Ticket buyer pays tax — divisor method
    netPotential = adjGross / (1 + taxRateDecimal);
    taxAmount = adjGross - netPotential;
  } else {
    // Promoter absorbs tax — multiplier method
    taxAmount = adjGross * taxRateDecimal;
    netPotential = adjGross - taxAmount;
  }

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

    const venueId = getCookie("venue-id");

    // Auto-save agent for future use
    if (agency && agentName) {
      fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agency, agent_name: agentName, agent_phone: agentPhone, agent_email: agentEmail, venue_id: venueId || null }),
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
          venue_id: venueId || null,
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
          tax_rate: taxRateDecimal, net_potential: netPotential,
          splitpoint, artist_backend: artistBackend, pot_walkout: potWalkout,
          offer_valid_days: parseInt(offerValidDays) || 14,
          status: "draft",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create offer");
      }

      router.push("/admin/offers");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">New Offer</h1>

      <form className="admin-form offer-form" onSubmit={(e) => e.preventDefault()} onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault(); }}>
        {error && <div className="admin-form-error">{error}</div>}

        {/* ═══ VENUE INFO ═══ */}
        <h2 className="admin-form-section-title">Venue Info</h2>
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
          <label className="admin-form-label">Venue Phone <span style={{ opacity: 0.5, fontSize: 11 }}>(optional)</span><input type="tel" className="admin-form-input" placeholder="e.g. 555-123-4567" value={venuePhone} onChange={(e) => setVenuePhone(e.target.value)} /></label>
        </div>

        {/* ═══ SECTION 1: Agency & Artist ═══ */}
        <h2 className="admin-form-section-title">Agency & Artist</h2>
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
          <label className="admin-form-label">Agent Phone<input type="tel" className="admin-form-input" value={agentPhone} onChange={(e) => setAgentPhone(e.target.value)} /></label>
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
          <label className="admin-form-label">Phone<input type="tel" className="admin-form-input" placeholder="e.g. 555-123-4567" value={buyerPhone} onChange={(e) => setBuyerPhone(e.target.value)} /></label>
          <label className="admin-form-label">Email<input type="email" className="admin-form-input" placeholder="e.g. booking@company.com" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} /></label>
          <label className="admin-form-label admin-form-full">Promoter Address<input type="text" className="admin-form-input" placeholder="e.g. 123 Main St, Nashville, TN 37201" value={promoterAddress} onChange={(e) => setPromoterAddress(e.target.value)} /></label>
          <label className="admin-form-label admin-form-full">Venue Address<input type="text" className="admin-form-input" placeholder="Auto-filled from venue settings" value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} /></label>
        </div>

        {/* ═══ SECTION 3: Deal Terms ═══ */}
        <h2 className="admin-form-section-title">Deal</h2>
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

        {/* ═══ SECTION 4: Ticket Scaling ═══ */}
        <h2 className="admin-form-section-title">Ticket Scaling</h2>
        <div className="offer-scaling-table">
          <div className="offer-scaling-header">
            <span>Name</span><span># Seats</span><span>Comps</span><span>Kills</span><span>Sellable</span><span>Net Price</span><span>Price</span><span>Gross</span>
          </div>
          {scaling.map((r, i) => (
            <div key={i} className="offer-scaling-row">
              <input type="text" className="admin-form-input" value={r.name} onChange={(e) => { const v = e.target.value; setScaling((p) => p.map((x, j) => j === i ? { ...x, name: v } : x)); }} />
              <input type="number" className="admin-form-input" value={r.seats || ""} onChange={(e) => updateScaling(i, "seats", parseInt(e.target.value) || 0)} />
              <input type="number" className="admin-form-input" value={r.comps || ""} onChange={(e) => updateScaling(i, "comps", parseInt(e.target.value) || 0)} />
              <input type="number" className="admin-form-input" value={r.kills || ""} onChange={(e) => updateScaling(i, "kills", parseInt(e.target.value) || 0)} />
              <span className="offer-calc-cell">{r.sellable_cap}</span>
              <input type="number" className="admin-form-input" value={r.net_price || ""} onChange={(e) => updateScaling(i, "net_price", parseFloat(e.target.value) || 0)} step="0.01" />
              <span className="offer-calc-cell">${r.price.toFixed(2)}</span>
              <span className="offer-calc-cell">${(r.sellable_cap * r.price).toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              {scaling.length > 1 && <button type="button" className="admin-tier-remove-btn" onClick={() => setScaling((p) => p.filter((_, j) => j !== i))}>✕</button>}
            </div>
          ))}
        </div>
        <div className="offer-scaling-footer">
          <button type="button" className="admin-tier-add-btn" onClick={() => setScaling((p) => [...p, { ...emptyScalingRow(), name: `P${p.length + 1}` }])}>+ Add Tier</button>
          <label className="admin-form-label offer-inline-label">Facility Fee $<input type="number" className="admin-form-input" style={{ width: 80 }} value={facilityFee} onChange={(e) => { setFacilityFee(e.target.value); const fee = parseFloat(e.target.value) || 0; const tFee = parseFloat(ticketingFee || "0"); setScaling((p) => p.map((r) => ({ ...r, facility_fee: fee, price: r.net_price + fee + tFee }))); }} step="0.01" /></label>
          <label className="admin-form-label offer-inline-label">Ticketing Fee $<input type="number" className="admin-form-input" style={{ width: 80, opacity: isOwnerRole ? 1 : 0.5 }} value={ticketingFee} onChange={(e) => { if (!isOwnerRole) return; setTicketingFee(e.target.value); const tFee = parseFloat(e.target.value) || 0; const fFee = parseFloat(facilityFee || "0"); setScaling((p) => p.map((r) => ({ ...r, price: r.net_price + fFee + tFee }))); }} readOnly={!isOwnerRole} step="0.01" title={isOwnerRole ? "" : "Set by platform owner"} /></label>
        </div>
        <div className="offer-totals-row">
          <span>Total Cap: <strong>{scaling.reduce((s, r) => s + r.seats, 0)}</strong></span>
          <span>Sellable: <strong>{scaling.reduce((s, r) => s + r.sellable_cap, 0)}</strong></span>
          <span>Gross Potential: <strong>${grossPotential.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
          <span>Adj. Gross: <strong>${adjGross.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></span>
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
            <div className="offer-expense-total">Fixed Total: <strong>${totalFixed.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></div>
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
            <div className="offer-expense-total">Variable Total: <strong>${totalVariable.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></div>
          </div>
        </div>
        <div className="offer-total-expenses">Total Expenses: <strong>${totalExpenses.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></div>

        {/* ═══ Tax Mode ═══ */}
        <h2 className="admin-form-section-title">Tax</h2>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            Tax Method
            <select className="admin-form-input" value={taxMode} onChange={(e) => setTaxMode(e.target.value as "imposed" | "absorbed")}>
              <option value="imposed">Tax imposed on ticket buyer (divisor)</option>
              <option value="absorbed">Tax absorbed by promoter (multiplier)</option>
            </select>
          </label>
          <label className="admin-form-label">
            Tax Rate (%)
            <input type="number" className="admin-form-input" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} step="0.5" min="0" placeholder="9.5" />
          </label>
        </div>

        {/* ═══ SECTION 6: Potential at Sellout ═══ */}
        <h2 className="admin-form-section-title">Potential at Sellout</h2>
        <div className="offer-potential-grid">
          <div className="offer-potential-col">
            <div className="offer-potential-row"><span>Gross Potential:</span><strong>${grossPotential.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Adj. Gross:</span><strong>${adjGross.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            <div className="offer-potential-row"><span>Tax ({taxRate}% — {taxMode}):</span><strong>${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
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
    </div>
  );
}
