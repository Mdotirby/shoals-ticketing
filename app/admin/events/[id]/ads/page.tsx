"use client";

/**
 * Ad Engine — event-scoped admin dashboard.
 * Minimal MVP UI. Consumes /api/ad-engine/events/[id]/*.
 */
import { use, useCallback, useEffect, useState } from "react";

type Overview = {
  event: { id: string; title: string; venue: string | null; venue_id: string | null; date: string };
  counts: { assets: number; videos: number; hooks: number; creatives: number };
  budget_cap: {
    daily_cap_total: number;
    campaign_cap_total: number;
    scaling_step_pct: number;
  } | null;
  campaigns: Array<{
    id: string;
    name: string;
    platform: string;
    status: string;
    mode: string;
    current_daily_budget: number;
    current_total_spend: number;
    daily_budget_cap: number;
    total_budget_cap: number;
    external_campaign_id: string | null;
  }>;
  overrides: Array<{
    id: string;
    kind: string;
    campaign_id: string | null;
    note: string | null;
    expires_at: string | null;
  }>;
  decisions: Array<{
    id: string;
    created_at: string;
    decision_type: string;
    confidence: string;
    outcome: string;
    reason: string | null;
  }>;
  performance: { totals: { spend: number; impressions: number; clicks: number; conversions: number; revenue: number; ctr: number; cpc: number; cpm: number; roas: number } };
  validation_meta: {
    ready: boolean;
    missing: string[];
    checks: Record<
      string,
      { required?: number; have?: number; ok: boolean }
    >;
  };
};

export default function EventAdsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = use(params);
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/ad-engine/events/${eventId}/overview`, { cache: "no-store" });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [eventId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  /* ── asset / hook / copy ── */
  const addAsset = async (form: FormData) => {
    const res = await fetch(`/api/ad-engine/events/${eventId}/assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: form.get("kind"),
        url: form.get("url"),
        energy: form.get("energy"),
        context: form.get("context"),
        source: form.get("source"),
      }),
    });
    if (res.ok) { flash("asset added"); refresh(); }
    else flash("failed");
  };
  const addHook = async (form: FormData) => {
    const res = await fetch(`/api/ad-engine/events/${eventId}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: form.get("text"), style: form.get("style") }),
    });
    if (res.ok) { flash("hook added"); refresh(); }
  };
  const addCopy = async (form: FormData) => {
    const res = await fetch(`/api/ad-engine/events/${eventId}/copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: form.get("body"),
        cta: form.get("cta"),
        tone: form.get("tone"),
      }),
    });
    if (res.ok) { flash("copy added"); refresh(); }
  };

  const generate = async () => {
    const res = await fetch(`/api/ad-engine/events/${eventId}/creatives/generate`, { method: "POST" });
    const out = await res.json();
    flash(`generated ${out.generated} new creatives (${out.skipped_existing} existing)`);
    refresh();
  };

  const setBudgetCap = async (form: FormData) => {
    await fetch(`/api/ad-engine/events/${eventId}/budget-cap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        daily_cap_total: Number(form.get("daily")),
        campaign_cap_total: Number(form.get("total")),
      }),
    });
    flash("budget cap saved");
    refresh();
  };

  const launch = async (form: FormData) => {
    const creatives: string[] = [];
    (form.getAll("creative_ids") ?? []).forEach((v) => creatives.push(String(v)));
    const res = await fetch(`/api/ad-engine/events/${eventId}/campaigns`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: form.get("platform"),
        name: form.get("name"),
        mode: form.get("mode"),
        daily_budget: Number(form.get("daily_budget")),
        total_budget: Number(form.get("total_budget")),
        creative_ids: creatives,
        launch: form.get("launch") === "on",
      }),
    });
    const out = await res.json();
    flash(out.ok ? "campaign created" : `blocked: ${out.reason}`);
    refresh();
  };

  const addOverride = async (
    kind: "freeze_campaign" | "disable_optimization" | "lock_budget",
    campaign_id: string | null
  ) => {
    await fetch(`/api/ad-engine/events/${eventId}/overrides`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, campaign_id }),
    });
    flash(`override set: ${kind}`);
    refresh();
  };
  const clearOverride = async (id: string) => {
    await fetch(`/api/ad-engine/events/${eventId}/overrides?id=${id}`, { method: "DELETE" });
    flash("override cleared");
    refresh();
  };

  const pauseCampaign = async (cid: string) => {
    await fetch(`/api/ad-engine/campaigns/${cid}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    flash("campaign paused");
    refresh();
  };
  const resumeCampaign = async (cid: string) => {
    await fetch(`/api/ad-engine/campaigns/${cid}/control`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
    flash("campaign resumed");
    refresh();
  };

  if (loading || !data) return <div style={{ padding: 24 }}>Loading…</div>;

  const checks = data.validation_meta.checks;

  return (
    <div style={{ maxWidth: 1200, padding: 24, color: "#eee" }}>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Ad Engine — {data.event.title}</h1>
      <div style={{ opacity: 0.6, fontSize: 13, marginBottom: 16 }}>
        {data.event.venue ?? "—"} · {new Date(data.event.date).toLocaleDateString()}
      </div>

      {toast && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "#1a2233", borderRadius: 6, fontSize: 13 }}>
          {toast}
        </div>
      )}

      {/* VALIDATION STATUS */}
      <Card title="Pre-launch Validation (Meta)">
        <Pill ok={data.validation_meta.ready}>
          {data.validation_meta.ready ? "READY TO LAUNCH" : "NOT READY"}
        </Pill>
        <ul style={{ fontSize: 13, marginTop: 10, lineHeight: 1.6 }}>
          <li>Creatives: {data.counts.creatives} / {(checks.creatives as { required?: number }).required ?? 3} {checks.creatives.ok ? "✓" : "✗"}</li>
          <li>Videos: {data.counts.videos} / {(checks.videos as { required?: number }).required ?? 1} {checks.videos.ok ? "✓" : "✗"}</li>
          <li>Hooks: {data.counts.hooks} / {(checks.hooks as { required?: number }).required ?? 2} {checks.hooks.ok ? "✓" : "✗"}</li>
          <li>Budget cap set: {checks.budget_cap_set?.ok ? "✓" : "✗"}</li>
          <li>Meta identity: {checks.identity_selected?.ok ? "✓" : "✗"}</li>
        </ul>
      </Card>

      {/* BUDGET CAPS */}
      <Card title="Budget Caps (hard walls)">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBudgetCap(new FormData(e.currentTarget));
          }}
          style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}
        >
          <Input label="Daily cap ($)" name="daily" defaultValue={data.budget_cap?.daily_cap_total ?? 50} type="number" />
          <Input label="Total cap ($)" name="total" defaultValue={data.budget_cap?.campaign_cap_total ?? 2000} type="number" />
          <Btn>Save caps</Btn>
        </form>
      </Card>

      {/* ASSETS */}
      <Card title={`Assets (${data.counts.assets})`}>
        <form onSubmit={(e) => { e.preventDefault(); addAsset(new FormData(e.currentTarget)); (e.currentTarget as HTMLFormElement).reset(); }} style={grid}>
          <Input label="URL" name="url" required />
          <Select label="Kind" name="kind" options={["image","video"]} />
          <Select label="Energy" name="energy" options={["low","medium","high"]} defaultValue="medium" />
          <Select label="Context" name="context" options={["crowd","performance","venue","promo","behind_scenes","other"]} defaultValue="other" />
          <Select label="Source" name="source" options={["in_house","artist","upload","stock"]} defaultValue="upload" />
          <Btn>Add asset</Btn>
        </form>
      </Card>

      {/* HOOKS + COPY */}
      <Card title={`Hooks (${data.counts.hooks})`}>
        <form onSubmit={(e) => { e.preventDefault(); addHook(new FormData(e.currentTarget)); (e.currentTarget as HTMLFormElement).reset(); }} style={grid}>
          <Input label="Hook text" name="text" required />
          <Select label="Style" name="style" options={["urgency","fomo","social_proof","value","neutral"]} defaultValue="neutral" />
          <Btn>Add hook</Btn>
        </form>
      </Card>

      <Card title="Copy variants">
        <form onSubmit={(e) => { e.preventDefault(); addCopy(new FormData(e.currentTarget)); (e.currentTarget as HTMLFormElement).reset(); }} style={grid}>
          <Input label="Body" name="body" required />
          <Input label="CTA" name="cta" defaultValue="Get Tickets" />
          <Select label="Tone" name="tone" options={["hype","classy","casual","raw"]} defaultValue="hype" />
          <Btn>Add copy</Btn>
        </form>
      </Card>

      <Card title={`Creatives (${data.counts.creatives})`}>
        <button onClick={generate} style={btnStyle}>Generate creatives (asset × hook × copy)</button>
      </Card>

      {/* CAMPAIGNS */}
      <Card title="Launch a campaign">
        <form onSubmit={(e) => { e.preventDefault(); launch(new FormData(e.currentTarget)); }} style={grid}>
          <Input label="Name" name="name" required />
          <Select label="Platform" name="platform" options={["meta","snapchat"]} />
          <Select label="Mode" name="mode" options={["efficiency","volume","manual"]} defaultValue="efficiency" />
          <Input label="Daily budget ($)" name="daily_budget" type="number" defaultValue="25" />
          <Input label="Total budget ($)" name="total_budget" type="number" defaultValue="500" />
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" name="launch" /> Launch immediately
          </label>
          <Btn disabled={!data.validation_meta.ready}>Create</Btn>
        </form>
        {!data.validation_meta.ready && (
          <div style={{ fontSize: 12, marginTop: 8, color: "#f66" }}>
            Cannot launch until pre-launch checks pass: {data.validation_meta.missing.join("; ")}
          </div>
        )}
      </Card>

      <Card title="Active campaigns">
        {data.campaigns.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>None yet.</div>}
        {data.campaigns.map((c) => (
          <div key={c.id} style={row}>
            <div style={{ flex: 1 }}>
              <strong>{c.name}</strong>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {c.platform} · {c.mode} · status: <Pill ok={c.status === "active"}>{c.status}</Pill>
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                daily ${c.current_daily_budget} / cap ${c.daily_budget_cap} · spent ${c.current_total_spend}/${c.total_budget_cap}
              </div>
            </div>
            {c.status === "active" ? (
              <button style={btnSmall} onClick={() => pauseCampaign(c.id)}>Pause</button>
            ) : (
              <button style={btnSmall} onClick={() => resumeCampaign(c.id)}>Resume</button>
            )}
            <button style={btnSmall} onClick={() => addOverride("freeze_campaign", c.id)}>Freeze</button>
            <button style={btnSmall} onClick={() => addOverride("disable_optimization", c.id)}>Disable opt</button>
            <button style={btnSmall} onClick={() => addOverride("lock_budget", c.id)}>Lock budget</button>
          </div>
        ))}
      </Card>

      <Card title="Overrides (human kill-switches)">
        {data.overrides.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>None active.</div>}
        {data.overrides.map((o) => (
          <div key={o.id} style={row}>
            <div style={{ flex: 1 }}>
              <strong>{o.kind}</strong>{o.campaign_id ? ` · campaign ${o.campaign_id.slice(0, 8)}` : ""}
              {o.note && <div style={{ fontSize: 12, opacity: 0.6 }}>{o.note}</div>}
            </div>
            <button style={btnSmall} onClick={() => clearOverride(o.id)}>Clear</button>
          </div>
        ))}
      </Card>

      {/* PERFORMANCE */}
      <Card title="Performance (aggregated)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 12, fontSize: 13 }}>
          <Stat label="Spend" value={`$${data.performance.totals.spend.toFixed(2)}`} />
          <Stat label="Impressions" value={data.performance.totals.impressions.toLocaleString()} />
          <Stat label="Clicks" value={data.performance.totals.clicks.toLocaleString()} />
          <Stat label="Conversions" value={data.performance.totals.conversions.toLocaleString()} />
          <Stat label="Revenue" value={`$${data.performance.totals.revenue.toFixed(2)}`} />
          <Stat label="CTR" value={(data.performance.totals.ctr * 100).toFixed(2) + "%"} />
          <Stat label="CPC" value={`$${data.performance.totals.cpc.toFixed(2)}`} />
          <Stat label="CPM" value={`$${data.performance.totals.cpm.toFixed(2)}`} />
          <Stat label="ROAS" value={data.performance.totals.roas.toFixed(2) + "x"} />
        </div>
      </Card>

      <Card title="Recent optimization decisions">
        {data.decisions.length === 0 && <div style={{ opacity: 0.5, fontSize: 13 }}>None yet.</div>}
        {data.decisions.map((d) => (
          <div key={d.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid #222" }}>
            <span style={{ opacity: 0.6 }}>{new Date(d.created_at).toLocaleString()}</span>{" "}
            · <strong>{d.decision_type}</strong>{" "}
            · <Pill ok={d.outcome === "executed"}>{d.outcome}</Pill>{" "}
            · confidence {d.confidence}{" "}
            {d.reason && <span style={{ opacity: 0.7 }}> — {d.reason}</span>}
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ── tiny UI primitives ── */
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, alignItems: "end" };
const row: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid #222" };
const btnStyle: React.CSSProperties = {
  padding: "8px 14px",
  background: "#d0c290",
  color: "#111",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const btnSmall: React.CSSProperties = {
  padding: "4px 8px",
  background: "#222",
  color: "#eee",
  border: "1px solid #333",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11,
};
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#0f1116", border: "1px solid #222", borderRadius: 8, padding: 16, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, margin: "0 0 10px", textTransform: "uppercase", letterSpacing: 1, color: "#d0c290" }}>{title}</h3>
      {children}
    </div>
  );
}
function Input({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <input {...p} style={{ padding: "6px 8px", background: "#111", border: "1px solid #333", borderRadius: 4, color: "#eee" }} />
    </label>
  );
}
function Select({ label, options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: string[] }) {
  return (
    <label style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ opacity: 0.6 }}>{label}</span>
      <select {...p} style={{ padding: "6px 8px", background: "#111", border: "1px solid #333", borderRadius: 4, color: "#eee" }}>
        {options.map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    </label>
  );
}
function Btn({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled} style={{ ...btnStyle, opacity: disabled ? 0.4 : 1 }}>{children}</button>
  );
}
function Pill({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: 10,
      fontSize: 11,
      textTransform: "uppercase",
      background: ok ? "#1a3020" : "#301a1a",
      color: ok ? "#6f6" : "#f66",
    }}>
      {children}
    </span>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#0b0d12", padding: 10, borderRadius: 6 }}>
      <div style={{ opacity: 0.6, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 15, marginTop: 2 }}>{value}</div>
    </div>
  );
}


