"use client";

/**
 * The page header primitive — eyebrow, title, optional sub and actions.
 *
 * 53 admin pages currently hand-roll a title block, which is why the type scale
 * and the spacing above the first panel drift from screen to screen. This is
 * the shared one.
 *
 * Eyebrow follows the design vocabulary in ADMIN_REBUILD.md: 9px / 700 /
 * 0.18em / uppercase. Everything else builds on the --vc-* tokens that
 * .admin-shell re-points at the liquid-glass values, for the same reason
 * AdminCard does.
 */
export default function AdminPageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow?: string;
  title: string;
  sub?: React.ReactNode;
  /** Right-aligned controls. Wraps under the title on narrow viewports. */
  actions?: React.ReactNode;
}) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header-text">
        {eyebrow && <p className="admin-page-eyebrow">{eyebrow}</p>}
        <h1 className="admin-page-title">{title}</h1>
        {sub && <p className="admin-page-sub">{sub}</p>}
      </div>
      {actions && <div className="admin-page-actions">{actions}</div>}
    </header>
  );
}
