import { Fragment } from "react";
import { linkSegments } from "@/lib/text/autolink";

/**
 * Text with the links in it made clickable.
 *
 * The matching is in lib/text/autolink.ts; this only turns its segments into
 * elements. React escapes the text itself, and the href is one the matcher
 * already vetted down to http, https or mailto — so there is no
 * dangerouslySetInnerHTML here and nothing a pasted "javascript:" can do.
 *
 * Line breaks are NOT handled here. They are CSS (`white-space: pre-line`) on
 * whichever element wraps this, so the same component works in a place that
 * wants text to flow and a place that wants it laid out as typed.
 *
 * No state and no handlers: a click that also needs to not reach a clickable
 * parent is that parent's business, not this component's — see the tier list
 * in OrderSummary.
 */
export default function AutoLinkText({ text }: { text: string | null | undefined }) {
  const segments = linkSegments(text);
  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((s, i) =>
        s.kind === "link" ? (
          <a
            key={i}
            href={s.href}
            target="_blank"
            // noopener so the opened page cannot reach back through
            // window.opener; noreferrer so a buyer's path here is not handed
            // to whatever a promoter linked to.
            rel="noopener noreferrer"
            className="sf-autolink"
          >
            {s.text}
          </a>
        ) : (
          <Fragment key={i}>{s.text}</Fragment>
        ),
      )}
    </>
  );
}
