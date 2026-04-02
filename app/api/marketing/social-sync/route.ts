import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/*  GET — Return current sync status                                   */
/* ------------------------------------------------------------------ */

export async function GET() {
  const token = process.env.META_SYSTEM_TOKEN;
  const configured = !!token;

  let lastSync: string | null = null;
  let metricCount = 0;
  let tokenStatus: "valid" | "expired" | "invalid" | "unknown" = "unknown";
  let tokenError: string | null = null;
  let pages: string[] = [];
  let igConnected = false;

  if (configured) {
    // Test token validity by calling /me
    try {
      const meRes = await fetch(`https://graph.facebook.com/v21.0/me?access_token=${token}`);
      if (meRes.ok) {
        tokenStatus = "valid";

        // Check for pages
        const acctRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`);
        if (acctRes.ok) {
          const acctData = (await acctRes.json()) as { data?: Array<{ name: string; id: string }> };
          pages = (acctData.data || []).map((p) => `${p.name} (${p.id})`);

          // Check for IG connection on first page
          if (acctData.data && acctData.data.length > 0) {
            const pageId = acctData.data[0].id;
            const igRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${token}`);
            if (igRes.ok) {
              const igData = (await igRes.json()) as { instagram_business_account?: { id: string } };
              igConnected = !!igData.instagram_business_account;
            }
          }
        }
      } else {
        const err = await meRes.json().catch(() => ({}));
        const metaErr = (err as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
        const code = metaErr?.code as number | undefined;
        if (meRes.status === 401 || code === 190) {
          tokenStatus = "expired";
          tokenError = "Token expired. Generate a new System User Token in Meta Business Manager.";
        } else {
          tokenStatus = "invalid";
          tokenError = (metaErr?.message as string) || `HTTP ${meRes.status}`;
        }
      }
    } catch (e) {
      tokenError = e instanceof Error ? e.message : "Network error testing token";
    }

    try {
      const supabase = createAdminClient();
      const { data } = await supabase
        .from("social_metrics")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        lastSync = (data[0] as Record<string, unknown>).created_at as string;
      }

      const { count } = await supabase
        .from("social_metrics")
        .select("id", { count: "exact", head: true });

      metricCount = count || 0;
    } catch {
      // social_metrics table may not exist yet
    }
  }

  return NextResponse.json({
    configured,
    token_status: tokenStatus,
    token_error: tokenError,
    pages,
    ig_connected: igConnected,
    last_sync: lastSync,
    metric_count: metricCount,
    instructions: configured
      ? undefined
      : "Set META_SYSTEM_TOKEN in Vercel env vars. Optionally set META_PAGE_ID and META_IG_USER_ID.",
  });
}

/* ------------------------------------------------------------------ */
/*  POST — Sync social insights from Meta Graph API                    */
/* ------------------------------------------------------------------ */

export async function POST() {
  const token = process.env.META_SYSTEM_TOKEN;

  if (!token) {
    return NextResponse.json(
      {
        error: "Meta API not configured",
        instructions:
          "Set META_SYSTEM_TOKEN in Vercel env vars to enable social sync.",
      },
      { status: 400 }
    );
  }

  try {
    /* ── Discover Page ID and IG User ID ───────────────────── */
    let pageId = process.env.META_PAGE_ID || "";
    let igUserId = process.env.META_IG_USER_ID || "";
    let pageAccessToken = token;

    if (!pageId) {
      const accountsUrl = `https://graph.facebook.com/v21.0/me/accounts?access_token=${token}`;
      const accountsRes = await fetch(accountsUrl);

      if (!accountsRes.ok) {
        const err = await accountsRes.json().catch(() => ({}));
        const metaErr = (err as Record<string, unknown>)?.error as Record<string, unknown> | undefined;

        if (accountsRes.status === 401 || (metaErr?.code as number) === 190) {
          return NextResponse.json(
            { error: "Meta API token expired", details: "Generate a new token in Meta Business Manager → System Users." },
            { status: 401 }
          );
        }
        return NextResponse.json(
          { error: "Failed to discover Facebook pages", details: metaErr?.message || `HTTP ${accountsRes.status}` },
          { status: 502 }
        );
      }

      const accountsData = (await accountsRes.json()) as { data: Array<Record<string, unknown>> };
      if (!accountsData.data || accountsData.data.length === 0) {
        return NextResponse.json(
          { error: "No Facebook pages found", details: "The token doesn't have access to any Facebook pages." },
          { status: 404 }
        );
      }

      pageId = accountsData.data[0].id as string;
      pageAccessToken = (accountsData.data[0].access_token as string) || token;
    }

    await delay(200);

    /* ── Fetch Facebook Page Insights (last 30 days) ───────── */
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since = Math.floor(thirtyDaysAgo.getTime() / 1000);
    const until = Math.floor(now.getTime() / 1000);

    // Fetch FB Page Insights — try classic metrics first, fall back to post-based aggregation
    // Many Pages are on "New Pages Experience" (NPE) where /{page-id}/insights is fully deprecated
    const FULL_METRICS = "page_impressions,page_engaged_users,page_fan_adds,page_views_total,page_post_engagements";

    let fbInsights: Array<Record<string, unknown>> = [];
    let fbInsightsError: string | null = null;
    let usePostBasedMetrics = false;

    const pageInsightsUrl = new URL(`https://graph.facebook.com/v21.0/${pageId}/insights`);
    pageInsightsUrl.searchParams.set("metric", FULL_METRICS);
    pageInsightsUrl.searchParams.set("period", "day");
    pageInsightsUrl.searchParams.set("since", since.toString());
    pageInsightsUrl.searchParams.set("until", until.toString());
    pageInsightsUrl.searchParams.set("access_token", pageAccessToken);

    try {
      const fbRes = await fetch(pageInsightsUrl.toString());
      if (fbRes.ok) {
        const fbData = (await fbRes.json()) as { data: Array<Record<string, unknown>> };
        fbInsights = fbData.data || [];
      } else {
        // Classic insights failed — page likely uses New Pages Experience
        usePostBasedMetrics = true;
        const errBody = await fbRes.json().catch(() => ({}));
        const metaErr = (errBody as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
        console.warn("FB Page Insights unavailable (NPE page), using post-based metrics:", metaErr?.message);
      }
    } catch (e) {
      usePostBasedMetrics = true;
      console.warn("FB Page Insights fetch failed:", e);
    }

    // Fetch page-level fan count and followers (works on all page types including NPE)
    let pageFanCount = 0;
    let pageFollowersCount = 0;
    try {
      const pageProfileUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=fan_count,followers_count&access_token=${pageAccessToken}`;
      const pageProfileRes = await fetch(pageProfileUrl);
      if (pageProfileRes.ok) {
        const profileData = (await pageProfileRes.json()) as { fan_count?: number; followers_count?: number };
        pageFanCount = profileData.fan_count || 0;
        pageFollowersCount = profileData.followers_count || 0;
      }
    } catch {
      // Non-critical
    }

    await delay(200);

    /* ── Fetch recent Page posts ───────────────────────────── */
    const postsUrl = new URL(`https://graph.facebook.com/v21.0/${pageId}/posts`);
    postsUrl.searchParams.set("fields", "message,created_time,shares,likes.summary(true),comments.summary(true)");
    postsUrl.searchParams.set("limit", "25");
    postsUrl.searchParams.set("access_token", pageAccessToken);

    let fbPosts: Array<Record<string, unknown>> = [];
    try {
      const postsRes = await fetch(postsUrl.toString());
      if (postsRes.ok) {
        const postsData = (await postsRes.json()) as { data: Array<Record<string, unknown>> };
        fbPosts = postsData.data || [];
      } else {
        console.warn("FB Posts fetch error:", await postsRes.text().catch(() => ""));
      }
    } catch (e) {
      console.warn("FB Posts fetch failed:", e);
    }

    await delay(200);

    /* ── Fetch Instagram Insights (if available) ───────────── */
    let igInsights: Array<Record<string, unknown>> = [];

    // Discover IG user ID if not set
    if (!igUserId && pageId) {
      try {
        const igDiscoverUrl = `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`;
        const igDiscoverRes = await fetch(igDiscoverUrl);
        if (igDiscoverRes.ok) {
          const igDiscoverData = (await igDiscoverRes.json()) as Record<string, unknown>;
          const igAccount = igDiscoverData.instagram_business_account as Record<string, unknown> | undefined;
          if (igAccount?.id) {
            igUserId = igAccount.id as string;
          }
        }
      } catch {
        // IG discovery failed — skip
      }
      await delay(200);
    }

    if (igUserId) {
      // Fix 1: Use pageAccessToken (not system token) for IG insights
      // Fix 2: Remove 'follower_count' — it's deprecated in the /insights endpoint
      //        Fetch it separately via the IG user profile instead
      const igUrl = new URL(`https://graph.facebook.com/v21.0/${igUserId}/insights`);
      igUrl.searchParams.set("metric", "reach,impressions,accounts_engaged");
      igUrl.searchParams.set("period", "day");
      igUrl.searchParams.set("metric_type", "total_value");
      igUrl.searchParams.set("since", since.toString());
      igUrl.searchParams.set("until", until.toString());
      igUrl.searchParams.set("access_token", pageAccessToken);

      let igInsightsError: string | null = null;
      try {
        const igRes = await fetch(igUrl.toString());
        if (igRes.ok) {
          const igData = (await igRes.json()) as { data: Array<Record<string, unknown>> };
          igInsights = igData.data || [];
        } else {
          const errBody = await igRes.json().catch(() => ({}));
          const metaErr = (errBody as Record<string, unknown>)?.error as Record<string, unknown> | undefined;
          igInsightsError = (metaErr?.message as string) || `HTTP ${igRes.status}`;
          console.warn("IG Insights error:", errBody);
        }
      } catch (e) {
        igInsightsError = e instanceof Error ? e.message : "Network error";
        console.warn("IG Insights fetch failed:", e);
      }

      await delay(200);

      // Fetch follower count separately (not deprecated)
      try {
        const igProfileUrl = `https://graph.facebook.com/v21.0/${igUserId}?fields=followers_count&access_token=${pageAccessToken}`;
        const igProfileRes = await fetch(igProfileUrl);
        if (igProfileRes.ok) {
          const igProfile = (await igProfileRes.json()) as { followers_count?: number };
          if (typeof igProfile.followers_count === "number") {
            // Inject as a synthetic insight entry so parsing logic below works
            igInsights.push({ name: "follower_count", total_value: { value: igProfile.followers_count }, values: [] });
          }
        }
      } catch (e) {
        console.warn("IG follower count fetch failed:", e);
      }
    }

    /* ── Parse insights into summary ───────────────────────── */
    const summary = {
      facebook: {
        impressions: 0,
        engaged_users: 0,
        new_fans: 0,
        page_views: 0,
        post_engagements: 0,
      },
      instagram: {
        reach: 0,
        impressions: 0,
        accounts_engaged: 0,
        follower_count: 0,
      },
      posts: [] as Array<{
        id: string;
        message: string;
        created_time: string;
        likes: number;
        comments: number;
        shares: number;
      }>,
    };

    // Parse FB insights
    for (const metric of fbInsights) {
      const name = metric.name as string;
      const values = (metric.values as Array<{ value: number }>) || [];
      const total = values.reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);

      switch (name) {
        case "page_impressions": summary.facebook.impressions = total; break;
        case "page_engaged_users": summary.facebook.engaged_users = total; break;
        case "page_fan_adds": summary.facebook.new_fans = total; break;
        case "page_views_total": summary.facebook.page_views = total; break;
        case "page_post_engagements": summary.facebook.post_engagements = total; break;
      }
    }

    // Parse IG insights
    for (const metric of igInsights) {
      const name = metric.name as string;
      const totalValue = metric.total_value as Record<string, unknown> | undefined;
      const values = (metric.values as Array<{ value: number }>) || [];
      const val = totalValue?.value as number || values.reduce((s, v) => s + (typeof v.value === "number" ? v.value : 0), 0);

      switch (name) {
        case "reach": summary.instagram.reach = val; break;
        case "impressions": summary.instagram.impressions = val; break;
        case "accounts_engaged": summary.instagram.accounts_engaged = val; break;
        case "follower_count": summary.instagram.follower_count = val; break;
      }
    }

    // Parse FB posts
    for (const post of fbPosts) {
      const likes = (post.likes as Record<string, unknown>)?.summary as Record<string, unknown> | undefined;
      const comments = (post.comments as Record<string, unknown>)?.summary as Record<string, unknown> | undefined;
      const shares = post.shares as Record<string, unknown> | undefined;

      summary.posts.push({
        id: post.id as string,
        message: (post.message as string) || "",
        created_time: (post.created_time as string) || "",
        likes: (likes?.total_count as number) || 0,
        comments: (comments?.total_count as number) || 0,
        shares: (shares?.count as number) || 0,
      });
    }

    // ── Post-based fallback for NPE pages where insights are unavailable ──
    if (usePostBasedMetrics && summary.posts.length > 0) {
      // Aggregate engagement from individual posts as a substitute for page insights
      let totalLikes = 0, totalComments = 0, totalShares = 0;
      for (const p of summary.posts) {
        totalLikes += p.likes;
        totalComments += p.comments;
        totalShares += p.shares;
      }
      summary.facebook.post_engagements = totalLikes + totalComments + totalShares;
      summary.facebook.engaged_users = totalLikes + totalComments; // approximate
      // No page-level impressions available — use post count as a proxy signal
      summary.facebook.impressions = summary.posts.length; // indicates active page
      fbInsightsError = `Page uses New Pages Experience — metrics computed from ${summary.posts.length} recent posts (${totalLikes} likes, ${totalComments} comments, ${totalShares} shares)`;
    }

    // Use page profile data for fan/follower counts (works on all page types)
    if (pageFanCount > 0 || pageFollowersCount > 0) {
      summary.facebook.new_fans = pageFollowersCount || pageFanCount;
    }

    /* ── Store in social_metrics table ─────────────────────── */
    let storedCount = 0;
    try {
      const supabase = createAdminClient();
      const today = new Date().toISOString().split("T")[0];

      // Store Facebook summary (store if we have any data — insights OR post-based)
      if (summary.facebook.impressions > 0 || summary.facebook.post_engagements > 0 || summary.facebook.new_fans > 0) {
        const { error: fbErr } = await supabase.from("social_metrics").upsert(
          {
            platform: "facebook",
            recorded_date: today,
            impressions: summary.facebook.impressions,
            engagements: summary.facebook.post_engagements,
            shares: 0,
            mentions: summary.facebook.new_fans,
            notes: `Auto-synced from Meta API. Page views: ${summary.facebook.page_views}, Engaged users: ${summary.facebook.engaged_users}`,
          },
          { onConflict: "platform,recorded_date" }
        );
        if (!fbErr) storedCount++;
      }

      // Store Instagram summary
      // Store reach in 'impressions' column so "Total Reach" aggregate works on page load
      if (summary.instagram.reach > 0 || summary.instagram.impressions > 0) {
        const { error: igErr } = await supabase.from("social_metrics").upsert(
          {
            platform: "instagram",
            recorded_date: today,
            impressions: summary.instagram.reach,              // reach → impressions for UI aggregate
            engagements: summary.instagram.accounts_engaged,
            shares: 0,
            mentions: summary.instagram.follower_count,
            notes: `Auto-synced from Meta API. Impressions: ${summary.instagram.impressions}, Accounts engaged: ${summary.instagram.accounts_engaged}`,
          },
          { onConflict: "platform,recorded_date" }
        );
        if (!igErr) storedCount++;
      }

      // Store top posts
      for (const post of summary.posts.slice(0, 10)) {
        try {
          await supabase.from("social_metrics").upsert(
            {
              platform: "facebook",
              recorded_date: post.created_time ? post.created_time.split("T")[0] : today,
              impressions: 0,
              engagements: post.likes + post.comments,
              shares: post.shares,
              mentions: 0,
              hashtag: null,
              notes: `Post: ${post.message?.substring(0, 100) || "(no text)"}`,
            },
            { onConflict: "platform,recorded_date" }
          );
        } catch {
          // Non-critical
        }
      }
    } catch (e) {
      console.warn("social_metrics table may not exist:", e);
    }

    // Collect any API diagnostics for display in the UI
    const diagnostics: Record<string, string> = {};
    if (fbInsightsError) {
      diagnostics[usePostBasedMetrics ? "fb_insights_note" : "fb_insights_error"] = fbInsightsError;
    }
    // Check if IG insights came back empty
    if (igUserId && igInsights.length === 0 && summary.instagram.reach === 0 && summary.instagram.impressions === 0 && summary.instagram.follower_count === 0) {
      diagnostics.ig_insights_error = "IG insights returned no data — check that the token has instagram_manage_insights permission.";
    }

    return NextResponse.json({
      success: true,
      page_id: pageId,
      ig_user_id: igUserId || null,
      facebook: summary.facebook,
      instagram: summary.instagram,
      posts_fetched: summary.posts.length,
      metrics_stored: storedCount,
      synced_at: new Date().toISOString(),
      posts: summary.posts,
      ...(Object.keys(diagnostics).length > 0 ? { diagnostics } : {}),
    });
  } catch (err) {
    console.error("Social sync error:", err);
    return NextResponse.json(
      {
        error: "Social sync failed",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
