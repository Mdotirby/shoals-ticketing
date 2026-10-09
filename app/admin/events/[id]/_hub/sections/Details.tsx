"use client";

/**
 * Details — eventhub.dc.html ?tab=details. What buyers see on the
 * storefront, the ticket and the wallet pass: title, subtitle, date, doors
 * and show, venue, age policy, description, Spotify and an external ticket
 * link, with the artwork and email flyer beside them. Replaces the edit
 * form's Setup tab.
 *
 * Edits stay local until the hub's save bar saves them; only changed fields
 * are sent. Doors follow the show time (minus an hour) until someone types
 * their own. A selling show's title, date and venue changes are recorded
 * with before/after by PUT /api/events/[id] itself.
 *
 * Production fields the mockup doesn't draw sit under "More details" at the
 * foot of the card rather than being dropped.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ImageCropper from "@/app/components/ImageCropper";
import { defaultDoorsTime } from "@/lib/dates";
import { useHub, useSectionDirty, type HubEvent } from "../HubContext";

type Draft = {
  title: string;
  subtitle: string;
  date: string;
  show: string;
  doors: string;
  venue: string;
  event_venue_id: string;
  age: string;
  description: string;
  spotify_url: string;
  external_ticket_url: string;
  image_url: string;
  email_flyer_url: string;
  external_ticket_label: string;
  spotify_monthly_listeners: string;
  spotify_featured_track: string;
  meta_pixel_id: string;
  talent_buyer: string;
  booking_agent: string;
};

type EventVenue = { id: string; name: string; full_address: string | null };

const s = (v: unknown) => (v == null ? "" : String(v));

function fromEvent(e: HubEvent): Draft {
  const raw = e.date || "";
  let show = raw.length >= 16 && (raw[10] === "T" || raw[10] === " ") ? raw.slice(11, 16) : "";
  if (show === "00:00") show = "";
  return {
    title: s(e.title),
    subtitle: s(e.subtitle),
    date: raw.slice(0, 10),
    show,
    doors: s(e.doors_time).slice(0, 5),
    venue: s(e.venue),
    event_venue_id: s(e.event_venue_id),
    age: s(e.age_restriction) || "all_ages",
    description: s(e.description),
    spotify_url: s(e.spotify_url),
    external_ticket_url: s(e.external_ticket_url),
    image_url: s(e.image_url),
    email_flyer_url: s(e.email_flyer_url),
    external_ticket_label: s(e.external_ticket_label),
    spotify_monthly_listeners: s(e.spotify_monthly_listeners),
    spotify_featured_track: s(e.spotify_featured_track),
    meta_pixel_id: s(e.meta_pixel_id),
    talent_buyer: s(e.talent_buyer),
    booking_agent: s(e.booking_agent),
  };
}

/** The PUT body for the fields that changed. */
function patchFor(d: Draft, saved: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const changed = (k: keyof Draft) => d[k] !== saved[k];
  if (changed("date") || changed("show")) out.date = `${d.date}T${d.show || "19:00"}:00`;
  if (changed("doors")) out.doors_time = d.doors || null;
  if (changed("venue") || changed("event_venue_id")) {
    out.venue = d.venue;
    out.event_venue_id = d.event_venue_id || null;
  }
  if (changed("age")) out.age_restriction = d.age;
  const plain: Array<keyof Draft> = [
    "title", "subtitle", "description", "spotify_url", "external_ticket_url", "image_url", "email_flyer_url",
    "external_ticket_label", "spotify_monthly_listeners", "spotify_featured_track", "meta_pixel_id", "talent_buyer", "booking_agent",
  ];
  for (const k of plain) if (changed(k)) out[k] = k === "title" ? d[k].trim() : d[k].trim() || null;
  return out;
}

const AGES: Array<[string, string]> = [["all_ages", "All ages"], ["18+", "18+"], ["21+", "21+"]];

async function upload(file: Blob, name: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, name);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error(d.error || "Upload failed");
  return d.url as string;
}

export default function Details() {
  const hub = useHub();
  const { event, id } = hub;
  const saved = useMemo(() => (event ? fromEvent(event) : null), [event]);
  const [d, setD] = useState<Draft | null>(saved);
  const [venues, setVenues] = useState<EventVenue[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [crop, setCrop] = useState<string | null>(null);
  const [busy, setBusy] = useState<"art" | "flyer" | null>(null);
  const artRef = useRef<HTMLInputElement>(null);
  const flyerRef = useRef<HTMLInputElement>(null);

  // A save (or another section) changed the show: start again from it.
  useEffect(() => { setD(saved); }, [saved]);

  useEffect(() => {
    import("@/lib/supabase-browser").then(({ getSupabaseBrowser }) =>
      getSupabaseBrowser().from("event_venues").select("id, name, full_address").order("name")
        .then(({ data }: { data: EventVenue[] | null }) => setVenues(data ?? [])),
    );
  }, []);

  const changedKeys = useMemo(
    () => (d && saved ? (Object.keys(d) as Array<keyof Draft>).filter((k) => d[k] !== saved[k]) : []),
    [d, saved],
  );
  // Picking a venue moves its name and its id — one edit, not two.
  const count = changedKeys.filter((k) => k !== "event_venue_id").length;

  const save = useCallback(async () => {
    if (!d || !saved) return false;
    setError("");
    if (!d.title.trim()) { setError("The show needs a title."); return false; }
    if (!d.date) { setError("The show needs a date."); return false; }
    const body = patchFor(d, saved);
    const r = await fetch(`/api/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const res = await r.json().catch(() => ({}));
    if (!r.ok) { setError(res.error || "Couldn't save the details."); return false; }
    hub.reload(["event"]);
    return true;
  }, [d, saved, id, hub]);

  const discard = useCallback(() => { setD(saved); setError(""); }, [saved]);
  useSectionDirty("details", count, save, discard);

  if (!d || !saved) return null;

  const doorsFollow = !d.doors || d.doors === defaultDoorsTime(d.show);
  const set = (k: keyof Draft, v: string) =>
    setD((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [k]: v };
      // Doors move with the show time while they're still the default for it.
      if (k === "show" && (!prev.doors || prev.doors === defaultDoorsTime(prev.show))) next.doors = defaultDoorsTime(v) ?? "";
      return next;
    });
  const edited = (k: keyof Draft) => d[k] !== saved[k];

  const field = (
    k: keyof Draft,
    label: string,
    opts: { type?: string; span?: boolean; hint?: React.ReactNode; placeholder?: string; area?: boolean; warnHint?: boolean; link?: { label: string; go: () => void } } = {},
  ) => (
    <div className={`hub-field${opts.span ? " is-span" : ""}`} key={k}>
      <div className="hub-field-head">
        <label className="hub-field-label" htmlFor={`hub-d-${k}`}>{label}</label>
        <span className="hub-spacer" />
        {edited(k) && <span className="hub-field-chip">Edited</span>}
      </div>
      {opts.area ? (
        <textarea id={`hub-d-${k}`} rows={4} value={d[k]} onChange={(e) => set(k, e.target.value)} className={`hub-in hub-in--area${edited(k) ? " is-edited" : ""}`} />
      ) : (
        <input
          id={`hub-d-${k}`}
          type={opts.type ?? "text"}
          value={d[k]}
          placeholder={opts.placeholder}
          onChange={(e) => set(k, e.target.value)}
          className={`hub-in${edited(k) ? " is-edited" : ""}`}
        />
      )}
      {(opts.hint || opts.link) && (
        <div className="hub-field-foot">
          <div className={`hub-field-hint${opts.warnHint ? " is-warn" : ""}`}>{opts.hint}</div>
          {opts.link && <button type="button" className="hub-field-link" onClick={opts.link.go}>{opts.link.label}</button>}
        </div>
      )}
    </div>
  );

  const choice = (k: keyof Draft, label: string, options: Array<[string, string]>, hint: string, onPick?: (v: string) => void) => (
    <div className="hub-field" key={k}>
      <div className="hub-field-head">
        <div className="hub-field-label">{label}</div>
        <span className="hub-spacer" />
        {edited(k) && <span className="hub-field-chip">Edited</span>}
      </div>
      {options.length > 4 ? (
        // Past four the chips stop reading as a choice — a venue with many
        // rooms gets the same pick as a list.
        <select value={d[k]} onChange={(e) => (onPick ? onPick(e.target.value) : set(k, e.target.value))} className={`hub-in${edited(k) ? " is-edited" : ""}`}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <div className="hub-choices">
          {options.map(([v, l]) => (
            <button key={v} type="button" className={`hub-choice${d[k] === v ? " is-on" : ""}`} onClick={() => (onPick ? onPick(v) : set(k, v))}>{l}</button>
          ))}
        </div>
      )}
      <div className="hub-field-foot"><div className="hub-field-hint">{hint}</div></div>
    </div>
  );

  const venueOptions: Array<[string, string]> = venues.map((v) => [v.id, v.name]);
  if (d.event_venue_id && !venues.some((v) => v.id === d.event_venue_id)) venueOptions.unshift([d.event_venue_id, d.venue]);
  if (!d.event_venue_id && d.venue) venueOptions.unshift(["", d.venue]);

  const pickFile = (kind: "art" | "flyer") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(file.type)) {
      setError("Only .jpeg, .jpg, .png and .webp images are allowed.");
      return;
    }
    if (kind === "art") {
      // The hero is cropped to 16:9 first, as the edit form always did.
      const reader = new FileReader();
      reader.onload = () => setCrop(reader.result as string);
      reader.readAsDataURL(file);
      return;
    }
    // The flyer is a finished 1080×1350 asset — uploaded as it is.
    setBusy("flyer");
    try { set("email_flyer_url", await upload(file, `event-flyer-${Date.now()}.jpg`)); }
    catch (err) { setError(err instanceof Error ? err.message : "Flyer upload failed"); }
    finally { setBusy(null); }
  };

  return (
    <div className="hub-details">
      <section className="hub-card hub-card--glow hub-details-form">
        {error && <div className="hub-error">{error}</div>}
        <div className="hub-fields">
          {field("title", "Title", { span: true, hint: "Ticket holders get an email if the title changes after they buy." })}
          {field("subtitle", "Subtitle", { span: true, hint: "Tour name, support act or a one-line hook. Shows under the title." })}
          {field("date", "Date", { type: "date", hint: "Moving the date on a selling show? Use Postpone in the ⋯ menu so buyers are asked to keep or refund." })}
          {field("doors", "Doors", {
            type: "time",
            hint: doorsFollow ? "Follows show time minus 1 hour." : "Set by hand.",
            link: doorsFollow || !d.show ? undefined : { label: "Reset to show − 1 hr", go: () => set("doors", defaultDoorsTime(d.show) ?? "") },
          })}
          {field("show", "Show time", { type: "time", hint: "When the first act goes on. Printed on the ticket as “Show”." })}
          {choice("event_venue_id", "Venue", venueOptions, "Changing the room re-checks capacity against tickets sold.", (v) => {
            const row = venues.find((x) => x.id === v);
            setD((prev) => (prev ? { ...prev, event_venue_id: v, venue: row?.name ?? prev.venue } : prev));
          })}
          {choice("age", "Age policy", AGES, "Shows on the event page, the ticket and the door scanner.")}
          {field("description", "Description", { span: true, area: true, hint: "Shown on the event page under the ticket panel." })}
          {field("spotify_url", "Spotify artist link", { placeholder: "https://open.spotify.com/artist/…", hint: "Adds the top-tracks player to the event page." })}
          {field("external_ticket_url", "External ticket URL", {
            placeholder: "Leave blank to sell here",
            hint: d.external_ticket_url ? "Buyers go to this link. The tiers on Tickets & pricing are hidden from the storefront." : "Only for shows sold on another platform.",
            warnHint: !!d.external_ticket_url,
          })}
        </div>

        <details className="hub-more" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
          <summary>
            <span className="hub-eyebrow">More details</span>
            <span className="hub-more-sub">external link label · Spotify player · Meta pixel · talent buyer · agent</span>
          </summary>
          <div className="hub-fields">
            {field("external_ticket_label", "External ticket button label", { placeholder: "Buy on Eventbrite", hint: "The storefront button text when the show sells elsewhere." })}
            {field("spotify_monthly_listeners", "Spotify monthly listeners", { placeholder: "950.7k", hint: "Printed beside the artist on the event page." })}
            {field("spotify_featured_track", "Spotify featured track", { placeholder: "https://open.spotify.com/track/…", hint: "The preview the event page plays. Add ?t=30 to start 30 seconds in." })}
            {field("meta_pixel_id", "Meta pixel ID", { placeholder: "Leave blank to use the venue's", hint: "Only when this show reports to its own ad account." })}
            {field("talent_buyer", "Talent buyer")}
            {field("booking_agent", "Booking agent")}
          </div>
        </details>
      </section>

      <div className="hub-details-side">
        <section className="hub-card">
          <div className="hub-card-line">
            <div className="hub-eyebrow">Event artwork</div>
            <span className="hub-spacer" />
            {edited("image_url") ? <span className="hub-field-chip">Edited</span> : !d.image_url && <span className="hub-field-chip">Missing</span>}
          </div>
          <div className="hub-card-sub">16:9 · storefront hero, cards and wallet pass</div>
          <button type="button" className="hub-slot hub-slot--wide" onClick={() => artRef.current?.click()} disabled={busy === "art"}>
            {d.image_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={d.image_url} alt="Event artwork" />
              : <span>{busy === "art" ? "Uploading…" : "Drop event artwork · 1920 × 1080"}</span>}
          </button>
          <div className="hub-slot-actions">
            <button type="button" className="hub-field-link" onClick={() => artRef.current?.click()}>{d.image_url ? "Replace" : "Upload"}</button>
            {d.image_url && <button type="button" className="hub-field-link" onClick={() => set("image_url", "")}>Remove</button>}
          </div>
          <input ref={artRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={pickFile("art")} />
        </section>

        <section className="hub-card">
          <div className="hub-card-line">
            <div className="hub-eyebrow">Email flyer</div>
            <span className="hub-spacer" />
            {edited("email_flyer_url") ? <span className="hub-field-chip">Edited</span> : !d.email_flyer_url && <span className="hub-field-chip">Missing</span>}
          </div>
          <div className="hub-card-sub">4:5 · used by announce and on-sale emails</div>
          <button type="button" className="hub-slot hub-slot--tall" onClick={() => flyerRef.current?.click()} disabled={busy === "flyer"}>
            {d.email_flyer_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={d.email_flyer_url} alt="Email flyer" />
              : <span>{busy === "flyer" ? "Uploading…" : "Drop email flyer · 1080 × 1350"}</span>}
          </button>
          <div className="hub-slot-actions">
            <button type="button" className="hub-field-link" onClick={() => flyerRef.current?.click()}>{d.email_flyer_url ? "Replace" : "Upload"}</button>
            {d.email_flyer_url && <button type="button" className="hub-field-link" onClick={() => set("email_flyer_url", "")}>Remove</button>}
          </div>
          <input ref={flyerRef} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={pickFile("flyer")} />
        </section>
      </div>

      {crop && (
        <ImageCropper
          imageSrc={crop}
          aspect={16 / 9}
          onCancel={() => setCrop(null)}
          onCropComplete={async (blob: Blob) => {
            setCrop(null);
            setBusy("art");
            try { set("image_url", await upload(blob, `event-${Date.now()}.jpg`)); }
            catch (err) { setError(err instanceof Error ? err.message : "Image upload failed"); }
            finally { setBusy(null); }
          }}
        />
      )}
    </div>
  );
}
