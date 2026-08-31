/**
 * LIQUID GLASS — reference components (Next.js + Tailwind + TypeScript)
 *
 * These are drop-in starting points, not a package to install. Copy the
 * ones you need into your components/ directory and wire them into your
 * existing pages. They assume:
 *   - tailwind.config.snippet.js has been merged into tailwind.config.js
 *   - globals.css.snippet.css has been appended to globals.css
 *   - Archivo is loaded via next/font/google (see globals.css.snippet.css)
 *
 * clsx is optional — swap the `cx()` helper for your own classnames util
 * (clsx, cn, tailwind-merge) if you already have one.
 */

import React from 'react';

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(' ');
}

/* ---------------------------------------------------------------
   BackgroundField — mount ONCE in app/layout.tsx, behind {children}.
   This is what every .glass panel on the page blurs/refracts.
--------------------------------------------------------------- */
export function BackgroundField() {
  return (
    <div className="bg-field" aria-hidden="true">
      <div className="orb one" />
      <div className="orb blue" />
      <div className="orb rose" />
      <div className="orb white" />
      <div className="grain" />
    </div>
  );
}

/* ---------------------------------------------------------------
   GlassCard — the base surface used everywhere: nav, cards, forms,
   modals. Radius defaults to "lg" (24px) to match the mockups.
--------------------------------------------------------------- */
export function GlassCard({
  children,
  className,
  radius = 'lg',
}: {
  children: React.ReactNode;
  className?: string;
  radius?: 'lg' | 'md' | 'sm' | 'full';
}) {
  const radiusClass =
    radius === 'full' ? 'rounded-full' :
    radius === 'sm' ? 'rounded-glass-sm' :
    radius === 'md' ? 'rounded-glass-md' : 'rounded-glass-lg';
  return <div className={cx('glass', radiusClass, className)}>{children}</div>;
}

/* ---------------------------------------------------------------
   Button — primary (white glass) / outline (frosted, transparent)
--------------------------------------------------------------- */
export function Button({
  children,
  variant = 'primary',
  className,
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline';
  size?: 'md' | 'lg';
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-bold rounded-full whitespace-nowrap transition-transform active:scale-[0.98]';
  const sizes = size === 'lg' ? 'px-7 py-4 text-sm' : 'px-6 py-3 text-[13px]';
  const variants =
    variant === 'primary'
      ? 'bg-btn-white backdrop-blur-glass text-[#241a0c] border border-[rgba(255,235,205,0.55)] shadow-glass-btn'
      : 'bg-white/[0.07] backdrop-blur-glass text-white border border-white/20';
  return (
    <button className={cx(base, sizes, variants, className)} {...props}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------
   Chip / pill badge — price tags, "FREE", filter pills, tags
--------------------------------------------------------------- */
export function Chip({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: 'default' | 'strong';
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11.5px] font-bold border',
        tone === 'strong'
          ? 'bg-btn-white text-[#241a0c] border-[rgba(255,235,205,0.5)]'
          : 'bg-white/10 text-white/85 border-white/15'
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------
   NavBar — floating glass pill nav, sticky top. Mirrors the mockups
   for Home / Events / About / Contact / Login.
--------------------------------------------------------------- */
export function NavBar({ active }: { active: 'events' | 'about' | 'contact' | 'login' | '' }) {
  const link = (key: typeof active, label: string, href: string) => (
    <a
      href={href}
      className={cx('text-[13.5px] font-semibold', active === key ? 'text-white' : 'text-white/80 hover:text-white')}
    >
      {label}
    </a>
  );
  return (
    <div className="sticky top-5 z-50 px-8">
      <GlassCard radius="full" className="max-w-[1360px] mx-auto flex items-center justify-between px-6 py-3.5">
        <div className="leading-none">
          <b className="text-[17px] font-extrabold tracking-wide">WEST&#8209;72</b>
          <div className="text-[8px] text-white/40 tracking-[3px] mt-0.5">ENTERTAINMENT</div>
        </div>
        <div className="flex items-center gap-7">
          {link('events', 'Events', '/events')}
          {link('about', 'About', '/about')}
          {link('contact', 'Contact', '/contact')}
          {link('login', 'Login', '/login')}
        </div>
        <Button variant="primary">Get Tickets</Button>
      </GlassCard>
    </div>
  );
}

/* ---------------------------------------------------------------
   ProgressBar — used on the Command Center dashboard for per-event
   ticket-sales progress. Width is a plain 0-100 percentage you compute
   from real data (e.g. ticketsSold / referenceMax * 100).
--------------------------------------------------------------- */
export function ProgressBar({ percent, tone = 'strong' }: { percent: number; tone?: 'strong' | 'min' }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-full h-[9px] rounded-lg bg-glass-track overflow-hidden">
      <div
        className={cx(
          'h-full rounded-lg',
          tone === 'strong'
            ? 'bg-gradient-to-r from-[rgba(255,255,255,0.95)] to-[rgba(255,255,255,0.55)] shadow-[0_0_12px_rgba(255,255,255,0.35)]'
            : 'bg-white/18'
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------
   EventCard — the repeating card on /events, the home "Upcoming Shows"
   strip, and the checkout-success cross-sell grid (see home.png /
   home_mobile.png). This matches the CURRENT live-site layout: the photo
   fills the entire card (swap the gradient for a real <Image> — use
   `fill` + `object-cover` — once you have artwork), a small venue tag
   sits pinned in the top-left corner, and the title + info pills sit at
   the bottom on a dark gradient scrim for legibility. There is no
   separate white/body panel below the photo — the photo IS the card.
   Aspect ratio is 4:3 in a multi-column grid and 16:9 when stacked full-
   width on mobile.
--------------------------------------------------------------- */
export function EventCard({
  name,
  venue,
  dateLabel,
  timeLabel,
  priceLabel,
  isFree,
  photoUrl,
  ctaHref,
}: {
  name: string;
  venue: string;
  dateLabel: string;
  timeLabel: string;
  priceLabel: string;
  isFree?: boolean;
  photoUrl?: string;
  ctaHref: string;
}) {
  return (
    <a
      href={ctaHref}
      className="glass relative block overflow-hidden rounded-glass-lg aspect-[4/3] max-[600px]:aspect-video"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: photoUrl
            ? `url(${photoUrl})`
            : 'linear-gradient(150deg, rgba(255,255,255,0.20), rgba(255,255,255,0.02))',
        }}
      />
      <div className="absolute inset-0 [background:linear-gradient(180deg,transparent_38%,rgba(0,0,0,0.55)_68%,rgba(0,0,0,0.92)_100%)]" />
      <span className="absolute top-3.5 left-3.5 z-10 rounded-lg bg-black/40 backdrop-blur-md border border-white/15 px-3 py-1.5 text-[10.5px] font-bold text-white/85">
        {venue}
      </span>
      <div className="absolute left-0 right-0 bottom-0 z-10 p-5">
        <div className="text-[19px] font-extrabold mb-2.5 leading-tight">{name}</div>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone={isFree ? 'strong' : 'default'}>{isFree ? 'FREE' : priceLabel}</Chip>
          <Chip>{dateLabel}</Chip>
          <Chip>{timeLabel}</Chip>
        </div>
      </div>
    </a>
  );
}

/* ---------------------------------------------------------------
   Field — glass form input, used on Contact + Login
--------------------------------------------------------------- */
export function Field({
  label,
  as = 'input',
  ...props
}: {
  label: string;
  as?: 'input' | 'textarea' | 'select';
} & React.InputHTMLAttributes<HTMLInputElement> &
  React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const cls = 'w-full text-[14px] text-white bg-white/[0.06] border border-white/15 rounded-xl px-4 py-3.5 backdrop-blur-md placeholder:text-white/30 outline-none focus:border-accent/60';
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-white/60 mb-2">{label}</label>
      {as === 'textarea' ? (
        <textarea className={cls} rows={4} {...(props as any)} />
      ) : as === 'select' ? (
        <select className={cls} {...(props as any)} />
      ) : (
        <input className={cls} {...(props as any)} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------
   CheckoutStepper — the TICKETS · CHECKOUT · DONE indicator at the
   top of the checkout sidebar card (see checkout_step.png). "Done"
   is a real page (see Field/Button usage in your success route),
   not another sidebar state — this stepper never shows a completed
   "Done" dot from within the sidebar itself.
--------------------------------------------------------------- */
export function CheckoutStepper({ step }: { step: 'tickets' | 'checkout' }) {
  const order: Array<'tickets' | 'checkout' | 'done'> = ['tickets', 'checkout', 'done'];
  const activeIndex = order.indexOf(step);
  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {order.map((key, i) => (
        <React.Fragment key={key}>
          {i > 0 && (
            <div className={cx('flex-1 h-px -mt-6', i <= activeIndex ? 'bg-white/50' : 'bg-white/15')} />
          )}
          <div className="flex flex-col items-center gap-2 flex-1">
            <div
              className={cx(
                'w-2.5 h-2.5 rounded-full border',
                i < activeIndex ? 'bg-white border-white/60' :
                i === activeIndex ? 'bg-white border-white/60 shadow-[0_0_0_4px_rgba(255,255,255,0.18)]' :
                'bg-white/15 border-white/25'
              )}
            />
            <div className={cx('text-[9.5px] font-extrabold tracking-wider', i === activeIndex ? 'text-white' : i < activeIndex ? 'text-white/60' : 'text-white/35')}>
              {key.toUpperCase()}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------
   HeroCarouselChrome — visual-only overlay for the home hero carousel.
   This does NOT implement the carousel — drop these controls into your
   EXISTING autoplay/swipe carousel and wire onPrev/onNext/activeIndex to
   its real state. Do not replace the autoplay timer, the touch/drag swipe
   handlers, or the "hosted by West 72" filter query — restyle only.
--------------------------------------------------------------- */
export function HeroCarouselChrome({
  slideCount,
  activeIndex,
  onPrev,
  onNext,
}: {
  slideCount: number;
  activeIndex: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="hero-swipe-hint">&#8596; Swipe</div>
      <button aria-label="Previous slide" className="hero-arrow prev" onClick={onPrev}>&#8249;</button>
      <button aria-label="Next slide" className="hero-arrow next" onClick={onNext}>&#8250;</button>
      <div className="hero-dots">
        {Array.from({ length: slideCount }).map((_, i) => (
          <span key={i} className={cx('dot', i === activeIndex && 'active')} />
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------
   MobileNavMenu — visual-only markup for the opened hamburger-menu
   state (see mobile_nav_states.png). Wire `open` and `onClose` to your
   existing mobile-nav open/close state — this is not a second header,
   it's the expanded state of the same NavBar.
--------------------------------------------------------------- */
export function MobileNavMenu({
  open,
  active,
  onClose,
}: {
  open: boolean;
  active: 'events' | 'about' | 'contact' | 'login' | '';
  onClose: () => void;
}) {
  if (!open) return null;
  const link = (key: typeof active, label: string, href: string) => (
    <a href={href} className={active === key ? 'active' : ''}>{label}</a>
  );
  return (
    <>
      <div className="glass nav-menu">
        {link('events', 'Events', '/events')}
        {link('about', 'About', '/about')}
        {link('contact', 'Contact', '/contact')}
        {link('login', 'Login', '/login')}
        <div className="nav-menu-divider" />
        <Button variant="primary" className="w-full">Get Tickets</Button>
      </div>
      <div className="nav-scrim" onClick={onClose} />
    </>
  );
}

/* ---------------------------------------------------------------
   HotelPartnerPanel — Checkout Success cross-sell for a lodging partner
   (Renaissance Shoals Resort & Spa). Placement/copy lean on a few buyer-
   psychology levers: exclusivity + reciprocity (framed as unlocked by the
   ticket), anchoring (crossed-out rack rate), honest scarcity (a real
   room-block cutoff), and a single low-friction CTA. See the design doc's
   "Hotel partner section" note for the reasoning — swap in live rate data
   when you have a feed for it.
--------------------------------------------------------------- */
export function HotelPartnerPanel({
  partnerName = 'Renaissance Shoals Resort & Spa',
  cutoffLabel,
  rackRate,
  memberRate,
  promoCode,
  ctaHref,
}: {
  partnerName?: string;
  cutoffLabel: string;
  rackRate: string;
  memberRate: string;
  promoCode: string;
  ctaHref: string;
}) {
  return (
    <GlassCard radius="lg" className="hotel-panel">
      <div className="hotel-photo"><span>{partnerName.toUpperCase()}</span></div>
      <div className="hotel-body">
        <div className="hotel-top">
          <Chip>&#10022; Unlocked By Your Ticket</Chip>
          <span className="hotel-cutoff">Room block holds through {cutoffLabel}</span>
        </div>
        <h3>You Bought The Ticket. We Got You The Room.</h3>
        <div className="hotel-partner-name">In partnership with {partnerName}</div>
        <p className="hotel-desc">
          A block of rooms is being held for ticket holders only — not listed on their site, not
          available to the general public. Skip the drive home, skip the search, and let tomorrow
          be somebody else&rsquo;s problem.
        </p>
        <div className="hotel-bottom">
          <div>
            <div className="hotel-price-row">
              <span className="hotel-price-old">{rackRate}</span>
              <span className="hotel-price-new">{memberRate}</span>
              <span className="hotel-price-unit">/ night</span>
            </div>
            <div className="hotel-code-note">Code <b>{promoCode}</b> applied automatically &mdash; no account needed</div>
          </div>
          <Button variant="primary" size="lg"><a href={ctaHref}>Unlock Our Rate</a></Button>
        </div>
      </div>
    </GlassCard>
  );
}

/* ---------------------------------------------------------------
   TicketCard — the order-confirmation line on Checkout Success
   (checkout_success.png). The thumbnail is the EVENT PHOTO, not a QR
   code — the actual ticket/QR lives behind "View My Tickets". On
   mobile, dateVenue is a single truncating line and the tier info
   wraps to its own full-width row below (see the `sm:` variants) so it
   never breaks mid-sentence.
--------------------------------------------------------------- */
export function TicketCard({
  eventName,
  dateVenue,
  tierLabel,
  subLabel,
  photoUrl,
}: {
  eventName: string;
  dateVenue: string;
  tierLabel: string;
  subLabel?: string;
  photoUrl?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3.5 p-5 rounded-2xl bg-white/5 border border-white/10">
      <div
        className="w-16 h-16 sm:w-[88px] sm:h-[88px] rounded-xl flex-shrink-0 bg-cover bg-center"
        style={{
          backgroundImage: photoUrl
            ? `url(${photoUrl})`
            : 'linear-gradient(150deg, rgba(255,255,255,0.30), rgba(255,255,255,0.04))',
        }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-base font-extrabold mb-1">{eventName}</div>
        <div className="text-[11px] sm:text-[12.5px] text-white/40 whitespace-nowrap overflow-hidden text-ellipsis">{dateVenue}</div>
      </div>
      <div className="basis-full sm:basis-auto flex sm:block justify-between sm:text-right flex-shrink-0 pt-3 sm:pt-0 mt-1 sm:mt-0 border-t sm:border-t-0 border-white/10">
        <div className="text-[13px] font-bold">{tierLabel}</div>
        {subLabel && <div className="text-[11.5px] text-white/40">{subLabel}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   ApplePayButton — express-checkout button above the manual card form
   on Checkout (checkout_step.png). This is a payment method your
   processor (Stripe/Square/etc.) enables with a config flag — it does
   NOT require Apple Developer Program enrollment. That's a separate
   requirement that only applies to Apple Wallet ticket passes (not
   included in this pass — see the design doc). Wire onClick to
   whatever this button already triggers on your live ticket-selection
   page; this is a restyle, not new logic.
--------------------------------------------------------------- */
export function ApplePayButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 py-[15px] rounded-xl bg-black border border-white/18 text-white text-[15.5px] font-bold mb-4"
    >
      <span>Buy with</span>
      <svg width="17" height="17" viewBox="0 0 384 512" fill="#fff" aria-hidden="true">
        <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.3-41.7-84.7-44.6-35.4-2.8-74.1 20.6-88.3 20.6-15 0-49.3-19.7-76-19.7C63.3 141 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
      </svg>
      <span>Pay</span>
    </button>
  );
}
