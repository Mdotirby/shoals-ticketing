import { NextResponse } from "next/server";
import { syncDailyMetrics } from "@/modules/ad-engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncDailyMetrics();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[Cron] ad-engine-metrics failed:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
