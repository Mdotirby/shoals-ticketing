"use client";

import { useEffect, useState, useCallback } from "react";
import { getCookie } from "@/lib/cookies";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import Link from "next/link";
import type {
  FWBConfig,
  FWBReward,
  FWBTierPerk,
  FWBAnalytics,
  FWBTier,
  FWBRewardType,
} from "@/lib/types/fwb";
import { TIER_LABELS, TIER_ORDER } from "@/lib/types/fwb";

// ── Constants ───────────────────────────────────────────────────────────────

type TabKey = "overview" | "rewards" | "tier-perks" | "config" | "analytics";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "rewards", label: "Benefits Vault" },
  { key: "tier-perks", label: "Tier Perks" },
  { key: "config", label: "Configuration" },
  { key: "analytics", label: "Analytics" },
];

const TIER_COLORS: Record<FWBTier, string> = {
  casual_friend: "#9ca3af",
  close_friend: "#60a5fa",
  inner_circle: "#a78bfa",
  after_hours: "#fbbf24",
  ride_or_die: "#f87171",
};

const TIER_BG: Record<FWBTier, string> = {
  casual_friend: "rgba(156,163,175,0.15)",
  close_friend: "rgba(96,165,250,0.15)",
  inner_circle: "rgba(167,139,250,0.15)",
  after_hours: "rgba(251,191,36,0.15)",
  ride_or_die: "rgba(248,113,113,0.15)",
};

const REWARD_TYPE_COLORS: Record<FWBRewardType, { bg: string; text: string }> = {
  ticket: { bg: "rgba(96,165,250,0.2)", text: "#60a5fa" },
  bar_tab: { bg: "rgba(167,139,250,0.2)", text: "#a78bfa" },
  hotel: { bg: "rgba(251,191,36,0.2)", text: "#fbbf24" },
  merch: { bg: "rgba(74,222,128,0.2)", text: "#4ade80" },
  experience: { bg: "rgba(244,114,182,0.2)", text: "#f472b6" },
};

const REWARD_TYPES: FWBRewardType[] = ["ticket", "bar_tab", "hotel", "merch", "experience"];

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getAuthHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowser();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token || "";
  const venueId = getCookie("venue-id") || "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "x-venue-id": venueId,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function FWBAdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Data states
  const [analytics, setAnalytics] = useState<FWBAnalytics | null>(null);
  const [config, setConfig] = useState<FWBConfig | null>(null);
  const [rewards, setRewards] = useState<FWBReward[]>([]);
  const [tierPerks, setTierPerks] = useState<Record<string, FWBTierPerk[]>>({});


  // Modal/form states
  const [showRewardForm, setShowRewardForm] = useState(false);
  const [editingReward, setEditingReward] = useState<FWBReward | null>(null);
  const [showPerkForm, setShowPerkForm] = useState<FWBTier | null>(null);
  const [editingPerk, setEditingPerk] = useState<FWBTierPerk | null>(null);

  // Config editing
  const [configForm, setConfigForm] = useState<Partial<FWBConfig>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  // Balance adjustment
  const [adjustWalletId, setAdjustWalletId] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  const role = getCookie("user-role");

  // ── Auth guard ──────────────────────────────────────────────────────────
  if (role !== "owner") {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">Access Denied</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>
          You do not have permission to access the FWB Loyalty Engine.
        </p>
      </div>
    );
  }

  // ── Data loaders ────────────────────────────────────────────────────────

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const loadAnalytics = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/fwb/admin/analytics", { headers });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
      /* analytics load failure is non-critical */
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const loadConfig = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/fwb/admin/config", { headers });
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        setConfigForm(data);
      }
    } catch {
      /* config load failure is non-critical */
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const loadRewards = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/fwb/admin/rewards", { headers });
      if (res.ok) {
        const data = await res.json();
        setRewards(Array.isArray(data) ? data : []);
      }
    } catch {
      /* rewards load failure is non-critical */
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const loadTierPerks = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/fwb/admin/tier-perks", { headers });
      if (res.ok) {
        const data = await res.json();
        setTierPerks(data || {});
      }
    } catch {
      /* tier perks load failure is non-critical */
    }
  }, []);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError("");
      try {
        await Promise.all([loadAnalytics(), loadConfig(), loadRewards(), loadTierPerks()]);
      } catch {
        setError("Failed to load FWB data. Please refresh.");
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [loadAnalytics, loadConfig, loadRewards, loadTierPerks]);

  // ── Status message auto-clear ───────────────────────────────────────────

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(""), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(""), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ── Reward CRUD ─────────────────────────────────────────────────────────

  const handleSaveReward = async (formData: Record<string, unknown>) => {
    try {
      const headers = await getAuthHeaders();
      if (editingReward) {
        const res = await fetch(`/api/fwb/admin/rewards/${editingReward.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update reward");
        }
        setSuccess("Reward updated successfully.");
      } else {
        const res = await fetch("/api/fwb/admin/rewards", {
          method: "POST",
          headers,
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create reward");
        }
        setSuccess("Reward created successfully.");
      }
      setShowRewardForm(false);
      setEditingReward(null);
      await loadRewards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDeactivateReward = async (reward: FWBReward) => {
    if (!confirm(`Deactivate "${reward.reward_name}"? This will hide it from members.`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/fwb/admin/rewards/${reward.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to deactivate reward");
      }
      setSuccess("Reward deactivated.");
      await loadRewards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivation failed");
    }
  };

  const handleReactivateReward = async (reward: FWBReward) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/fwb/admin/rewards/${reward.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ is_active: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reactivate reward");
      }
      setSuccess("Reward reactivated.");
      await loadRewards();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reactivation failed");
    }
  };

  // ── Tier Perk CRUD ──────────────────────────────────────────────────────

  const handleSavePerk = async (tier: FWBTier, formData: Record<string, unknown>) => {
    try {
      const headers = await getAuthHeaders();
      if (editingPerk) {
        const res = await fetch(`/api/fwb/admin/tier-perks/${editingPerk.id}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(formData),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update perk");
        }
        setSuccess("Perk updated.");
      } else {
        const res = await fetch("/api/fwb/admin/tier-perks", {
          method: "POST",
          headers,
          body: JSON.stringify({ tier, ...formData }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create perk");
        }
        setSuccess("Perk added.");
      }
      setShowPerkForm(null);
      setEditingPerk(null);
      await loadTierPerks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDeletePerk = async (perk: FWBTierPerk) => {
    if (!confirm(`Delete perk "${perk.perk_name}"?`)) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/fwb/admin/tier-perks/${perk.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete perk");
      }
      setSuccess("Perk deleted.");
      await loadTierPerks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // ── Config save ─────────────────────────────────────────────────────────

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const body: Record<string, unknown> = {};
      if (configForm.earn_rate_per_dollar !== undefined) body.earn_rate_per_dollar = Number(configForm.earn_rate_per_dollar);
      if (configForm.streak_3_multiplier !== undefined) body.streak_3_multiplier = Number(configForm.streak_3_multiplier);
      if (configForm.streak_5_multiplier !== undefined) body.streak_5_multiplier = Number(configForm.streak_5_multiplier);
      if (configForm.tier_casual_max !== undefined) body.tier_casual_max = Number(configForm.tier_casual_max);
      if (configForm.tier_close_max !== undefined) body.tier_close_max = Number(configForm.tier_close_max);
      if (configForm.tier_inner_max !== undefined) body.tier_inner_max = Number(configForm.tier_inner_max);
      if (configForm.tier_after_hours_max !== undefined) body.tier_after_hours_max = Number(configForm.tier_after_hours_max);
      if (configForm.expiration_months !== undefined) body.expiration_months = Number(configForm.expiration_months);
      if (configForm.streak_reset_days !== undefined) body.streak_reset_days = Number(configForm.streak_reset_days);

      const res = await fetch("/api/fwb/admin/config", {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save config");
      }
      const updated = await res.json();
      setConfig(updated);
      setConfigForm(updated);
      setSuccess("Configuration saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingConfig(false);
    }
  };

  // ── Balance adjustment ──────────────────────────────────────────────────

  const handleAdjustBalance = async () => {
    if (!adjustWalletId.trim() || !adjustAmount || !adjustDescription.trim()) {
      setError("Wallet ID, amount, and description are required.");
      return;
    }
    const amount = parseFloat(adjustAmount);
    if (isNaN(amount) || amount === 0) {
      setError("Amount must be a non-zero number.");
      return;
    }
    setAdjusting(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/fwb/admin/adjust-balance", {
        method: "POST",
        headers,
        body: JSON.stringify({
          wallet_id: adjustWalletId.trim(),
          amount,
          description: adjustDescription.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Adjustment failed");
      }
      setSuccess(`Balance adjusted by ${amount > 0 ? "+" : ""}${amount} benefits.`);
      setAdjustWalletId("");
      setAdjustAmount("");
      setAdjustDescription("");
      await loadAnalytics();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed");
    } finally {
      setAdjusting(false);
    }
  };

  // ── Loading state ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="admin-form-page">
        <h1 className="admin-page-title">FWB Loyalty Engine</h1>
        <p style={{ color: "rgba(255,255,255,0.5)" }}>Loading…</p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="admin-form-page">
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <Link href="/admin/marketing" style={{ color: "rgba(208,194,144,0.7)", textDecoration: "none", fontSize: 13 }}>
          ← Marketing Hub
        </Link>
      </div>

      <h1 className="admin-page-title">FWB Loyalty Engine</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", marginBottom: 20 }}>
        Manage your Friends With Benefits loyalty program — rewards, tiers, perks, and analytics.
      </p>

      {/* Status messages */}
      {error && <div className="admin-form-error">{error}</div>}
      {success && <div className="admin-form-success">{success}</div>}

      {/* Tab Navigation */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 24,
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        overflowX: "auto",
        paddingBottom: 0,
      }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color: activeTab === tab.key ? "#d0c290" : "rgba(255,255,255,0.5)",
              background: activeTab === tab.key ? "rgba(208,194,144,0.1)" : "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid #d0c290" : "2px solid transparent",
              borderRadius: "6px 6px 0 0",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "all 150ms ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "overview" && (
        <OverviewTab
          analytics={analytics}
          adjustWalletId={adjustWalletId}
          setAdjustWalletId={setAdjustWalletId}
          adjustAmount={adjustAmount}
          setAdjustAmount={setAdjustAmount}
          adjustDescription={adjustDescription}
          setAdjustDescription={setAdjustDescription}
          adjusting={adjusting}
          onAdjustBalance={handleAdjustBalance}
        />
      )}
      {activeTab === "rewards" && (
        <RewardsTab
          rewards={rewards}
          showRewardForm={showRewardForm}
          setShowRewardForm={setShowRewardForm}
          editingReward={editingReward}
          setEditingReward={setEditingReward}
          onSaveReward={handleSaveReward}
          onDeactivateReward={handleDeactivateReward}
          onReactivateReward={handleReactivateReward}
        />
      )}
      {activeTab === "tier-perks" && (
        <TierPerksTab
          tierPerks={tierPerks}
          showPerkForm={showPerkForm}
          setShowPerkForm={setShowPerkForm}
          editingPerk={editingPerk}
          setEditingPerk={setEditingPerk}
          onSavePerk={handleSavePerk}
          onDeletePerk={handleDeletePerk}
        />
      )}
      {activeTab === "config" && (
        <ConfigTab
          config={config}
          configForm={configForm}
          setConfigForm={setConfigForm}
          saving={savingConfig}
          onSave={handleSaveConfig}
        />
      )}
      {activeTab === "analytics" && (
        <AnalyticsTab analytics={analytics} />
      )}
    </div>
  );
}

// ============================================================================
// Tab 1: Overview
// ============================================================================

function OverviewTab({
  analytics,
  adjustWalletId,
  setAdjustWalletId,
  adjustAmount,
  setAdjustAmount,
  adjustDescription,
  setAdjustDescription,
  adjusting,
  onAdjustBalance,
}: {
  analytics: FWBAnalytics | null;
  adjustWalletId: string;
  setAdjustWalletId: (v: string) => void;
  adjustAmount: string;
  setAdjustAmount: (v: string) => void;
  adjustDescription: string;
  setAdjustDescription: (v: string) => void;
  adjusting: boolean;
  onAdjustBalance: () => void;
}) {
  const totalMembers = analytics?.total_members ?? 0;
  const outstanding = analytics?.total_benefits_outstanding ?? 0;
  const avgBenefits = totalMembers > 0 ? Math.round(outstanding / totalMembers) : 0;
  const redemptionRate = analytics?.redemption_rate ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Stats Cards */}
      <div className="admin-stats-grid">
        <StatCard label="Total Members" value={totalMembers.toLocaleString()} />
        <StatCard label="Benefits Outstanding" value={outstanding.toLocaleString()} />
        <StatCard label="Avg Benefits/Member" value={avgBenefits.toLocaleString()} />
        <StatCard label="Redemption Rate" value={`${(redemptionRate * 100).toFixed(1)}%`} />
      </div>

      {/* Tier Distribution */}
      {analytics?.tier_distribution && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            Tier Distribution
          </h3>
          <TierDistributionChart distribution={analytics.tier_distribution} total={totalMembers} />
        </div>
      )}

      {/* Recent Activity */}
      {analytics?.monthly_earn_trend && analytics.monthly_earn_trend.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            Monthly Earn Trend
          </h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {analytics.monthly_earn_trend.map((m) => (
              <div key={m.month} style={{
                background: "rgba(208,194,144,0.08)",
                borderRadius: 8,
                padding: "8px 14px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 2 }}>{m.month}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#d0c290" }}>{m.benefits_earned.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Popular Rewards */}
      {analytics?.popular_rewards && analytics.popular_rewards.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            Popular Rewards
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {analytics.popular_rewards.map((r, i) => (
              <div key={r.reward_id} style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 6,
              }}>
                <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 13 }}>
                  <span style={{ color: "#d0c290", fontWeight: 600, marginRight: 8 }}>#{i + 1}</span>
                  {r.reward_name}
                </span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>{r.redemption_count} redemptions</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Balance Adjustment */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
          Manual Balance Adjustment
        </h3>
        <div className="admin-form-grid" style={{ maxWidth: 600 }}>
          <label className="admin-form-label">
            Wallet ID
            <input
              type="text"
              className="admin-form-input"
              value={adjustWalletId}
              onChange={(e) => setAdjustWalletId(e.target.value)}
              placeholder="Enter wallet UUID"
            />
          </label>
          <label className="admin-form-label">
            Amount (+/-)
            <input
              type="number"
              className="admin-form-input"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              placeholder="e.g. 50 or -25"
              step="1"
            />
          </label>
          <label className="admin-form-label admin-form-full">
            Description
            <input
              type="text"
              className="admin-form-input"
              value={adjustDescription}
              onChange={(e) => setAdjustDescription(e.target.value)}
              placeholder="Reason for adjustment"
            />
          </label>
        </div>
        <button
          className="admin-form-submit"
          style={{ marginTop: 12 }}
          onClick={onAdjustBalance}
          disabled={adjusting}
        >
          {adjusting ? "Adjusting…" : "Adjust Balance"}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Tab 2: Benefits Vault (Rewards)
// ============================================================================

function RewardsTab({
  rewards,
  showRewardForm,
  setShowRewardForm,
  editingReward,
  setEditingReward,
  onSaveReward,
  onDeactivateReward,
  onReactivateReward,
}: {
  rewards: FWBReward[];
  showRewardForm: boolean;
  setShowRewardForm: (v: boolean) => void;
  editingReward: FWBReward | null;
  setEditingReward: (v: FWBReward | null) => void;
  onSaveReward: (data: Record<string, unknown>) => void;
  onDeactivateReward: (r: FWBReward) => void;
  onReactivateReward: (r: FWBReward) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div className="admin-page-header">
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
          Rewards ({rewards.length})
        </h2>
        <button
          className="admin-header-btn"
          onClick={() => {
            setEditingReward(null);
            setShowRewardForm(true);
          }}
        >
          + Create Reward
        </button>
      </div>

      {/* Modal Form */}
      {showRewardForm && (
        <RewardForm
          reward={editingReward}
          onSave={onSaveReward}
          onCancel={() => {
            setShowRewardForm(false);
            setEditingReward(null);
          }}
        />
      )}

      {/* Rewards Table */}
      {rewards.length === 0 ? (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
          No rewards created yet. Click "Create Reward" to get started.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Cost</Th>
                <Th>Inventory</Th>
                <Th>Min Tier</Th>
                <Th>Expires</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rewards.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <Td>
                    <span style={{ fontWeight: 500, color: "rgba(255,255,255,0.85)" }}>{r.reward_name}</span>
                    {r.description && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{r.description}</div>
                    )}
                  </Td>
                  <Td>
                    <RewardTypeBadge type={r.reward_type} />
                  </Td>
                  <Td>
                    <span style={{ color: "#d0c290", fontWeight: 600 }}>{r.reward_cost_in_benefits}</span>
                  </Td>
                  <Td>
                    {r.inventory_limit ? (
                      <span>
                        <span style={{ color: r.inventory_remaining === 0 ? "#f87171" : "rgba(255,255,255,0.7)" }}>
                          {r.inventory_remaining ?? 0}
                        </span>
                        <span style={{ color: "rgba(255,255,255,0.3)" }}> / {r.inventory_limit}</span>
                      </span>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.3)" }}>Unlimited</span>
                    )}
                  </Td>
                  <Td>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      background: TIER_BG[r.min_tier],
                      color: TIER_COLORS[r.min_tier],
                    }}>
                      {TIER_LABELS[r.min_tier]}
                    </span>
                  </Td>
                  <Td>{formatDate(r.expiration_date)}</Td>
                  <Td>
                    <span style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 500,
                      background: r.is_active ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                      color: r.is_active ? "#4ade80" : "#f87171",
                    }}>
                      {r.is_active ? "Active" : "Inactive"}
                    </span>
                  </Td>
                  <Td>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => {
                          setEditingReward(r);
                          setShowRewardForm(true);
                        }}
                        style={{
                          padding: "4px 10px",
                          fontSize: 11,
                          background: "rgba(208,194,144,0.1)",
                          border: "1px solid rgba(208,194,144,0.2)",
                          color: "#d0c290",
                          borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        Edit
                      </button>
                      {r.is_active ? (
                        <button
                          onClick={() => onDeactivateReward(r)}
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            background: "rgba(248,113,113,0.1)",
                            border: "1px solid rgba(248,113,113,0.2)",
                            color: "#f87171",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          onClick={() => onReactivateReward(r)}
                          style={{
                            padding: "4px 10px",
                            fontSize: 11,
                            background: "rgba(74,222,128,0.1)",
                            border: "1px solid rgba(74,222,128,0.2)",
                            color: "#4ade80",
                            borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Reward Form ─────────────────────────────────────────────────────────────

function RewardForm({
  reward,
  onSave,
  onCancel,
}: {
  reward: FWBReward | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(reward?.reward_name || "");
  const [type, setType] = useState<FWBRewardType>(reward?.reward_type || "ticket");
  const [cost, setCost] = useState(reward?.reward_cost_in_benefits?.toString() || "");
  const [inventory, setInventory] = useState(reward?.inventory_limit?.toString() || "");
  const [expiration, setExpiration] = useState(reward?.expiration_date?.split("T")[0] || "");
  const [description, setDescription] = useState(reward?.description || "");
  const [minTier, setMinTier] = useState<FWBTier>(reward?.min_tier || "casual_friend");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !cost) return;
    setSaving(true);
    await onSave({
      reward_name: name.trim(),
      reward_type: type,
      reward_cost_in_benefits: parseInt(cost),
      inventory_limit: inventory ? parseInt(inventory) : null,
      expiration_date: expiration || null,
      description: description.trim() || null,
      min_tier: minTier,
    });
    setSaving(false);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 10,
      padding: 20,
    }}>
      <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
        {reward ? "Edit Reward" : "Create Reward"}
      </h3>
      <form onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            Reward Name *
            <input
              type="text"
              className="admin-form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Free Drink Voucher"
              required
            />
          </label>
          <label className="admin-form-label">
            Reward Type *
            <select
              className="admin-form-input"
              value={type}
              onChange={(e) => setType(e.target.value as FWBRewardType)}
            >
              {REWARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form-label">
            Cost (Benefits) *
            <input
              type="number"
              className="admin-form-input"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="e.g. 100"
              min="1"
              required
            />
          </label>
          <label className="admin-form-label">
            Inventory Limit
            <input
              type="number"
              className="admin-form-input"
              value={inventory}
              onChange={(e) => setInventory(e.target.value)}
              placeholder="Leave blank for unlimited"
              min="0"
            />
          </label>
          <label className="admin-form-label">
            Minimum Tier
            <select
              className="admin-form-input"
              value={minTier}
              onChange={(e) => setMinTier(e.target.value as FWBTier)}
            >
              {TIER_ORDER.map((t) => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className="admin-form-label">
            Expiration Date
            <input
              type="date"
              className="admin-form-input"
              value={expiration}
              onChange={(e) => setExpiration(e.target.value)}
            />
          </label>
          <label className="admin-form-label admin-form-full">
            Description
            <textarea
              className="admin-form-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the reward"
              rows={2}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="submit" className="admin-form-submit" disabled={saving}>
            {saving ? "Saving…" : reward ? "Update Reward" : "Create Reward"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "8px 18px",
              fontSize: 13,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Tab 3: Tier Perks
// ============================================================================

function TierPerksTab({
  tierPerks,
  showPerkForm,
  setShowPerkForm,
  editingPerk,
  setEditingPerk,
  onSavePerk,
  onDeletePerk,
}: {
  tierPerks: Record<string, FWBTierPerk[]>;
  showPerkForm: FWBTier | null;
  setShowPerkForm: (v: FWBTier | null) => void;
  editingPerk: FWBTierPerk | null;
  setEditingPerk: (v: FWBTierPerk | null) => void;
  onSavePerk: (tier: FWBTier, data: Record<string, unknown>) => void;
  onDeletePerk: (perk: FWBTierPerk) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {TIER_ORDER.map((tier) => {
        const perks = tierPerks[tier] || [];
        const color = TIER_COLORS[tier];
        const bg = TIER_BG[tier];

        return (
          <div
            key={tier}
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${bg.replace("0.15", "0.3")}`,
              borderRadius: 10,
              padding: 20,
            }}
          >
            {/* Tier Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  display: "inline-block",
                }} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color }}>
                  {TIER_LABELS[tier]}
                </h3>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                  {perks.length} perk{perks.length !== 1 ? "s" : ""}
                </span>
              </div>
              <button
                onClick={() => {
                  setEditingPerk(null);
                  setShowPerkForm(tier);
                }}
                style={{
                  padding: "4px 12px",
                  fontSize: 11,
                  background: bg,
                  border: `1px solid ${color}33`,
                  color,
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                + Add Perk
              </button>
            </div>

            {/* Perk Form (inline) */}
            {showPerkForm === tier && (
              <PerkForm
                perk={editingPerk}
                tier={tier}
                onSave={(data) => onSavePerk(tier, data)}
                onCancel={() => {
                  setShowPerkForm(null);
                  setEditingPerk(null);
                }}
              />
            )}

            {/* Perks List */}
            {perks.length === 0 && showPerkForm !== tier && (
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, margin: 0 }}>
                No perks defined for this tier.
              </p>
            )}
            {perks.map((perk) => (
              <div
                key={perk.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "rgba(255,255,255,0.02)",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              >
                <div>
                  <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: 500 }}>
                    {perk.perk_name}
                  </div>
                  {perk.perk_description && (
                    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 2 }}>
                      {perk.perk_description}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setEditingPerk(perk);
                      setShowPerkForm(tier);
                    }}
                    style={{
                      padding: "3px 8px",
                      fontSize: 11,
                      background: "rgba(208,194,144,0.1)",
                      border: "1px solid rgba(208,194,144,0.2)",
                      color: "#d0c290",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onDeletePerk(perk)}
                    style={{
                      padding: "3px 8px",
                      fontSize: 11,
                      background: "rgba(248,113,113,0.1)",
                      border: "1px solid rgba(248,113,113,0.2)",
                      color: "#f87171",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Perk Form ───────────────────────────────────────────────────────────────

function PerkForm({
  perk,
  tier,
  onSave,
  onCancel,
}: {
  perk: FWBTierPerk | null;
  tier: FWBTier;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(perk?.perk_name || "");
  const [description, setDescription] = useState(perk?.perk_description || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    await onSave({
      perk_name: name.trim(),
      perk_description: description.trim() || null,
    });
    setSaving(false);
  };

  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 8,
      padding: 14,
      marginBottom: 12,
    }}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="admin-form-label" style={{ flex: 1, minWidth: 180 }}>
            Perk Name *
            <input
              type="text"
              className="admin-form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`e.g. Priority entry for ${TIER_LABELS[tier]}`}
              required
            />
          </label>
          <label className="admin-form-label" style={{ flex: 2, minWidth: 200 }}>
            Description
            <input
              type="text"
              className="admin-form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" className="admin-form-submit" style={{ padding: "8px 14px", fontSize: 12 }} disabled={saving}>
              {saving ? "Saving…" : perk ? "Update" : "Add"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.6)",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Tab 4: Configuration
// ============================================================================

function ConfigTab({
  config,
  configForm,
  setConfigForm,
  saving,
  onSave,
}: {
  config: FWBConfig | null;
  configForm: Partial<FWBConfig>;
  setConfigForm: (v: Partial<FWBConfig>) => void;
  saving: boolean;
  onSave: () => void;
}) {
  if (!config) {
    return (
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
        No configuration found. Saving will create one with default values.
      </div>
    );
  }

  const updateField = (field: keyof FWBConfig, value: string) => {
    setConfigForm({ ...configForm, [field]: value });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Earn Settings */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
          Earn Settings
        </h3>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            Earn Rate (per dollar spent)
            <input
              type="number"
              className="admin-form-input"
              value={configForm.earn_rate_per_dollar ?? ""}
              onChange={(e) => updateField("earn_rate_per_dollar", e.target.value)}
              step="0.1"
              min="0"
            />
          </label>
          <label className="admin-form-label">
            Expiration (months)
            <input
              type="number"
              className="admin-form-input"
              value={configForm.expiration_months ?? ""}
              onChange={(e) => updateField("expiration_months", e.target.value)}
              min="1"
            />
          </label>
        </div>
      </div>

      {/* Streak Settings */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
          Streak Settings
        </h3>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            3-Event Streak Multiplier
            <input
              type="number"
              className="admin-form-input"
              value={configForm.streak_3_multiplier ?? ""}
              onChange={(e) => updateField("streak_3_multiplier", e.target.value)}
              step="0.1"
              min="1"
            />
          </label>
          <label className="admin-form-label">
            5-Event Streak Multiplier
            <input
              type="number"
              className="admin-form-input"
              value={configForm.streak_5_multiplier ?? ""}
              onChange={(e) => updateField("streak_5_multiplier", e.target.value)}
              step="0.1"
              min="1"
            />
          </label>
          <label className="admin-form-label">
            Streak Reset (days)
            <input
              type="number"
              className="admin-form-input"
              value={configForm.streak_reset_days ?? ""}
              onChange={(e) => updateField("streak_reset_days", e.target.value)}
              min="1"
            />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>
              Days without attending before streak resets
            </span>
          </label>
        </div>
      </div>

      {/* Tier Thresholds */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
          Tier Thresholds (Lifetime Benefits)
        </h3>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", margin: "-8px 0 16px" }}>
          Each value is the maximum lifetime benefits for that tier. Exceeding it promotes to the next tier.
        </p>
        <div className="admin-form-grid">
          <label className="admin-form-label">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLORS.casual_friend }} />
              Casual Friend Max
            </span>
            <input
              type="number"
              className="admin-form-input"
              value={configForm.tier_casual_max ?? ""}
              onChange={(e) => updateField("tier_casual_max", e.target.value)}
              min="0"
            />
          </label>
          <label className="admin-form-label">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLORS.close_friend }} />
              Close Friend Max
            </span>
            <input
              type="number"
              className="admin-form-input"
              value={configForm.tier_close_max ?? ""}
              onChange={(e) => updateField("tier_close_max", e.target.value)}
              min="0"
            />
          </label>
          <label className="admin-form-label">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLORS.inner_circle }} />
              Inner Circle Max
            </span>
            <input
              type="number"
              className="admin-form-input"
              value={configForm.tier_inner_max ?? ""}
              onChange={(e) => updateField("tier_inner_max", e.target.value)}
              min="0"
            />
          </label>
          <label className="admin-form-label">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: TIER_COLORS.after_hours }} />
              After Hours Max
            </span>
            <input
              type="number"
              className="admin-form-input"
              value={configForm.tier_after_hours_max ?? ""}
              onChange={(e) => updateField("tier_after_hours_max", e.target.value)}
              min="0"
            />
          </label>
        </div>
      </div>

      <button className="admin-form-submit" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save Configuration"}
      </button>
    </div>
  );
}

// ============================================================================
// Tab 5: Analytics
// ============================================================================

function AnalyticsTab({ analytics }: { analytics: FWBAnalytics | null }) {
  if (!analytics) {
    return (
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13 }}>
        No analytics data available yet. Analytics will populate as members earn and redeem benefits.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Key Metrics */}
      <div className="admin-stats-grid">
        <StatCard label="Total Members" value={analytics.total_members.toLocaleString()} />
        <StatCard label="Active Members" value={analytics.active_members.toLocaleString()} />
        <StatCard label="Avg Events/Member" value={analytics.avg_events_per_member.toFixed(1)} />
        <StatCard label="Avg Spend/Member" value={`$${analytics.avg_spend_per_member.toFixed(2)}`} />
      </div>

      <div className="admin-stats-grid">
        <StatCard label="Redemption Rate" value={`${(analytics.redemption_rate * 100).toFixed(1)}%`} />
        <StatCard label="Breakage Rate" value={`${(analytics.breakage_rate * 100).toFixed(1)}%`} />
        <StatCard label="Benefits Outstanding" value={analytics.total_benefits_outstanding.toLocaleString()} />
        <StatCard label="Benefits Redeemed" value={analytics.total_benefits_redeemed.toLocaleString()} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px 14px" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#f87171" }}>{analytics.total_benefits_expired.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>Benefits Expired</div>
        </div>
      </div>

      {/* Tier Distribution */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
          Tier Distribution
        </h3>
        <TierDistributionChart distribution={analytics.tier_distribution} total={analytics.total_members} />
      </div>

      {/* Monthly Earn Trend */}
      {analytics.monthly_earn_trend.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            Monthly Benefits Earned
          </h3>
          <MonthlyBarChart data={analytics.monthly_earn_trend} />
        </div>
      )}

      {/* Popular Rewards */}
      {analytics.popular_rewards.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
            Most Popular Rewards
          </h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <Th>Rank</Th>
                  <Th>Reward</Th>
                  <Th>Redemptions</Th>
                </tr>
              </thead>
              <tbody>
                {analytics.popular_rewards.map((r, i) => (
                  <tr key={r.reward_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <Td>
                      <span style={{ color: "#d0c290", fontWeight: 600 }}>#{i + 1}</span>
                    </Td>
                    <Td>{r.reward_name}</Td>
                    <Td>
                      <span style={{ fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{r.redemption_count}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Shared UI Components
// ============================================================================

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-value">{value}</div>
      <div className="admin-stat-label">{label}</div>
    </div>
  );
}

function TierDistributionChart({ distribution, total }: { distribution: Record<FWBTier, number>; total: number }) {
  const maxCount = Math.max(...TIER_ORDER.map((t) => distribution[t] || 0), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {TIER_ORDER.map((tier) => {
        const count = distribution[tier] || 0;
        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
        const barWidth = maxCount > 0 ? Math.max((count / maxCount) * 100, 2) : 2;

        return (
          <div key={tier} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 110, fontSize: 12, color: TIER_COLORS[tier], fontWeight: 500, flexShrink: 0 }}>
              {TIER_LABELS[tier]}
            </div>
            <div style={{ flex: 1, height: 22, background: "rgba(255,255,255,0.04)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
              <div style={{
                width: `${barWidth}%`,
                height: "100%",
                background: TIER_COLORS[tier],
                borderRadius: 4,
                opacity: 0.6,
                transition: "width 400ms ease",
              }} />
            </div>
            <div style={{ width: 70, fontSize: 12, color: "rgba(255,255,255,0.5)", textAlign: "right", flexShrink: 0 }}>
              {count} ({pct}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyBarChart({ data }: { data: { month: string; benefits_earned: number }[] }) {
  const maxVal = Math.max(...data.map((d) => d.benefits_earned), 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, overflowX: "auto", paddingBottom: 20, position: "relative" }}>
      {data.map((d) => {
        const barHeight = Math.max((d.benefits_earned / maxVal) * 100, 4);
        return (
          <div key={d.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 0 40px", minWidth: 40 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
              {d.benefits_earned.toLocaleString()}
            </div>
            <div style={{
              width: "70%",
              height: `${barHeight}%`,
              background: "linear-gradient(180deg, #d0c290 0%, rgba(208,194,144,0.4) 100%)",
              borderRadius: "4px 4px 0 0",
              minHeight: 4,
            }} />
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginTop: 4, whiteSpace: "nowrap" }}>
              {d.month}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RewardTypeBadge({ type }: { type: FWBRewardType }) {
  const colors = REWARD_TYPE_COLORS[type] || { bg: "rgba(255,255,255,0.1)", text: "rgba(255,255,255,0.6)" };
  return (
    <span style={{
      padding: "2px 8px",
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 500,
      background: colors.bg,
      color: colors.text,
      whiteSpace: "nowrap",
    }}>
      {type.replace("_", " ")}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: "8px 12px",
      textAlign: "left",
      fontSize: 11,
      fontWeight: 600,
      color: "rgba(255,255,255,0.4)",
      textTransform: "uppercase",
      letterSpacing: "0.05em",
    }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td style={{
      padding: "10px 12px",
      color: "rgba(255,255,255,0.7)",
      verticalAlign: "top",
    }}>
      {children}
    </td>
  );
}
