"use client";

/**
 * The glass card primitive — one surface for every admin panel.
 *
 * Admin had no shared card. .dash-panel and .dash-kpi-card exist but are
 * dashboard-specific, and everything else hand-rolled its own box, which is how
 * the same surface ends up with four slightly different radii.
 *
 * It deliberately does NOT declare glass values of its own. .admin-shell
 * re-points the --vc-* tokens at the --lg-* liquid-glass values (globals.css
 * ~17205), so building on --vc-surface / --vc-border / --vc-blur means this
 * inherits the real glass surface and follows the theme if the tokens ever move
 * again. Hardcoding rgba() here would opt out of that.
 */
export default function AdminCard({
  children,
  className = "",
  padded = true,
  as: Tag = "section",
}: {
  children: React.ReactNode;
  className?: string;
  /** Off for cards that hold their own full-bleed content, e.g. a table. */
  padded?: boolean;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag className={`admin-card${padded ? "" : " admin-card--flush"} ${className}`.trim()}>
      {children}
    </Tag>
  );
}
