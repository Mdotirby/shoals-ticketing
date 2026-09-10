"use client";

import { useCallback, useEffect, useState } from "react";
import { STAFF_LEVEL_LABELS, type StaffLevel } from "@/lib/auth/roles";

/**
 * ACCESS CONTROL — the mockup's `roles` screen.
 *
 * Role cards, the 16 × 6 capability matrix with its four states, and the audit
 * log. This is the STRONG half of access control and it sits above the sidebar
 * editor for a reason: `sidebar_permissions` only ever answered "can this role
 * SEE this tab", and hiding Settlements in the nav never stopped a Box Office
 * user deep-linking to /admin/settlements/[id]. Capabilities answer "can this
 * role DO this thing", and they are checked on the server.
 */

type Cell = { role: string; level: string; overridden: boolean };
type Row = { capability: string; cells: Cell[] };
type AuditEntry = {
  id: string; action: string; target_type: string | null;
  target_id: string | null; detail: Record<string, unknown> | null; created_at: string;
};

/** Labels and scope notes, verbatim from the design's permRows. */
const CAP_META: Record<string, { label: string; scope: string }> = {
  assign_roles:           { label: "Assign roles & permissions",     scope: "the authority itself" },
  venue_lifecycle:        { label: "Create / suspend a venue",       scope: "tenant lifecycle" },
  cross_tenant_reporting: { label: "Cross-tenant reporting",         scope: "all venues" },
  holds:                  { label: "Place & release holds",          scope: "calendar" },
  offers:                 { label: "Build & send offers",            scope: "artist deals" },
  ticket_scaling:         { label: "Set ticket scaling & prices",    scope: "inventory" },
  inventory_release:      { label: "Release / kill inventory",       scope: "holds & tiers" },
  door_sales_comps:       { label: "Sell at the door & issue comps", scope: "box office" },
  scan_checkin:           { label: "Scan & check in",                scope: "gates" },
  view_settlement:        { label: "View settlement figures",        scope: "artist money" },
  sign_payout:            { label: "Sign settlement & release payout", scope: "irreversible" },
  quote_contract_rentals: { label: "Quote & contract rentals",       scope: "private events" },
  invoices_payments:      { label: "Issue invoices & take payment",  scope: "receivables" },
  expenses:               { label: "Enter & approve expenses",       scope: "ledger" },
  export_ledger:          { label: "Export the combined ledger",     scope: "all revenue" },
  read_audit:             { label: "Read the audit log",             scope: "accountability" },
};

const ROLE_NOTES: Record<string, string> = {
  owner: "Everything, everywhere. Not editable — an owner who can be demoted is not an owner.",
  venue_admin: "Everything at this venue, including who sees what.",
  talent_buyer: "Holds, offers, scaling. No settlement figures.",
  finance: "Settlements, invoices, expenses, the ledger.",
  events_manager: "Rentals, BEOs, scanning, day-of operations.",
  box_office: "Door sales, comps, drawer count, scanning.",
};

// ● full · ◐ scoped · ◐ read · ○ none — the design's own marks. Scoped and read
// share a glyph and differ in weight, which is why the label sits under it.
const MARK: Record<string, string> = { full: "●", scoped: "◐", read: "◐", none: "○" };
const NEXT: Record<string, string> = { full: "scoped", scoped: "read", read: "none", none: "full" };

export default function AccessControl() {
  const [matrix, setMatrix] = useState<Row[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [seats, setSeats] = useState<Record<string, number>>({});
  const [editable, setEditable] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/capabilities");
      if (res.status === 401 || res.status === 403) { setDenied(true); return; }
      const d = await res.json();
      setMatrix(d.matrix ?? []);
      setRoles(d.roles ?? []);
      setSeats(d.seats ?? {});
      setEditable(!!d.editable);
      setNote(d.note ?? null);
    } catch { /* the sidebar editor below still works */ }
    try {
      const res = await fetch("/api/admin/audit?limit=12");
      if (res.ok) { const d = await res.json(); setAudit(d.entries ?? []); }
    } catch { /* audit is informational */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cycle = async (capability: string, role: string, level: string) => {
    if (!editable || role === "owner") return;
    const next = NEXT[level];
    setBusy(`${role}:${capability}`);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/capabilities", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, capability, level: next }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg(d.error || "Could not change that."); return; }
      await load();
    } catch {
      setMsg("Could not change that.");
    } finally {
      setBusy(null);
    }
  };

  if (denied) {
    return (
      <div className="acl">
        <div className="acl-card" style={{ maxWidth: 460 }}>
          <div className="acl-eyebrow">Authority</div>
          <p className="acl-note" style={{ marginTop: 8 }}>
            Only a role holding <strong>Assign roles &amp; permissions</strong> can see or change
            who has access to what. Yours does not.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="acl">

      {/* ── Role cards ─────────────────────────────────────────────────── */}
      <div className="acl-card">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div className="acl-eyebrow">Authority</div>
          <span style={{ flex: 1 }} />
          <span className="acl-note">Only Venue Admin and above can change who sees what</span>
        </div>
        <div className="acl-roles" style={{ marginTop: 14 }}>
          {roles.map((r, i) => (
            <div key={r} className={`acl-role ${r === "owner" ? "acl-role--owner" : ""}`}>
              <div className="acl-role-level">Level {i + 1}</div>
              <div className="acl-role-name">{STAFF_LEVEL_LABELS[r as StaffLevel] ?? r}</div>
              <div className="acl-role-seats">{seats[r] ?? 0}<span style={{ fontSize: 11, fontWeight: 600, color: "var(--acl-w34)" }}> seats</span></div>
              <div className="acl-role-note">{ROLE_NOTES[r]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── The matrix ─────────────────────────────────────────────────── */}
      <div className="acl-card">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div className="acl-eyebrow">Permission matrix</div>
          <span style={{ flex: 1 }} />
          <div className="acl-legend">
            <span><span className="acl-full">●</span> full</span>
            <span><span className="acl-scoped">◐</span> scoped</span>
            <span><span className="acl-read">◐</span> read</span>
            <span><span className="acl-none">○</span> none</span>
          </div>
        </div>

        <p className="acl-note" style={{ marginTop: 6 }}>
          {editable
            ? "Click any cell to cycle it. Owner is fixed and the server refuses to change it."
            : note ?? "Read-only."}
          {" "}A green dot marks a cell somebody changed; everything else is the shipped default.
        </p>

        {msg && <p className="acl-note" style={{ color: "#f87171", marginTop: 8 }}>{msg}</p>}

        <div className="acl-matrix-scroll">
          <div className="acl-mhead">
            <div>Capability</div>
            {roles.map((r) => <div key={r}>{STAFF_LEVEL_LABELS[r as StaffLevel] ?? r}</div>)}
          </div>

          {matrix.map((row) => (
            <div key={row.capability} className="acl-mrow">
              <div>
                <div className="acl-cap">{CAP_META[row.capability]?.label ?? row.capability}</div>
                <div className="acl-scope">{CAP_META[row.capability]?.scope ?? ""}</div>
              </div>
              {row.cells.map((c) => (
                <button
                  key={c.role}
                  type="button"
                  className="acl-cell"
                  disabled={!editable || c.role === "owner" || busy === `${c.role}:${row.capability}`}
                  title={
                    c.role === "owner"
                      ? "Owner holds every capability and cannot be reduced"
                      : editable ? `Click to set ${NEXT[c.level]}` : undefined
                  }
                  onClick={() => cycle(row.capability, c.role, c.level)}
                >
                  {c.overridden && <span className="acl-cell-dot" />}
                  <span className={`acl-mark acl-${c.level}`}>{MARK[c.level]}</span>
                  <span className={`acl-lvl acl-${c.level}`}>{c.level}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Audit ──────────────────────────────────────────────────────── */}
      <div className="acl-card">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <div className="acl-eyebrow">Audit log</div>
          <span style={{ flex: 1 }} />
          <span className="acl-note">Insert-only, by database trigger</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 14 }}>
          {audit.length === 0 && (
            <p className="acl-note">
              Nothing recorded yet, or your role cannot read it — the design gives
              <strong> Read the audit log</strong> to Owner and Venue Admin in full, Finance at read.
            </p>
          )}
          {audit.map((a) => (
            <div key={a.id} className="acl-audit-row">
              <div className="acl-audit-when">
                {new Date(a.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="acl-audit-what">
                {a.action}
                {a.target_type && <span style={{ color: "var(--acl-w34)" }}> · {a.target_type}</span>}
              </div>
              <div className="acl-audit-who">
                {(a.detail?.actor_email as string) ?? "—"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
