import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// GET /api/marketing/demographics?event_id=xxx — Zip code + survey data for an event
export async function GET(req: NextRequest) {
  const eventId = req.nextUrl.searchParams.get("event_id");
  if (!eventId) {
    return NextResponse.json({ error: "event_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get orders for this event with zip codes
  const { data: orders } = await admin
    .from("orders")
    .select("customer_zip")
    .eq("event_id", eventId)
    .eq("status", "paid");

  // Aggregate zip codes
  const zipCounts: Record<string, number> = {};
  (orders ?? []).forEach((o: { customer_zip: string | null }) => {
    const zip = o.customer_zip?.trim();
    if (zip) {
      zipCounts[zip] = (zipCounts[zip] || 0) + 1;
    }
  });

  const zips = Object.entries(zipCounts)
    .map(([zip, count]) => ({ zip, count }))
    .sort((a, b) => b.count - a.count);

  // Get survey data for this event
  const { data: surveys } = await admin
    .from("post_show_surveys")
    .select("overall_rating, would_return, age_range, gender")
    .eq("event_id", eventId);

  const surveyData = {
    age_range: {} as Record<string, number>,
    gender: {} as Record<string, number>,
    avg_rating: 0,
    total: (surveys ?? []).length,
  };

  let ratingSum = 0;
  let ratingCount = 0;

  (surveys ?? []).forEach((s: { overall_rating: number | null; age_range: string | null; gender: string | null }) => {
    if (s.overall_rating) {
      ratingSum += s.overall_rating;
      ratingCount += 1;
    }
    if (s.age_range) {
      surveyData.age_range[s.age_range] = (surveyData.age_range[s.age_range] || 0) + 1;
    }
    if (s.gender) {
      surveyData.gender[s.gender] = (surveyData.gender[s.gender] || 0) + 1;
    }
  });

  surveyData.avg_rating = ratingCount > 0 ? ratingSum / ratingCount : 0;

  return NextResponse.json({
    zips,
    totalOrders: (orders ?? []).length,
    surveys: surveyData,
  });
}
