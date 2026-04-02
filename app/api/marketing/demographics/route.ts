import { createAdminClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

// Simple in-memory cache for zip → lat/lng (persists across requests in the same serverless invocation)
const geoCache: Record<string, { lat: number; lng: number } | null> = {};

async function geocodeZip(zip: string): Promise<{ lat: number; lng: number } | null> {
  if (geoCache[zip] !== undefined) return geoCache[zip];

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!apiKey) {
    // Fallback: approximate lat/lng from first 3 digits of zip (crude US region mapping)
    geoCache[zip] = approximateZipLocation(zip);
    return geoCache[zip];
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(zip)}&components=country:US&key=${apiKey}`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.results?.[0]?.geometry?.location) {
        const { lat, lng } = data.results[0].geometry.location;
        geoCache[zip] = { lat, lng };
        return geoCache[zip];
      }
    }
  } catch {
    // Geocoding failed — use fallback
  }

  geoCache[zip] = approximateZipLocation(zip);
  return geoCache[zip];
}

// Approximate US zip code to lat/lng using the first 3 digits (ZIP3 centroid)
// This is a rough fallback when no Google API key is available
function approximateZipLocation(zip: string): { lat: number; lng: number } | null {
  const zip3 = zip.substring(0, 3);
  // Common Alabama / Shoals area zips and surrounding regions
  const ZIP3_CENTROIDS: Record<string, { lat: number; lng: number }> = {
    "350": { lat: 33.52, lng: -86.80 }, // Birmingham AL
    "351": { lat: 33.52, lng: -86.80 }, // Birmingham AL
    "352": { lat: 33.52, lng: -86.80 }, // Birmingham AL
    "353": { lat: 33.38, lng: -86.75 }, // Birmingham south
    "354": { lat: 33.21, lng: -87.57 }, // Tuscaloosa AL
    "355": { lat: 33.21, lng: -87.57 }, // Tuscaloosa AL
    "356": { lat: 34.73, lng: -87.68 }, // Florence / Shoals AL
    "357": { lat: 34.60, lng: -86.98 }, // Huntsville AL area
    "358": { lat: 34.73, lng: -86.59 }, // Huntsville AL
    "359": { lat: 34.73, lng: -86.59 }, // Huntsville AL
    "360": { lat: 32.38, lng: -86.30 }, // Montgomery AL
    "361": { lat: 32.38, lng: -86.30 }, // Montgomery AL
    "362": { lat: 33.45, lng: -86.90 }, // Central AL
    "363": { lat: 34.20, lng: -86.20 }, // NE Alabama
    "364": { lat: 34.00, lng: -85.00 }, // NE Alabama
    "365": { lat: 31.22, lng: -85.39 }, // Dothan AL
    "366": { lat: 30.69, lng: -88.04 }, // Mobile AL
    "367": { lat: 32.00, lng: -86.50 }, // Selma AL area
    "368": { lat: 33.50, lng: -86.30 }, // Central AL
    "386": { lat: 34.80, lng: -89.99 }, // N Mississippi
    "387": { lat: 34.26, lng: -88.70 }, // NE Mississippi
    "388": { lat: 34.95, lng: -89.85 }, // Tupelo MS area
    "300": { lat: 33.75, lng: -84.39 }, // Atlanta GA
    "301": { lat: 33.75, lng: -84.39 }, // Atlanta GA
    "370": { lat: 36.16, lng: -86.78 }, // Nashville TN
    "371": { lat: 36.16, lng: -86.78 }, // Nashville TN
    "372": { lat: 36.16, lng: -86.78 }, // Nashville TN
    "376": { lat: 35.04, lng: -85.31 }, // Chattanooga TN
    "377": { lat: 35.96, lng: -83.92 }, // Knoxville TN
    "378": { lat: 35.15, lng: -90.05 }, // Memphis TN area
    "380": { lat: 35.15, lng: -90.05 }, // Memphis TN
    "381": { lat: 35.15, lng: -90.05 }, // Memphis TN
  };

  if (ZIP3_CENTROIDS[zip3]) return ZIP3_CENTROIDS[zip3];

  // Very rough US region fallback by first digit
  const firstDigit = zip.charAt(0);
  const REGION_CENTROIDS: Record<string, { lat: number; lng: number }> = {
    "0": { lat: 42.36, lng: -71.06 }, // Northeast
    "1": { lat: 40.71, lng: -74.01 }, // NY/NJ
    "2": { lat: 38.91, lng: -77.04 }, // Mid-Atlantic
    "3": { lat: 33.75, lng: -84.39 }, // Southeast
    "4": { lat: 39.96, lng: -83.00 }, // Midwest
    "5": { lat: 44.98, lng: -93.27 }, // Upper Midwest
    "6": { lat: 41.88, lng: -87.63 }, // Central
    "7": { lat: 29.76, lng: -95.37 }, // South Central
    "8": { lat: 39.74, lng: -104.99 }, // Mountain West
    "9": { lat: 37.77, lng: -122.42 }, // West Coast
  };

  return REGION_CENTROIDS[firstDigit] || { lat: 34.73, lng: -87.68 }; // Default: Florence AL
}

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

  // Geocode zip codes to lat/lng for heatmap
  const heatmapPoints: Array<{ lat: number; lng: number; weight: number; zip: string }> = [];
  for (const z of zips) {
    const coords = await geocodeZip(z.zip);
    if (coords) {
      heatmapPoints.push({ lat: coords.lat, lng: coords.lng, weight: z.count, zip: z.zip });
    }
  }

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
    heatmapPoints,
    totalOrders: (orders ?? []).length,
    surveys: surveyData,
  });
}
