"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { AuctionItemDraft } from "@/lib/types/auction";

type AuctionData = {
  id: string;
  name: string;
  description: string;
  auction_open: string;
  auction_close: string;
  status: string;
  anti_snipe_enabled: boolean;
  anti_snipe_minutes: number;
  host_fee_percent: number;
  event_id: string | null;
  logo_url: string | null;
};

type ExistingItem = {
  id: string;
  name: string;
  starting_bid: number;
  min_increment: number;
  reserve_price: number | null;
  current_bid: number | null;
  bid_count: number;
  sort_order: number;
};

function emptyItem(): AuctionItemDraft {
  return { name: "", starting_bid: "", min_increment: "", reserve_price: "" };
}

const STATUS_BADGE: Record<string, { cls: string; dot: string }> = {
  draft:     { cls: "auction-badge-draft",     dot: "#71717a" },
  published: { cls: "auction-badge-published", dot: "#60a5fa" },
  open:      { cls: "auction-badge-open",      dot: "#4ade80" },
  closed:    { cls: "auction-badge-closed",    dot: "#fbbf24" },
  settled:   { cls: "auction-badge-settled",   dot: "#a78bfa" },
};

export default function AdminEditAuctionPage() {
  const params = useParams();
  const router = useRouter();
  const auctionId = params.id as string;

  const [auction, setAuction] = useState<AuctionData | null>(null);
  const [existingItems, setExistingItems] = useState<ExistingItem[]>([]);
  const [newItems, setNewItems] = useState<AuctionItemDraft[]>([emptyItem()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [printingQR, setPrintingQR] = useState(false);

  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "draft",
    auction_open_date: "",
    auction_open_time: "",
    auction_close_date: "",
    auction_close_time: "",
    anti_snipe_enabled: true,
    anti_snipe_minutes: "2",
    host_fee_percent: "8",
  });

  const loadAuction = useCallback(async () => {
    const res = await fetch(`/api/auctions/${auctionId}`);
    if (!res.ok) return;
    const data = await res.json();
    setAuction(data);

    const openDate = data.auction_open ? new Date(data.auction_open) : null;
    const closeDate = data.auction_close ? new Date(data.auction_close) : null;

    setForm({
      name: data.name || "",
      description: data.description || "",
      status: data.status || "draft",
      auction_open_date: openDate ? openDate.toISOString().split("T")[0] : "",
      auction_open_time: openDate ? openDate.toTimeString().slice(0, 5) : "",
      auction_close_date: closeDate ? closeDate.toISOString().split("T")[0] : "",
      auction_close_time: closeDate ? closeDate.toTimeString().slice(0, 5) : "",
      anti_snipe_enabled: data.anti_snipe_enabled ?? true,
      anti_snipe_minutes: String(data.anti_snipe_minutes ?? 2),
      host_fee_percent: String(data.host_fee_percent ?? 8),
    });
  }, [auctionId]);

  const loadItems = useCallback(async () => {
    const res = await fetch(`/api/auctions/${auctionId}/items`);
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setExistingItems(data);
  }, [auctionId]);

  useEffect(() => {
    Promise.all([loadAuction(), loadItems()]).finally(() => setLoading(false));
  }, [loadAuction, loadItems]);

  const totalItemCount = existingItems.length + newItems.filter((i) => i.name.trim()).length;

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    const value = target.type === "checkbox" ? (target as HTMLInputElement).checked : target.value;
    setForm((prev) => ({ ...prev, [target.name]: value }));
  };

  const handleNewItemChange = (index: number, field: keyof AuctionItemDraft, value: string) => {
    setNewItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addNewItem = () => {
    setNewItems((prev) => [...prev, emptyItem()]);
  };

  const removeNewItem = (index: number) => {
    setNewItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleExistingItemChange = (itemId: string, field: string, value: string) => {
    setExistingItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, [field]: field === "name" ? value : parseFloat(value) || 0 }
          : item
      )
    );
  };

  const deleteExistingItem = async (itemId: string) => {
    if (!confirm("Delete this item? This cannot be undone.")) return;
    await fetch(`/api/auctions/${auctionId}/items/${itemId}`, { method: "DELETE" });
    setExistingItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    const auctionOpen =
      form.auction_open_date && form.auction_open_time
        ? new Date(`${form.auction_open_date}T${form.auction_open_time}`).toISOString()
        : "";
    const auctionClose =
      form.auction_close_date && form.auction_close_time
        ? new Date(`${form.auction_close_date}T${form.auction_close_time}`).toISOString()
        : "";

    const auctionRes = await fetch(`/api/auctions/${auctionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        status: form.status,
        auction_open: auctionOpen || undefined,
        auction_close: auctionClose || undefined,
        anti_snipe_enabled: form.anti_snipe_enabled,
        anti_snipe_minutes: parseInt(form.anti_snipe_minutes) || 2,
        host_fee_percent: parseFloat(form.host_fee_percent) || 8,
      }),
    });

    if (!auctionRes.ok) {
      const d = await auctionRes.json();
      setError(d.error || "Failed to update auction.");
      setSaving(false);
      return;
    }

    await Promise.all(
      existingItems.map((item) =>
        fetch(`/api/auctions/${auctionId}/items/${item.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: item.name,
            starting_bid: item.starting_bid,
            min_increment: item.min_increment,
            reserve_price: item.reserve_price,
          }),
        })
      )
    );

    const validNew = newItems.filter((i) => i.name.trim());
    if (validNew.length > 0) {
      const res = await fetch(`/api/auctions/${auctionId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validNew),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error || "Failed to create items.");
        setSaving(false);
        return;
      }
    }

    await loadItems();
    setNewItems([emptyItem()]);
    setSuccess("Auction saved successfully!");
    setSaving(false);
  };

  const handlePrintQR = async () => {
    setPrintingQR(true);
    try {
      const res = await fetch(`/api/auctions/${auctionId}/qr-codes`);
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || "Failed to generate QR codes.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `auction-qr-codes-${auctionId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPrintingQR(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
      e.preventDefault();
      const formEl = (e.target as HTMLElement).closest(".admin-form, .auction-edit-wrapper");
      if (!formEl) return;
      const inputs = Array.from(
        formEl.querySelectorAll<HTMLElement>(
          "input:not([type='checkbox']):not([type='file']), select, textarea"
        )
      ).filter((el) => !el.hasAttribute("disabled"));
      const idx = inputs.indexOf(e.target as HTMLElement);
      if (idx >= 0 && idx < inputs.length - 1) {
        inputs[idx + 1].focus();
      }
    }
  };

  if (loading) {
    return <div className="admin-page-loading">Loading auction…</div>;
  }

  if (!auction) {
    return (
      <div className="admin-page">
        <p>Auction not found.</p>
        <button onClick={() => router.push("/admin/auctions")} className="admin-btn">
          Back to Auctions
        </button>
      </div>
    );
  }

  const badge = STATUS_BADGE[form.status] ?? STATUS_BADGE.draft;

  return (
    <div className="admin-page auction-edit-wrapper" onKeyDown={handleKeyDown}>
      {/* ── Header ── */}
      <div className="auction-create-header">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <Link href="/admin/auctions" className="auction-create-back">
              ← Back to Auctions
            </Link>
            <h1 className="admin-page-title">{auction.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
              <span className={`auction-status-badge ${badge.cls}`}>
                <span className="auction-badge-dot" style={{ background: badge.dot }} />
                {form.status.charAt(0).toUpperCase() + form.status.slice(1)}
              </span>
              <span className="auction-item-counter">{totalItemCount} item{totalItemCount !== 1 ? "s" : ""}</span>
            </div>
          </div>
          <button
            onClick={handlePrintQR}
            disabled={printingQR || existingItems.length === 0}
            className="admin-btn admin-btn-outline"
            style={{ marginTop: 28 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
            </svg>
            {printingQR ? "Generating…" : "Print QR Codes"}
          </button>
        </div>
      </div>

      {error && <div className="admin-error-banner">{error}</div>}
      {success && <div className="admin-success-banner">{success}</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>

        {/* ── Auction Details Panel ── */}
        <div className="auction-create-panel">
          <div className="auction-create-panel-header">
            <div className="auction-create-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h2 className="auction-create-panel-title">Auction Details</h2>
              <p className="auction-create-panel-desc">Name, description, status, and schedule</p>
            </div>
          </div>

          <div className="auction-create-fields">
            <div className="admin-form-row" style={{ gap: 12 }}>
              <label className="admin-form-label" style={{ flex: 2 }}>
                <span>Auction Name</span>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleFormChange}
                  className="admin-form-input"
                />
              </label>
              <label className="admin-form-label" style={{ flex: 1 }}>
                <span>Status</span>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleFormChange}
                  className="admin-form-input"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="open">Open (Bidding Live)</option>
                  <option value="closed">Closed</option>
                  <option value="settled">Settled</option>
                </select>
              </label>
            </div>

            <label className="admin-form-label">
              <span>Description</span>
              <textarea
                name="description"
                value={form.description}
                onChange={handleFormChange}
                className="admin-form-input admin-form-textarea"
                rows={2}
              />
            </label>

            <div className="auction-schedule-row">
              <div className="auction-schedule-block">
                <span className="auction-schedule-label">
                  <span className="auction-schedule-dot auction-schedule-dot-open" />
                  Bidding Opens
                </span>
                <div className="auction-schedule-inputs">
                  <label className="admin-form-label">
                    <span>Date</span>
                    <input type="date" name="auction_open_date" value={form.auction_open_date} onChange={handleFormChange} className="admin-form-input" />
                  </label>
                  <label className="admin-form-label">
                    <span>Time</span>
                    <input type="time" name="auction_open_time" value={form.auction_open_time} onChange={handleFormChange} className="admin-form-input" />
                  </label>
                </div>
              </div>
              <div className="auction-schedule-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
              <div className="auction-schedule-block">
                <span className="auction-schedule-label">
                  <span className="auction-schedule-dot auction-schedule-dot-close" />
                  Bidding Closes
                </span>
                <div className="auction-schedule-inputs">
                  <label className="admin-form-label">
                    <span>Date</span>
                    <input type="date" name="auction_close_date" value={form.auction_close_date} onChange={handleFormChange} className="admin-form-input" />
                  </label>
                  <label className="admin-form-label">
                    <span>Time</span>
                    <input type="time" name="auction_close_time" value={form.auction_close_time} onChange={handleFormChange} className="admin-form-input" />
                  </label>
                </div>
              </div>
            </div>

            <div className="auction-settings-grid">
              <label className="admin-form-label">
                <span>Host Fee (%)</span>
                <div className="auction-input-with-suffix">
                  <input
                    type="number"
                    name="host_fee_percent"
                    value={form.host_fee_percent}
                    onChange={handleFormChange}
                    className="admin-form-input"
                    min="0" max="100" step="0.5"
                  />
                  <span className="auction-input-suffix">%</span>
                </div>
                <span className="auction-field-hint">Platform fee charged on winning bids</span>
              </label>

              <div className="auction-toggle-field">
                <div className="auction-toggle-row">
                  <label className="auction-toggle-label">
                    <input
                      type="checkbox"
                      name="anti_snipe_enabled"
                      checked={form.anti_snipe_enabled}
                      onChange={handleFormChange}
                      className="auction-toggle-checkbox"
                    />
                    <span className="auction-toggle-switch" />
                    <span>Anti-Snipe Protection</span>
                  </label>
                </div>
                <span className="auction-field-hint">Extends closing time when last-second bids come in</span>
                {form.anti_snipe_enabled && (
                  <label className="admin-form-label" style={{ marginTop: 12 }}>
                    <span>Extend by (minutes)</span>
                    <input
                      type="number"
                      name="anti_snipe_minutes"
                      value={form.anti_snipe_minutes}
                      onChange={handleFormChange}
                      className="admin-form-input"
                      min="1" max="10"
                      style={{ maxWidth: 120 }}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Existing Items Panel ── */}
        {existingItems.length > 0 && (
          <div className="auction-create-panel">
            <div className="auction-create-panel-header">
              <div className="auction-create-panel-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
                  <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
                </svg>
              </div>
              <div>
                <h2 className="auction-create-panel-title">Auction Items</h2>
                <p className="auction-create-panel-desc">{existingItems.length} item{existingItems.length !== 1 ? "s" : ""} — edit bids, increments, and reserves</p>
              </div>
            </div>

            <div className="auction-items-list">
              {existingItems.map((item) => (
                <div key={item.id} className="auction-item-card">
                  <div className="auction-item-card-header">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "var(--vc-text)" }}>{item.name || "Untitled Item"}</span>
                      {item.bid_count > 0 && (
                        <span className="auction-card-tag auction-card-tag-gold">
                          {item.bid_count} bid{item.bid_count !== 1 ? "s" : ""}
                          {item.current_bid ? ` · $${item.current_bid.toFixed(2)}` : ""}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteExistingItem(item.id)}
                      className="admin-btn admin-btn-sm admin-btn-danger"
                    >
                      Delete
                    </button>
                  </div>
                  <div className="auction-item-fields">
                    <div className="admin-form-group">
                      <label className="admin-label">Item Name</label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => handleExistingItemChange(item.id, "name", e.target.value)}
                        className="admin-input"
                      />
                    </div>
                    <div className="admin-form-group">
                      <label className="admin-label">Starting Bid ($)</label>
                      <input
                        type="number"
                        value={item.starting_bid}
                        onChange={(e) => handleExistingItemChange(item.id, "starting_bid", e.target.value)}
                        className="admin-input"
                        min="0" step="0.01"
                      />
                    </div>
                    <div className="admin-form-group">
                      <label className="admin-label">Min Increment ($)</label>
                      <input
                        type="number"
                        value={item.min_increment}
                        onChange={(e) => handleExistingItemChange(item.id, "min_increment", e.target.value)}
                        className="admin-input"
                        min="0" step="0.01"
                      />
                    </div>
                    <div className="admin-form-group">
                      <label className="admin-label">Reserve ($)</label>
                      <input
                        type="number"
                        value={item.reserve_price ?? ""}
                        onChange={(e) => handleExistingItemChange(item.id, "reserve_price", e.target.value)}
                        className="admin-input"
                        min="0" step="0.01"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Add New Items Panel ── */}
        <div className="auction-create-panel">
          <div className="auction-create-panel-header">
            <div className="auction-create-panel-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </div>
            <div>
              <h2 className="auction-create-panel-title">Add New Items</h2>
              <p className="auction-create-panel-desc">New items will be saved when you click Save</p>
            </div>
          </div>

          <div className="auction-items-list">
            {newItems.map((item, index) => (
              <div key={index} className="auction-item-card auction-item-new">
                <div className="auction-item-fields">
                  <div className="admin-form-group">
                    <label className="admin-label">Item Name</label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleNewItemChange(index, "name", e.target.value)}
                      className="admin-input"
                      placeholder="e.g., Signed Guitar"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">Starting Bid ($)</label>
                    <input
                      type="number"
                      value={item.starting_bid}
                      onChange={(e) => handleNewItemChange(index, "starting_bid", e.target.value)}
                      className="admin-input"
                      min="0" step="0.01"
                      placeholder="50.00"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">Min Increment ($)</label>
                    <input
                      type="number"
                      value={item.min_increment}
                      onChange={(e) => handleNewItemChange(index, "min_increment", e.target.value)}
                      className="admin-input"
                      min="0" step="0.01"
                      placeholder="5.00"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">Reserve ($)</label>
                    <input
                      type="number"
                      value={item.reserve_price}
                      onChange={(e) => handleNewItemChange(index, "reserve_price", e.target.value)}
                      className="admin-input"
                      min="0" step="0.01"
                      placeholder="Optional"
                    />
                  </div>
                </div>
                {newItems.length > 1 && (
                  <button
                    onClick={() => removeNewItem(index)}
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    style={{ marginTop: 10 }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          <button onClick={addNewItem} className="admin-btn admin-btn-outline" style={{ marginTop: 12 }}>
            + Add Another Item
          </button>
        </div>

        {/* ── Save Row ── */}
        <div className="auction-edit-actions">
          <button
            onClick={handleSave}
            disabled={saving}
            className="admin-btn admin-btn-primary"
          >
            {saving ? "Saving…" : "Save All Changes"}
          </button>
          <button
            onClick={() => router.push("/admin/auctions")}
            className="admin-btn admin-btn-outline"
          >
            Back to Auctions
          </button>
        </div>

      </div>
    </div>
  );
}
