"use client";

/**
 * Access — eventhub.dc.html ?tab=access. Who can open this show and which
 * of its sections each of them sees. Replaces the workspace Access tab.
 *
 * Staff access is venue-wide: everyone on the venue (and the platform's own
 * people) can open every show, limited to the sections their role allows —
 * the same rule the hub itself enforces (_hub/config). The portal people
 * are this show's own: the artists assigned to it, who see its guest list,
 * and the agent on its offer. Access per show for staff isn't something the
 * role model has, so the section says so instead of offering it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { roleLabel } from "@/lib/auth/roles";
import { useHub } from "../HubContext";
import { HUB_LABEL, HUB_TABS, canOpen } from "../config";
import { HubLoading } from "../ui";

type User = { id: string; first_name: string | null; last_name: string | null; email: string; role: string; venue_id: string | null };
type Group = { role: string; kind: string; kindTone: string; scope: string; people: Array<{ name: string; sub: string; warn?: boolean }> };

const initials = (n: string) => n.split(/\s+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const nameOf = (u: { first_name: string | null; last_name: string | null; email?: string }) =>
  [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Unnamed";

export default function Access() {
  const hub = useHub();
  const { id, event, offer } = hub;
  const [users, setUsers] = useState<User[] | "denied" | null>(null);
  const [assigned, setAssigned] = useState<Array<{ artist_id: string; comp_limit: number | null }>>([]);

  useEffect(() => {
    let live = true;
    fetch("/api/admin/users")
      .then((r) => (r.status === 401 || r.status === 403 ? "denied" : r.ok ? r.json() : []))
      .then((d) => live && setUsers(d === "denied" ? "denied" : Array.isArray(d) ? d : []))
      .catch(() => live && setUsers([]));
    import("@/lib/supabase-browser").then(async ({ getSupabaseBrowser }) => {
      const { data } = await getSupabaseBrowser().from("artist_event_assignments").select("artist_id, comp_limit").eq("event_id", id);
      if (live) setAssigned(data ?? []);
    }).catch(() => {});
    return () => { live = false; };
  }, [id]);

  if (!event || users === null) return <HubLoading label="Access" />;

  const scopeFor = (role: string) => {
    const tabs = HUB_TABS.filter((t) => canOpen(role, t));
    return tabs.length === HUB_TABS.length ? "Every section" : tabs.map((t) => HUB_LABEL[t]).join(", ");
  };

  const groups: Group[] = [];
  if (users !== "denied") {
    const staff = users.filter((u) => !["artist", "agent", "partner"].includes(u.role) && (!u.venue_id || !event.venue_id || u.venue_id === event.venue_id));
    // Legacy and canonical role names can share a label (two read as "Box
    // Office"), so people group by what the role is called, not its string.
    const order = ["owner", "super_admin", "venue_admin", "full_admin", "talent_buyer", "finance", "events_manager", "read_only", "box_office", "door_greeter"];
    const rank = (r: string) => (order.includes(r) ? order.indexOf(r) : order.length);
    const byLabel = new Map<string, { roles: string[]; people: User[] }>();
    for (const u of [...staff].sort((a, b) => rank(a.role) - rank(b.role))) {
      const label = roleLabel(u.role);
      const g = byLabel.get(label) ?? { roles: [], people: [] };
      if (!g.roles.includes(u.role)) g.roles.push(u.role);
      g.people.push(u);
      byLabel.set(label, g);
    }
    for (const [label, g] of byLabel) {
      groups.push({
        role: label,
        kind: "Venue-wide",
        kindTone: "dim",
        scope: scopeFor(g.roles[0]) + (g.roles.includes("read_only") ? " · read only" : ""),
        people: g.people.map((u) => ({ name: nameOf(u), sub: u.venue_id ? "This venue · all shows" : "Platform · every venue" })),
      });
    }
    const artists = assigned.map((a) => {
      const u = users.find((x) => x.id === a.artist_id);
      return { name: u ? nameOf(u) : "Artist", sub: a.comp_limit !== null ? `Guest list · ${a.comp_limit} comps` : "Guest list" };
    });
    if (artists.length) groups.push({ role: "Artist · portal", kind: "This show", kindTone: "teal", scope: "Guest list only", people: artists });
  }
  if (offer && (offer.agent_name || offer.agency)) {
    groups.push({
      role: "Agent · portal", kind: "This show", kindTone: "teal",
      scope: "The agent portal shows their offers and settlements · rebate lines never shown",
      people: [{ name: offer.agent_name || "Agent", sub: offer.agency || "Agency not set" }],
    });
  }

  return (
    <div className="hub-access-wrap">
      {users === "denied" && <div className="hub-alert-none">Only owners and venue admins can see the team.</div>}
      <div className="hub-access">
        {groups.map((g) => (
          <section key={g.role} className="hub-card hub-access-card">
            <div className="hub-access-head">
              <div className="hub-access-role">{g.role}</div>
              <div className={`hub-access-kind is-${g.kindTone}`}>{g.kind}</div>
            </div>
            <div className="hub-access-scope">{g.scope}</div>
            <div className="hub-access-people">
              {g.people.map((p, i) => (
                <div key={i} className="hub-access-person">
                  <div className="hub-access-avatar">{initials(p.name)}</div>
                  <div className="hub-access-text"><div className="hub-unlock-what">{p.name}</div><div className="hub-promo-sub">{p.sub}</div></div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="hub-card-foot hub-card-foot--quiet">
        Staff see every show their venue runs, limited to the sections their role allows. Giving someone one show only isn&apos;t part of the role model yet.{" "}
        <Link href="/admin/users?tab=access" className="hub-card-link">Roles and what each can do are defined in Access control →</Link>
      </div>
    </div>
  );
}
