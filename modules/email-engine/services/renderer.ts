/**
 * Email Engine — template renderer.
 *
 * Replaces `{{variable}}` tokens with context values, stamps every link
 * with UTM parameters pointing back at the owning campaign or automation
 * run, and injects an unsubscribe footer. Pure, synchronous, no I/O.
 */

import { EMAIL_ENGINE } from "../constants";
import type { RenderContext } from "../types";

export type RenderArgs = {
  subject: string;
  content_html: string;
  content_text?: string | null;
  context: RenderContext;
  /** UTM payload — { campaign: "ee:<id>", medium: "email", etc. } */
  utm?: Record<string, string>;
  /** Absolute unsubscribe URL — appended as footer + List-Unsubscribe header. */
  unsubscribe_url?: string;
};

export type Rendered = {
  subject: string;
  html: string;
  text: string;
  list_unsubscribe_header: string | null;
};

const VAR_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

/** Replace {{var}} tokens — unknown tokens are stripped (empty string). */
export function replaceVars(s: string, ctx: RenderContext): string {
  return s.replace(VAR_RE, (_, name: string) => {
    const v = ctx[name];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Rewrite every href to include UTM params. Only touches http(s) links. */
export function stampUtmOnLinks(html: string, utm: Record<string, string>): string {
  const qs = Object.entries(utm)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  if (!qs) return html;
  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (_m, url: string) => {
      try {
        const u = new URL(url);
        Object.entries(utm).forEach(([k, v]) => u.searchParams.set(k, v));
        return `href="${u.toString()}"`;
      } catch {
        // Not a parseable URL — fall back to naive concat.
        const sep = url.includes("?") ? "&" : "?";
        return `href="${url}${sep}${qs}"`;
      }
    },
  );
}

const FOOTER_MARK = "<!-- ee-footer -->";

function unsubscribeFooter(url: string): string {
  return `${FOOTER_MARK}
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888;text-align:center;font-family:Helvetica,Arial,sans-serif">
  <p style="margin:0 0 6px">You're receiving this email because you opted in via VenueCore.</p>
  <p style="margin:0"><a href="${url}" style="color:#888;text-decoration:underline">Unsubscribe</a></p>
</div>`;
}

/** Strip HTML tags crudely for a text fallback when one isn't provided. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function renderEmail(args: RenderArgs): Rendered {
  const { context, utm = {}, unsubscribe_url } = args;

  // 1. Variable substitution
  let html = replaceVars(args.content_html, context);
  const subject = replaceVars(args.subject, context);

  // Remove <img> tags with empty src — happens when {{event_image}} resolves
  // to "" because no image was supplied. Avoids visible broken-image icons
  // in clients that render `<img src="">`.
  html = html.replace(/<img\b[^>]*\bsrc=["']\s*["'][^>]*>/gi, "");

  // 2. UTM stamping — merge defaults
  const utmAll: Record<string, string> = {
    utm_source: EMAIL_ENGINE.UTM_SOURCE,
    utm_medium: "email",
    ...utm,
  };
  html = stampUtmOnLinks(html, utmAll);

  // 3. Unsubscribe footer (append once)
  if (unsubscribe_url && !html.includes(FOOTER_MARK)) {
    html = html + "\n" + unsubscribeFooter(unsubscribe_url);
  }

  // 4. Text body
  const text = args.content_text
    ? replaceVars(args.content_text, context)
    : htmlToText(html);

  // 5. List-Unsubscribe header (RFC 8058 one-click)
  const list_unsubscribe_header = unsubscribe_url
    ? `<${unsubscribe_url}>`
    : null;

  return { subject, html, text, list_unsubscribe_header };
}
