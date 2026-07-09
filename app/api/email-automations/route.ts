import { NextResponse } from "next/server";

const GONE = { error: "This endpoint is retired." };

export async function GET() { return NextResponse.json(GONE, { status: 410 }); }
export async function POST() { return NextResponse.json(GONE, { status: 410 }); }
export async function PUT() { return NextResponse.json(GONE, { status: 410 }); }
export async function DELETE() { return NextResponse.json(GONE, { status: 410 }); }
