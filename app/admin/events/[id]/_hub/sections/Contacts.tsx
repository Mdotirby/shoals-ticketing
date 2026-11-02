"use client";

/**
 * Contacts: the people on this show. The settlement's send box picks from this
 * list. The agent and assistant come from the offer, so they're shown here and
 * edited on the Deal tab.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, DataTable, Field, Modal } from "@/app/components/admin/ui";
import { CONTACT_ROLES, contactRoleLabel, type ShowContact } from "@/lib/contacts/showContacts";
import { useHub } from "../HubContext";
import { HubLoading } from "../ui";

const BLANK = { id: "", name: "", role: "tour_manager", email: "", phone: "" };

export default function Contacts() {
  const { id } = useHub();
  const [contacts, setContacts] = useState<ShowContact[] | null>(null);
  const [migrated, setMigrated] = useState(true);
  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/contacts`);
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(out.error || "Couldn't load contacts.");
      setContacts([]);
      return;
    }
    setContacts(out.contacts ?? []);
    setMigrated(out.migrated !== false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setSaving(true); setError("");
    try {
      const res = await fetch(`/api/events/${id}/contacts${form.id ? `/${form.id}` : ""}`, {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Couldn't save the contact.");
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the contact.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: ShowContact) => {
    if (!window.confirm(`Remove ${c.name || c.email} from this show?`)) return;
    setError("");
    const res = await fetch(`/api/events/${id}/contacts/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const out = await res.json().catch(() => ({}));
      setError(out.error || "Couldn't remove the contact.");
      return;
    }
    await load();
  };

  if (!contacts) return <HubLoading label="Loading contacts" />;

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <Button variant="primary" onClick={() => { setError(""); setForm(BLANK); }} disabled={!migrated}>
          + Add contact
        </Button>
      </div>
      {!migrated && (
        <div className="ofb-banner ofb-banner--bad" style={{ marginBottom: 14 }}>
          Contacts can&apos;t be saved yet. Run plans/show-contacts-migration.sql.
        </div>
      )}
      {error && !form && <div className="ofb-banner ofb-banner--bad" style={{ marginBottom: 14 }}>{error}</div>}
      {contacts.length === 0 ? (
        <div style={{ padding: "18px 0", opacity: 0.6 }}>No contacts on this show yet.</div>
      ) : (
        <DataTable columns={["Name", "Role", "Email", "Phone", ""]}>
          {contacts.map((c) => (
            <tr key={c.id}>
              <td>{c.name || "—"}</td>
              <td>{contactRoleLabel(c.role)}</td>
              <td>{c.email || "—"}</td>
              <td>{c.phone || "—"}</td>
              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {c.source === "offer" ? (
                  <Link href={`/admin/events/${id}?tab=deal`} style={{ textDecoration: "underline" }}>From the offer</Link>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setError("");
                        setForm({ id: c.id, name: c.name || "", role: c.role, email: c.email || "", phone: c.phone || "" });
                      }}
                    >
                      Edit
                    </Button>{" "}
                    <Button variant="ghost" onClick={() => remove(c)}>Remove</Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
      {form && (
        <Modal
          title={form.id ? "Edit contact" : "Add contact"}
          onClose={() => !saving && setForm(null)}
          footer={
            <>
              <span className="filter-spacer" />
              <Button onClick={() => setForm(null)} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
            </>
          }
        >
          <div className="ofb-send">
            <Field label="Name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Role">
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            {error && <div className="ofb-banner ofb-banner--bad">{error}</div>}
          </div>
        </Modal>
      )}
    </Card>
  );
}
