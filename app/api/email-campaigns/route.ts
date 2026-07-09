import { NextResponse } from "next/server";

const GONE = { error: "This endpoint is retired. Use /api/broadcasts instead." };

export async function GET() { return NextResponse.json(GONE, { status: 410 }); }
export async function POST() { return NextResponse.json(GONE, { status: 410 }); }
