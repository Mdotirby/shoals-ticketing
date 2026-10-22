"use client";

/**
 * "+ New host" beside the host picker on the event create and edit pages.
 *
 * Booking a show for an organisation that is not on file yet meant leaving
 * the half-filled form, going to Users & tenants, adding them, and coming
 * back. This adds them in place and selects them.
 *
 * One field. The slug is the subdomain, so it cannot be skipped — but it can
 * be derived, and it is shown so it can be corrected before it is committed
 * to. Everything else about a host (branding, fees, addresses, buyer
 * details) stays on the Tenants panel, which is where you go when you are
 * actually setting one up rather than unblocking a booking.
 */

import { useEffect, useRef, useState } from "react";

export type NewHost = { id: string; name: string };

/** A name to a subdomain: lower case, words joined by hyphens, nothing else. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    // Strip accents, so "Café Shoals" is "cafe-shoals" and not "caf-shoals".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function NewHostButton({
  onCreated,
  disabled = false,
  className = "",
}: {
  /** The new host, so the caller can add it to its list and select it. */
  onCreated: (host: NewHost) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  /** False until the slug is edited by hand, after which the name stops driving it. */
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setName(""); setSlug(""); setSlugTouched(false); setError("");
  };

  const effectiveSlug = slugTouched ? slug : slugify(name);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError("A host needs a name."); return; }
    if (!effectiveSlug) { setError("That name gives no slug — type one."); return; }

    setBusy(true);
    setError("");
    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed, slug: effectiveSlug, account_type: "client" }),
    });
    setBusy(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // 403 is the capability guard: creating a tenant is owner-only.
      setError(
        res.status === 403
          ? "Only an owner can add a host. Ask one, or pick an existing host."
          : body.error || "Couldn't add that host.",
      );
      return;
    }

    const created = await res.json();
    onCreated({ id: created.id, name: created.name });
    close();
  };

  if (!open) {
    return (
      <button
        type="button"
        className={`newhost-open ${className}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        + New host
      </button>
    );
  }

  return (
    <div className={`newhost ${className}`}>
      <div className="newhost-row">
        <label className="newhost-field">
          <span>Host name</span>
          <input
            ref={nameRef}
            value={name}
            placeholder="Children's Museum of the Shoals"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); create(); }
              if (e.key === "Escape") close();
            }}
          />
        </label>
        <label className="newhost-field newhost-field--slug">
          <span>Slug</span>
          <input
            value={effectiveSlug}
            placeholder="cms"
            onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); create(); }
              if (e.key === "Escape") close();
            }}
          />
        </label>
      </div>
      <div className="newhost-foot">
        <span className="newhost-note">
          The slug is this host&rsquo;s subdomain and can&rsquo;t be changed casually later. Fees,
          branding and buyer details live in Users &amp; tenants.
        </span>
        <div className="newhost-cta">
          <button type="button" className="newhost-save" disabled={busy || !name.trim()} onClick={create}>
            {busy ? "Adding…" : "Add host"}
          </button>
          <button type="button" className="newhost-cancel" onClick={close}>Cancel</button>
        </div>
      </div>
      {error && <div className="newhost-error">{error}</div>}
    </div>
  );
}
