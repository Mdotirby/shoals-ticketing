"use client";

/**
 * The hub's own pieces, as eventhub.dc.html draws them: the glass card, the
 * modal and the right-hand drawer, and the empty / loading states every
 * section shares. Classes live in globals.css under "Event hub".
 */

import { useEffect } from "react";

export type HubToneName = "warn" | "bad" | "good" | "info" | "dim";

export function HubModal({
  eyebrow,
  title,
  tone = "warn",
  width = 460,
  onClose,
  children,
}: {
  eyebrow: string;
  title: string;
  tone?: HubToneName;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="hub-modal-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="hub-modal" style={{ width: `min(${width}px, 100%)` }}>
        <div className="hub-modal-head">
          <div className="hub-modal-headtext">
            <div className={`hub-modal-eyebrow is-${tone}`}>{eyebrow}</div>
            <div className="hub-modal-title">{title}</div>
          </div>
          <button type="button" className="hub-x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function HubDrawer({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div className="hub-drawer-scrim" onClick={onClose} />
      <aside className="hub-drawer" role="dialog" aria-modal="true">{children}</aside>
    </>
  );
}

export function HubCard({
  eyebrow,
  right,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`hub-card${className ? ` ${className}` : ""}`}>
      {(eyebrow || right) && (
        <div className="hub-card-head">
          {eyebrow && <div className="hub-eyebrow">{eyebrow}</div>}
          <span className="hub-spacer" />
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function HubEmpty({
  title,
  body,
  ctas,
}: {
  title: string;
  body: string;
  ctas?: Array<{ label: string; onClick?: () => void; href?: string }>;
}) {
  return (
    <div className="hub-empty">
      <div className="hub-empty-title">{title}</div>
      <div className="hub-empty-body">{body}</div>
      {ctas && ctas.length > 0 && (
        <div className="hub-empty-ctas">
          {ctas.map((c, i) =>
            c.href ? (
              <a key={c.label} href={c.href} className={`hub-btn${i === 0 ? " hub-btn--primary" : ""}`}>{c.label}</a>
            ) : (
              <button key={c.label} type="button" onClick={c.onClick} className={`hub-btn${i === 0 ? " hub-btn--primary" : ""}`}>{c.label}</button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Three skeleton cards, as the mockup's loading state draws a section. */
export function HubLoading({ label }: { label: string }) {
  return (
    <>
      <div className="hub-skel-row">
        {[0, 1, 2].map((i) => (
          <div key={i} className="hub-skel">
            <div className="hub-skel-bar hub-skel-bar--head" />
            {[92, 70, 84, 56].map((w) => <div key={w} className="hub-skel-bar" style={{ width: `${w - i * 6}%` }} />)}
          </div>
        ))}
      </div>
      <div className="hub-skel-note">Loading {label}… the header and sub-nav stay usable while a section loads.</div>
    </>
  );
}
