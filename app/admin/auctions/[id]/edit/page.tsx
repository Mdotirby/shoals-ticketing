"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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

  // ── Editable auction fields ──
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
      auction_open_time: openDate
        ? openDate.toTimeString().slice(0, 5)
        : "",
      auction_close_date: closeDate ? closeDate.toISOString().split("T")[0] : "",
      auction_close_time: closeDate
        ? closeDate.toTimeString().slice(0, 5)
        : "",
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

  // ── Form handlers ──
  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const target = e.target;
    const value = target.type === "checkbox" ? (target as HTMLInputElement).checked : target.value;
    setForm((prev) => ({ ...prev, [target.name]: value }));
  };

  // ── New item handlers ──
  const handleNewItemChange = (index: number, field: keyof AuctionItemDraft, value: string) => {
    setNewItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addNewItem = () => {
    setNewItems((prev) => [...prev, emptyItem()]);
  };

  const removeNewItem = (index: number) => {
    setNewItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Existing item edit ──
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

  // ── Save all ──
  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");

    // 1. Update auction details
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

    // 2. Update existing items in parallel
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

    // 3. Create new items (skip empty ones)
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

    // Refresh
    await loadItems();
    setNewItems([emptyItem()]);
    setSuccess("Auction saved successfully!");
    setSaving(false);
  };

  // ── Print QR Codes ──
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

  // ── Enter key acts as Tab ──
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

  return (
    <div className="admin-page auction-edit-wrapper" onKeyDown={handleKeyDown}>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Edit Auction</h1>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 4 }}>{auction.name}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="auction-item-counter">{totalItemCount} item{totalItemCount !== 1 ? "s" : ""}</span>
          <button
            onClick={handlePrintQR}
            disabled={printingQR || existingItems.length === 0}
            className="admin-btn admin-btn-outline"
          >
            {printingQR ? "Generating…" : "Print QR Codes"}
          </button>
        </div>
      </div>

      {error && <div className="admin-error-banner">{error}</div>}
      {success && <div className="admin-success-banner">{success}</div>}

      {/* ── Auction Details ── */}
      <section className="auction-edit-section">
        <h2 className="auction-edit-section-title">Auction Details</h2>
        <div className="admin-form">
          <div className="admin-form-group">
            <label className="admin-label">Auction Name</label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleFormChange}
              className="admin-input"
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-label">Description</label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleFormChange}
              className="admin-input admin-textarea"
              rows={2}
            />
          </div>

          <div className="admin-form-group">
            <label className="admin-label">Status</label>
            <select
              name="status"
              value={form.status}
              onChange={handleFormChange}
              className="admin-input"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="open">Open (Bidding Live)</option>
              <option value="closed">Closed</option>
              <option value="settled">Settled</option>
            </select>
          </div>

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">Opens — Date</label>
              <input
                type="date"
                name="auction_open_date"
                value={form.auction_open_date}
                onChange={handleFormChange}
                className="admin-input"
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Opens — Time</label>
              <input
                type="time"
                name="auction_open_time"
                value={form.auction_open_time}
                onChange={handleFormChange}
                className="admin-input"
              />
            </div>
          </div>

          <div className="admin-form-row">
            <div className="admin-form-group">
              <label className="admin-label">Closes — Date</label>
              <input
                type="date"
                name="auction_close_date"
                value={form.auction_close_date}
                onChange={handleFormChange}
                className="admin-input"
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Closes — Time</label>
              <input
                type="time"
                name="auction_close_time"
                value={form.auction_close_time}
                onChange={handleFormChange}
                className="admin-input"
              />
            </div>
          </div>

          <div className="admin-form-row" style={{ alignItems: "center" }}>
            <div className="admin-form-group">
              <label className="admin-label">Host Fee (%)</label>
              <input
                type="number"
                name="host_fee_percent"
                value={form.host_fee_percent}
                onChange={handleFormChange}
                className="admin-input"
                min="0"
                max="100"
                step="0.5"
              />
            </div>
            <div className="admin-form-group">
              <label className="admin-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  name="anti_snipe_enabled"
                  checked={form.anti_snipe_enabled}
                  onChange={handleFormChange}
                  style={{ width: 18, height: 18 }}
                />
                Anti-Snipe
              </label>
            </div>
            {form.anti_snipe_enabled && (
              <div className="admin-form-group">
                <label className="admin-label">Extend (min)</label>
                <input
                  type="number"
                  name="anti_snipe_minutes"
                  value={form.anti_snipe_minutes}
                  onChange={handleFormChange}
                  className="admin-input"
                  min="1"
                  max="10"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Existing Items ── */}
      {existingItems.length > 0 && (
        <section className="auction-edit-section">
          <h2 className="auction-edit-section-title">
            Existing Items ({existingItems.length})
          </h2>
          <div className="auction-items-list">
            {existingItems.map((item) => (
              <div key={item.id} className="auction-item-card">
                <div className="auction-item-card-header">
                  <span className="auction-item-bids">
                    {item.bid_count} bid{item.bid_count !== 1 ? "s" : ""}
                    {item.current_bid ? ` · $${item.current_bid.toFixed(2)}` : ""}
                  </span>
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
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">Min Increment ($)</label>
                    <input
                      type="number"
                      value={item.min_increment}
                      onChange={(e) => handleExistingItemChange(item.id, "min_increment", e.target.value)}
                      className="admin-input"
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-label">Reserve ($)</label>
                    <input
                      type="number"
                      value={item.reserve_price ?? ""}
                      onChange={(e) => handleExistingItemChange(item.id, "reserve_price", e.target.value)}
                      className="admin-input"
                      min="0"
                      step="0.01"
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── New Items ── */}
      <section className="auction-edit-section">
        <h2 className="auction-edit-section-title">Add New Items</h2>
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
                    min="0"
                    step="0.01"
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
                    min="0"
                    step="0.01"
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
                    min="0"
                    step="0.01"
                    placeholder="Optional"
                  />
                </div>
              </div>
              {newItems.length > 1 && (
                <button
                  onClick={() => removeNewItem(index)}
                  className="admin-btn admin-btn-sm admin-btn-danger"
                  style={{ marginTop: 8 }}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button onClick={addNewItem} className="admin-btn admin-btn-outline" style={{ marginTop: 12 }}>
          + New Item
        </button>
      </section>

      {/* ── Save Button ── */}
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
  );
}
