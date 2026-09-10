"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STAFF_LEVELS,
  STAFF_LEVEL_LABELS,
  EXTERNAL_IDENTITY_LABELS,
  normalizeRole,
  levelRank,
  roleLabel,
  type StaffLevel,
} from "@/lib/auth/roles";

/**
 * TEAM & CREDENTIALS — the mockup's `users` screen.
 *
 * One panel, as the mockup insists: identity, contact, access level and
 * credentials for the selected person, beside the roster. Splitting those
 * across screens is how an admin ends up changing someone's role and
 * forgetting the login still points at an address they no longer use.
 *
 * ── THE RULE THAT SHAPES THE CREDENTIALS BLOCK ─────────────────────────────
 * An override does NOT email the user. Matt's instruction, and it is right:
 * an unannounced credential email reads as phishing to the person receiving
 * it, and the admin doing the override is normally already talking to them.
 * The onboarding mail is sent on CREATE, with credentials the admin chose to
 * send. Everything on this screen is silent, and says so.
 *
 * ── WHAT IS NOT HERE, AND WHY ──────────────────────────────────────────────
 * The mockup also offers "reset MFA enrolment" and "revoke all active
 * sessions". There is no MFA in this app, and Supabase's admin signOut takes
 * a JWT rather than a user id, so neither can be done honestly from here.
 * Drawing a button that does nothing is worse than not drawing it.
 */

type AdminUser = {
  id: string;
  email: string | null;
  role: string;
  first_name: string | null;
  last_name: string | null;
  venue_id: string | null;
  must_change_password?: boolean | null;
  created_at?: string | null;
};

const LEVEL_NOTES: Record<StaffLevel, string> = {
  owner: "Platform level — the whole account, every venue, and who else is an owner",
  venue_admin: "Everything at this venue, including who sees what",
  talent_buyer: "Holds, offers, scaling. No settlement figures.",
  finance: "Settlements, invoices, expenses, the ledger",
  events_manager: "Rentals, BEOs, scanning, day-of operations",
  box_office: "Door sales, comps, drawer count, scanning",
};

const initials = (u: AdminUser) =>
  ((u.first_name?.[0] ?? "") + (u.last_name?.[0] ?? "")).toUpperCase() ||
  (u.email?.[0] ?? "?").toUpperCase();

const fullName = (u: AdminUser) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Unnamed";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actorRole, setActorRole] = useState<string | null>(null);

  // Edit buffer
  const [draft, setDraft] = useState<Partial<AdminUser>>({});
  const [newPassword, setNewPassword] = useState("");
  const [forceChange, setForceChange] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      if (res.status === 401 || res.status === 403) {
        setLoadError("You don't have permission to manage users.");
        return;
      }
      if (!res.ok) { setLoadError("Could not load the team."); return; }
      const data = await res.json();
      if (Array.isArray(data)) { setUsers(data); setLoadError(null); }
    } catch {
      setLoadError("Could not load the team.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
      const supabase = getSupabaseBrowser();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;
      const { data } = await supabase.from("admin_users").select("role").eq("id", auth.user.id).maybeSingle();
      if (data?.role) setActorRole(data.role);
    }).catch(() => {});
  }, []);

  const selected = users.find((u) => u.id === selectedId) ?? null;

  const select = (u: AdminUser) => {
    setSelectedId(u.id);
    setDraft({ first_name: u.first_name, last_name: u.last_name, email: u.email, role: u.role });
    setNewPassword("");
    setForceChange(false);
    setMsg(null);
    setRecoveryLink(null);
  };

  // Seniority mirrors lib/auth/roles.canEditRole — the server enforces it, this
  // only stops the UI offering something the API will refuse.
  const actorLevel = normalizeRole(actorRole).level;
  const outranks = useMemo(
    () => (targetRole: string | null | undefined) => {
      if (!actorLevel) return false;
      const t = normalizeRole(targetRole).level;
      if (!t) return true; // external identities carry no rank
      return levelRank(actorLevel) < levelRank(t);
    },
    [actorLevel]
  );

  const canEditSelected = selected ? outranks(selected.role) : false;

  const staff = users.filter((u) => normalizeRole(u.role).level);
  const external = users.filter((u) => !normalizeRole(u.role).level);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = { id: selected.id, ...draft };
      if (newPassword.trim()) body.new_password = newPassword.trim();
      if (forceChange) body.must_change_password = true;

      const res = await fetch("/api/admin/users", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ tone: "bad", text: data.error || "Save failed." }); return; }

      setMsg({
        tone: "ok",
        text: newPassword.trim()
          ? "Saved. The password is set — nothing was emailed."
          : "Saved.",
      });
      setNewPassword("");
      setForceChange(false);
      await load();
    } catch {
      setMsg({ tone: "bad", text: "Save failed." });
    } finally {
      setSaving(false);
    }
  };

  const mintRecoveryLink = async () => {
    if (!selected) return;
    setMsg(null);
    setRecoveryLink(null);
    try {
      const res = await fetch(`/api/admin/users/${selected.id}/recovery-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setMsg({ tone: "bad", text: data.error || "Could not generate a link." }); return; }
      setRecoveryLink(data.link);
    } catch {
      setMsg({ tone: "bad", text: "Could not generate a link." });
    }
  };

  if (loading) {
    return (
      <div className="admin-form-page team">
        <h1 className="admin-page-title">Team &amp; credentials</h1>
        <p className="team-note">Loading…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-form-page team">
        <h1 className="admin-page-title">Team &amp; credentials</h1>
        <div className="team-card" style={{ marginTop: 16, maxWidth: 460 }}>
          <div className="team-eyebrow" style={{ color: "var(--team-bad)" }}>No access</div>
          <p className="team-note" style={{ marginTop: 8 }}>{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-form-page team">
      <h1 className="admin-page-title">Team &amp; credentials</h1>
      <p className="team-note" style={{ marginTop: -4, marginBottom: 18, maxWidth: 640 }}>
        One panel per person — identity, contact, access level and credentials. Nothing on this
        screen emails anyone: an override is set silently, and a recovery link is handed back to
        you to pass on however you are already in touch.
      </p>

      <div className="team-layout">

        {/* ── Roster ──────────────────────────────────────────────────── */}
        <div className="team-card">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="team-eyebrow">Team</div>
            <span style={{ flex: 1 }} />
            <span className="team-note">{staff.length} staff · {external.length} external</span>
          </div>

          <div className="team-thead" style={{ marginTop: 14 }}>
            <div>User</div>
            <div>Access level</div>
            <div>Email</div>
            <div>State</div>
          </div>

          {[...staff, ...external].map((u) => {
            const level = normalizeRole(u.role).level;
            return (
              <button
                key={u.id}
                type="button"
                className="team-row"
                aria-pressed={selectedId === u.id}
                onClick={() => select(u)}
              >
                <div className="team-who">
                  <span className="team-avatar">{initials(u)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="team-name">{fullName(u)}</div>
                    <div className="team-email">{u.email || "no email on file"}</div>
                  </div>
                </div>
                <div className="team-cell">{roleLabel(u.role)}</div>
                <div className="team-cell">{u.email || "—"}</div>
                <div>
                  <span
                    className={`team-state ${!level ? "team-state--external" : ""} ${u.must_change_password ? "team-state--must-change" : ""}`}
                  >
                    {u.must_change_password ? "Must reset" : level ? "Active" : "External"}
                  </span>
                </div>
              </button>
            );
          })}

          <p className="team-note" style={{ marginTop: 14 }}>
            External identities — {Object.values(EXTERNAL_IDENTITY_LABELS).join(", ")} — sit outside
            the staff matrix by design. They have their own portals and carry no access level here.
          </p>
        </div>

        {/* ── Editing a user ──────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!selected && (
            <div className="team-card">
              <div className="team-eyebrow">Editing a user</div>
              <p className="team-note" style={{ marginTop: 8 }}>
                Pick someone from the team to edit their identity, access level and credentials.
              </p>
            </div>
          )}

          {selected && (
            <>
              <div className="team-card">
                <div className="team-eyebrow">Editing a user</div>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 12 }}>
                  <span className="team-avatar" style={{ width: 40, height: 40, fontSize: 13 }}>{initials(selected)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>{fullName(selected)}</div>
                    <div className="team-note">
                      {roleLabel(selected.role)}
                      {selected.created_at && ` · joined ${new Date(selected.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                    </div>
                  </div>
                </div>

                {!canEditSelected && (
                  <p className="team-note" style={{ marginTop: 12, color: "#fbbf24" }}>
                    This account is at or above your access level, so it is read-only for you.
                    The server refuses the change too — this is not just the button being hidden.
                  </p>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                  <div>
                    <label className="team-label">First name</label>
                    <input className="team-field" value={draft.first_name ?? ""} disabled={!canEditSelected}
                      onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="team-label">Last name</label>
                    <input className="team-field" value={draft.last_name ?? ""} disabled={!canEditSelected}
                      onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label className="team-label">Email</label>
                  <input className="team-field" type="email" value={draft.email ?? ""} disabled={!canEditSelected}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
                  <p className="team-note" style={{ marginTop: 6 }}>
                    This is their login. Changing it changes how they sign in.
                  </p>
                </div>
              </div>

              {/* ── Access level ──────────────────────────────────────── */}
              <div className="team-card">
                <div className="team-eyebrow">Access level</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 13 }}>
                  {STAFF_LEVELS.map((lvl) => {
                    const isCurrent = normalizeRole(draft.role ?? selected.role).level === lvl;
                    // You cannot assign a level you do not outrank — promoting
                    // someone to your own level is promoting yourself by proxy.
                    const assignable = !!actorLevel && levelRank(actorLevel) < levelRank(lvl);
                    return (
                      <button
                        key={lvl}
                        type="button"
                        className="team-level"
                        aria-pressed={isCurrent}
                        disabled={!canEditSelected || !assignable}
                        onClick={() => setDraft((d) => ({ ...d, role: lvl }))}
                      >
                        <span className="team-level-dot">✓</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span className="team-level-name">{STAFF_LEVEL_LABELS[lvl]}</span>
                          <span className="team-level-note" style={{ display: "block" }}>{LEVEL_NOTES[lvl]}</span>
                        </span>
                        <span className="team-level-lock">
                          {isCurrent ? "current" : !assignable ? "above you" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Credentials ───────────────────────────────────────── */}
              <div className="team-card">
                <div className="team-eyebrow">Credentials</div>

                <div style={{ marginTop: 13 }}>
                  <label className="team-label">Override password</label>
                  <input
                    className="team-field"
                    type="text"
                    placeholder="Leave blank to keep the current one"
                    value={newPassword}
                    disabled={!canEditSelected}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                    <button type="button" className="team-btn" disabled={!canEditSelected}
                      onClick={() => setNewPassword(Math.random().toString(36).slice(2, 8) + "-" + Math.random().toString(36).slice(2, 6))}>
                      Generate
                    </button>
                    <label className="team-btn" style={{ cursor: canEditSelected ? "pointer" : "not-allowed" }}>
                      <input type="checkbox" checked={forceChange} disabled={!canEditSelected}
                        onChange={(e) => setForceChange(e.target.checked)} style={{ margin: 0 }} />
                      Force a change at next login
                    </label>
                  </div>
                  <p className="team-note" style={{ marginTop: 8 }}>
                    Setting a password here is silent — <strong>nothing is emailed</strong>. Read it
                    out or send it however you are already in touch. The welcome mail goes out when
                    an account is first created, not on an override.
                  </p>
                </div>

                <div className="team-cred" style={{ marginTop: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="team-cred-title">Generate a password reset link</div>
                    <div className="team-cred-note">
                      A one-time link they can use themselves. Handed back to you rather than
                      emailed — an unannounced reset mail reads as phishing.
                    </div>
                  </div>
                  <button type="button" className="team-btn" disabled={!canEditSelected} onClick={mintRecoveryLink}>
                    Generate
                  </button>
                </div>

                {recoveryLink && (
                  <div className="team-linkout">{recoveryLink}</div>
                )}

                {msg && (
                  <p className="team-note" style={{ marginTop: 12, color: msg.tone === "ok" ? "var(--team-good)" : "var(--team-bad)" }}>
                    {msg.text}
                  </p>
                )}

                <div style={{ display: "flex", gap: 9, marginTop: 16 }}>
                  <button type="button" className="team-btn team-btn--primary" style={{ flex: 1 }}
                    disabled={!canEditSelected || saving} onClick={save}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  <button type="button" className="team-btn" onClick={() => select(selected)} disabled={saving}>
                    Cancel
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
