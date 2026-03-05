import { NextResponse } from 'next/server';
import { runScanJob } from '@/modules/market-radar/jobs/scanEvents';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await runScanJob();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Scan failed' },
      { status: 500 }
    );
  }
}
