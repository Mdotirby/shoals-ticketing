"use client";

import { Fragment } from "react";

/**
 * Storefront checkout progress — TICKETS / CHECKOUT / DONE.
 *
 * Mockup: the step-1 state is drawn at VenueCore.dc.html line 1437 and the
 * step-2 state at 1539. Comparing the two gives the rules encoded below:
 *
 *   - a step BEFORE the current one  → filled dot, no ring, label at 0.62
 *   - the CURRENT step               → filled dot with a 4px ring, label #fff
 *   - a step AFTER the current one   → hollow dot, label at 0.35
 *   - a connector line BEFORE the current step is rgba(255,255,255,0.55);
 *     lines after it stay at 0.16
 *
 * All of those values live in .sf-step* in globals.css, so this component only
 * decides which modifier each element gets.
 *
 * Sits at the top of the cart panel on event detail, at the top of the
 * checkout panel, and above the confirmation on the success page.
 */

const STEPS = ["TICKETS", "CHECKOUT", "DONE"] as const;

export default function SfStepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="sf-stepper" aria-label={`Checkout step ${current} of ${STEPS.length}`}>
      {STEPS.map((label, i) => {
        const step = i + 1;
        const state = step < current ? "done" : step === current ? "current" : "todo";

        return (
          <Fragment key={label}>
            {/* The connector sits BEFORE this step, so it reads as "done"
                once the step it leads into has been reached. Fragment rather
                than a wrapper div: .sf-stepper is a flex row and the line and
                the step must both be direct flex children. */}
            {i > 0 && (
              <div
                className={`sf-step-line${step <= current ? " sf-step-line--done" : ""}`}
                aria-hidden="true"
              />
            )}
            <div
              className={`sf-step${state === "todo" ? "" : ` sf-step--${state}`}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <div className="sf-step-dot" aria-hidden="true" />
              <div className="sf-step-label">{label}</div>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
