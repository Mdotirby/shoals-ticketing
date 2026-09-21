"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  mergedTabs,
  resolveActive,
  splitHref,
  type NavGroup,
  type NavLink,
  type NavPage,
} from "@/lib/admin/nav";

/**
 * The admin sidebar — handoff/screens/sidebar.dc.html, behaviour per
 * handoff/ADMIN-NAV-SPEC.md:
 *
 *  1. The group holding the active route opens on load, derived from the
 *     route rather than stored.
 *  2. Opening or closing a group by hand wins over that until the tab
 *     closes (sessionStorage; `undefined` in the map means "derive").
 *  3. Several groups may be open at once — not an accordion.
 *  4. Collapses to a 74px rail: group glyphs plus a dot per page, the active
 *     page's dot lit. Also per session.
 *  5. A closed group shows its page count, dimmed. No summed badges.
 *  6. The group holding the active route carries a 1px spine on its pages.
 *
 * Under 768px the same three levels become a full-height drawer with 44px
 * rows. The rail doesn't apply there — CSS ignores .is-rail on phones.
 *
 * Tabs appear only under the active page, and only read state: route tabs
 * are real links, param tabs link to `?tab=` on the current path.
 */

const OPEN_KEY = "admin-nav-open";
const RAIL_KEY = "admin-nav-rail";

function readSession<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeSession(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode — the preference just doesn't persist */
  }
}

type Props = {
  groups: NavGroup[];
  partner: NavLink | null;
  pathname: string;
  /** Current `?tab=` value, read by the layout. */
  tabParam: string | null;
  wordmarkSrc: string;
  iconSrc: string;
  brandName: string;
  /** Artists see their own photo in place of the operator mark. */
  avatarSrc?: string;
  adminName: string;
  venueName: string;
  subtitle?: string;
  drawerOpen: boolean;
  onNavigate: () => void;
  onSignOut: () => void;
};

export default function AdminSidebar({
  groups,
  partner,
  pathname,
  tabParam,
  wordmarkSrc,
  iconSrc,
  brandName,
  avatarSrc,
  adminName,
  venueName,
  subtitle,
  drawerOpen,
  onNavigate,
  onSignOut,
}: Props) {
  // Start from the derived state on the server and the first client render,
  // then pick up this tab's stored choices — avoids a hydration mismatch.
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [rail, setRail] = useState(false);
  useEffect(() => {
    // Browser storage can only be read after hydration; this is the one
    // place the sidebar syncs from an external system.
    /* eslint-disable react-hooks/set-state-in-effect */
    setOpenMap(readSession(OPEN_KEY, {}));
    setRail(readSession(RAIL_KEY, false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const active = resolveActive(pathname, groups);

  const setGroupOpen = (id: string, open: boolean) => {
    const next = { ...openMap, [id]: open };
    setOpenMap(next);
    writeSession(OPEN_KEY, next);
  };
  const toggleRail = () => {
    setRail(!rail);
    writeSession(RAIL_KEY, !rail);
  };

  const pageHref = (p: NavPage) =>
    p.contextualHref?.(pathname) ?? p.link?.href ?? p.routeTabs![0].href;

  const renderTabs = (p: NavPage) => {
    if (p.routeTabs && p.routeTabs.length > 1) {
      // A merged page's tabs share its path and differ by ?tab=; the default
      // is the first one this user can see — the same rule the page uses.
      const merged = mergedTabs(p);
      const current = tabParam ?? merged[0]?.key;
      return p.routeTabs.map((t) => {
        const { path, tab } = splitHref(t.href);
        return {
          key: t.href,
          label: t.label,
          href: t.href,
          on: tab ? pathname === path && current === tab : active?.routeTabHref === t.href,
        };
      });
    }
    if (p.paramTabs && (!p.paramTabsOn || p.paramTabsOn.test(pathname))) {
      const current = tabParam ?? p.paramTabs[0].key;
      return p.paramTabs.map((t) => ({
        key: t.key,
        label: t.label,
        href: `${pathname}?tab=${t.key}`,
        on: current === t.key,
      }));
    }
    return [];
  };

  return (
    <aside
      className={`anav${rail ? " is-rail" : ""}${drawerOpen ? " is-open" : ""}`}
      aria-label="Admin navigation"
    >
      <div className="anav-brand">
        {avatarSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={avatarSrc} alt={adminName || "Artist"} className="anav-avatar" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={wordmarkSrc} alt={brandName} className="anav-wordmark" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={iconSrc} alt={brandName} className="anav-icon" />
          </>
        )}
      </div>

      {adminName && (
        <div className="anav-welcome">
          <div className="anav-welcome-hi">Welcome,</div>
          <div className="anav-welcome-name">{adminName}</div>
          {venueName && <div className="anav-welcome-venue">{venueName}</div>}
          {subtitle && <div className="anav-welcome-venue">{subtitle}</div>}
        </div>
      )}

      <button type="button" className="anav-railtoggle" onClick={toggleRail} aria-pressed={rail}>
        <span className="anav-railtoggle-icon" aria-hidden="true">{rail ? "»" : "«"}</span>
        <span className="anav-railtoggle-label">{rail ? "Expand" : "Collapse"}</span>
      </button>

      <nav className="anav-groups">
        {groups.map((g) => {
          const holdsActive = active?.groupId === g.id;
          const open = openMap[g.id] ?? holdsActive;
          const pages = g.pages.filter((p) => !p.contextualHref || p.contextualHref(pathname) !== null);
          return (
            <div key={g.id} className={`anav-group${holdsActive ? " holds-active" : ""}`}>
              <button
                type="button"
                className="anav-group-btn"
                aria-expanded={open}
                title={g.label}
                onClick={() => {
                  // In the rail there's no room for the body — widen first.
                  if (rail) {
                    toggleRail();
                    setGroupOpen(g.id, true);
                  } else {
                    setGroupOpen(g.id, !open);
                  }
                }}
              >
                <span className="anav-group-icon" aria-hidden="true">{g.icon}</span>
                <span className="anav-group-label">{g.label}</span>
                {!open && <span className="anav-group-count">{pages.length}</span>}
                <span className="anav-group-caret" aria-hidden="true">{open ? "▾" : "▸"}</span>
              </button>

              {open && (
                <div className="anav-group-body">
                  {pages.map((p) => {
                    const on = active?.pageId === p.id;
                    const tabs = on ? renderTabs(p) : [];
                    return (
                      <div key={p.id} className="anav-page">
                        <Link
                          href={pageHref(p)}
                          className={`anav-item${on ? " is-active" : ""}`}
                          aria-current={on ? "page" : undefined}
                          onClick={onNavigate}
                        >
                          <span className="anav-item-dot" aria-hidden="true" />
                          <span className="anav-item-label">{p.label}</span>
                        </Link>
                        {tabs.length > 0 && (
                          <div className="anav-tabs">
                            {tabs.map((t) => (
                              <Link
                                key={t.key}
                                href={t.href}
                                className={`anav-tab${t.on ? " is-active" : ""}`}
                                aria-current={t.on ? "true" : undefined}
                                onClick={onNavigate}
                              >
                                <span className="anav-tab-mark" aria-hidden="true" />
                                <span className="anav-tab-label">{t.label}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="anav-raildots" aria-hidden="true">
                {pages.map((p) => (
                  <span key={p.id} className={active?.pageId === p.id ? "is-lit" : undefined} />
                ))}
              </div>
            </div>
          );
        })}

        {partner && (
          <Link
            href={partner.href}
            className={`anav-item anav-item--solo${pathname === partner.href ? " is-active" : ""}`}
            onClick={onNavigate}
          >
            <span className="anav-item-dot" aria-hidden="true" />
            <span className="anav-item-label">{partner.label}</span>
          </Link>
        )}
      </nav>

      <div className="anav-foot">
        <button type="button" className="anav-signout" onClick={onSignOut}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="anav-signout-label">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
