"use client";

import { Suspense } from "react";
import Link from "next/link";
import { mergedTabs, splitHref, visibleNav } from "@/lib/admin/nav";
import { useTabParam } from "@/lib/admin/useTabParam";
import { useAdminNav } from "@/app/components/admin/AdminNavContext";
import { EmptyState, PageHeader, cx } from "@/app/components/admin/ui";

/**
 * One page standing in for several routes the design merged (PHASE1B):
 * the header, the design's pill tab bar, and the active tab's panel.
 *
 * The tabs come from lib/admin/nav.ts, filtered through visibleNav() for this
 * user, so a tab appears exactly when its old route would have appeared in the
 * sidebar — same tab_key, same roles. The active tab is `?tab=`; the default is
 * the first tab this user can see, which is also what the sidebar assumes.
 *
 * Only the active panel is mounted, so each old page's data loads when its tab
 * is opened, as it did when it was its own route. A tab whose route lives
 * outside this page (Portals → /portal) renders as a link, not a panel.
 */
type Props = {
  pageId: string;
  title: string;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  /** tab key → the panel. A function, so unopened tabs never render. */
  panels: Record<string, () => React.ReactNode>;
};

export default function MergedPage(props: Props) {
  return (
    <Suspense fallback={null}>
      <MergedPageInner {...props} />
    </Suspense>
  );
}

function MergedPageInner({ pageId, title, sub, actions, panels }: Props) {
  const { role, perms } = useAdminNav();
  const page = visibleNav(role, perms)
    .flatMap((g) => g.pages)
    .find((p) => p.id === pageId);

  const tabs = page ? mergedTabs(page).filter((t) => t.key in panels) : [];
  const hostPath = tabs[0] ? splitHref(tabs[0].href).path : null;
  const linkOuts = (page?.routeTabs ?? []).filter((t) => splitHref(t.href).path !== hostPath);

  const [tab, setTab] = useTabParam(tabs.length ? tabs.map((t) => t.key) : ["_none"]);

  return (
    <div className="merged-page">
      <PageHeader title={title} sub={sub} actions={actions} />

      {tabs.length > 0 && (
        <div className="merged-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === tab}
              className={cx("merged-tab", t.key === tab && "is-on")}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
          {linkOuts.map((t) => (
            <Link key={t.href} href={t.href} className="merged-tab merged-tab--out">
              {t.label} ↗
            </Link>
          ))}
        </div>
      )}

      <div className="merged-panel" role="tabpanel" key={tab}>
        {tabs.length === 0 ? (
          <EmptyState title="Nothing here for your role" description="Ask an owner if you need access to this page." />
        ) : (
          panels[tab]?.()
        )}
      </div>
    </div>
  );
}
