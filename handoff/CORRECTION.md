# CORRECTION — revert app/events/page.tsx

I was wrong. The events rebuild I shipped was based on a false premise and it
regressed a page that was already correct. Revert it.

## What I claimed

> "The 200-line inline style block hardcoded the pre-glass navy palette, so this
> page rendered in the old theme while every other storefront surface had moved
> to liquid glass. That block was the single largest source of the drift."

## What is actually true

The navy declarations in that block were **already being overridden** in
production. Every one of them is redefined at higher specificity in
`app/styles/globals.css` lines 15037–15117:

```
body[data-theme="liquid-glass"] .events-grid-card   (0,2,1)
  vs. the in-page .events-grid-card                 (0,1,0)
```

Specificity wins regardless of source order, so the glass rules were in force
the whole time. The navy block was dead weight, not drift. The events listing
was fully glass-themed before I touched it — glass card surface, Archivo, white
gradient CTA, translucent price pill, glass search pill and filter selects.

I inferred the drift from reading the page file alone and never read the
stylesheet region that governs it.

## What my change actually did

`.events-grid-card` and `EventCard` are **two different components**, and
globals.css says so explicitly at line 15064:

> The listing card is a different component from the home EventCard: photo on
> top, body panel beneath. Restyled as glass rather than restructured, so its
> markup and CTA behaviour are unchanged.

`EventCard` (line 14412) is the home-carousel card: full-bleed photo, venue
badge top-left, title and pills over a bottom scrim. `.events-grid-card` is the
listing card: photo on top, body panel beneath, with a date line, a venue line
with pin icon, a price pill and a **Get Tickets button**.

By swapping the listing markup for `EventCard` I:

1. **Orphaned the glass rules at 15067–15117.** They target
   `.events-grid-card`, `.event-card-body`, `-meta`, `-price`, `-btn` — none of
   which `EventCard` renders. That CSS now matches nothing on the page.
2. **Removed the Get Tickets button** from every card on the events index.
   `EventCard` has no CTA button; the whole tile is the link.
3. **Removed the venue line and the date/time meta line**, replaced by pills.
4. **Turned every listing card into a full-bleed photo tile**, which is the
   home carousel's design, not the listing's.

The CSS comment was a written warning against exactly this restructure and I
walked into it.

## Also wrong: my cleanup advice

I told you to delete the "dead" `.events-grid-card` rules from globals.css.
**Do not.** They are only dead because of my regression. Deleting them destroys
the correct listing design permanently — and it is the design in our mockup.

## The fix

Revert `app/events/page.tsx` to commit `465d26998334`:

```bash
git checkout 465d26998334 -- app/events/page.tsx
```

That restores the working glass listing. Nothing else in the mount needs
reverting — see below.

## What stands from the mount

**`lib/operators.ts` and `Header.tsx` are fine — keep them.** The VenueCore
mobile icon fix is real: `logoIcon` was the navy-on-transparent cut rendering on
a dark glass pill, `logoIconWhite` fixes it, and West 72 is unaffected because
it only had white cuts wired. The `privacy@venuecore.com` → `.live` fix and the
W72 stacked-lockup repoint are also real. Those were verified against the files,
not inferred.

**Optional, separate from the revert:** `EventsHero` still isn't mounted on
`/events`, and glass rules for it exist (`.events-hero-shell` line 15842,
`.events-heading` line 16456). So it was styled for this theme and never
rendered. That may well be intentional. Decide it on its own, not bundled into
a revert.

## Why production still doesn't match the mockup

Not the reason I gave. Two real reasons:

1. **Five of six storefront pages were never rebuilt** — home, `events/[id]`,
   about, contact, checkout. That is the bulk of the gap and it is simply
   outstanding work, not a bug.
2. **Production is already substantially glass-themed.** globals.css carries
   roughly 4,500 lines of `body[data-theme="liquid-glass"]` rules covering
   header, footer, events listing, about, event card, hero and carousel. So the
   remaining gap is *specific divergences* between those rules and the mockup —
   not a theme that failed to apply.

Which means the next step is not a rebuild. It is a per-page diff of the mockup
against the glass rules already in globals.css, page by page, reading the
stylesheet region for each one before proposing any change. That is the step I
skipped, and skipping it is what produced this regression.
