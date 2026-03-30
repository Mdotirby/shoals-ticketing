import { createAdminClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

// Common social media and link preview crawler User-Agent patterns
const BOT_PATTERNS = [
  "facebookexternalhit",
  "Facebot",
  "Twitterbot",
  "LinkedInBot",
  "WhatsApp",
  "Slackbot",
  "TelegramBot",
  "Discordbot",
  "Googlebot",
  "bingbot",
  "iMessageBot",
  "Applebot",
  "Pinterest",
  "redditbot",
  "Embedly",
  "Quora Link Preview",
  "Showyoubot",
  "vkShare",
  "W3C_Validator",
  "Snapchat",
];

function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((pattern) => ua.includes(pattern.toLowerCase()));
}

// GET: public redirect endpoint — tracks click and redirects to destination
// For social media crawlers, serves an HTML page with OG meta tags instead of redirect
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const admin = createAdminClient();
    const origin = new URL(request.url).origin;

    // Look up the trackable link by slug
    const { data: link, error } = await admin
      .from("trackable_links")
      .select("*")
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

    if (error || !link) {
      return NextResponse.redirect(new URL("/", origin));
    }

    const userAgent = request.headers.get("user-agent");

    // ── Social crawler path: serve OG HTML ──
    if (isCrawler(userAgent)) {
      // Fetch event data for rich OG tags
      let ogTitle = "West72 Entertainment";
      let ogDescription = "Get your tickets now";
      let ogImage = "";
      let siteName = "West72 Entertainment";

      if (link.event_id) {
        const { data: event } = await admin
          .from("events")
          .select("title, venue, date, image_url, description")
          .eq("id", link.event_id)
          .single();

        if (event) {
          ogTitle = event.title || ogTitle;

          // Format date for description
          let dateStr = "";
          if (event.date) {
            try {
              const d = new Date(event.date);
              dateStr = d.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              });
            } catch {
              dateStr = event.date;
            }
          }

          ogDescription = dateStr
            ? `${dateStr} · ${event.venue || "Get Tickets"}`
            : event.description?.slice(0, 160) || "Get your tickets now";

          if (event.image_url) {
            ogImage = event.image_url;
          }
        }
      }

      // Detect operator from hostname
      const hostname = new URL(request.url).hostname;
      if (hostname.includes("west72ent")) {
        siteName = "West72 Entertainment";
      } else if (hostname.includes("venuecore")) {
        siteName = "VenueCore";
      }

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(ogTitle)}</title>
  <meta property="og:title" content="${escapeAttr(ogTitle)}" />
  <meta property="og:description" content="${escapeAttr(ogDescription)}" />
  <meta property="og:site_name" content="${escapeAttr(siteName)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeAttr(request.url)}" />
  ${ogImage ? `<meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />` : ""}
  <meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
  ${ogImage ? `<meta name="twitter:image" content="${escapeAttr(ogImage)}" />` : ""}
  <meta http-equiv="refresh" content="0;url=${escapeAttr(link.destination_url)}" />
</head>
<body>
  <p>Redirecting to <a href="${escapeAttr(link.destination_url)}">${escapeHtml(ogTitle)}</a>…</p>
</body>
</html>`;

      return new NextResponse(html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // ── Normal user path: track click and 302 redirect ──

    // Extract tracking info from headers
    const headers = new Headers(request.headers);
    const ip_address =
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      null;
    const user_agent = userAgent || null;
    const referrer = headers.get("referer") || null;

    // Record the click event
    await admin.from("trackable_link_events").insert({
      link_id: link.id,
      event_type: "click",
      ip_address,
      user_agent,
      referrer,
    });

    // Increment denormalized click counter
    await admin
      .from("trackable_links")
      .update({ clicks: (link.clicks || 0) + 1 })
      .eq("id", link.id);

    // 302 redirect to the destination URL
    return NextResponse.redirect(new URL(link.destination_url), 302);
  } catch {
    // On any error, redirect to home
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(new URL("/", origin));
  }
}

// Escape HTML entities for safe embedding
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escape attribute values
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
