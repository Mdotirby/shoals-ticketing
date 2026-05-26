import { NextResponse } from "next/server";

function toE164(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.LAYLO_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Laylo not configured" }, { status: 500 });
  }

  let body: { phone?: string; firstName?: string; lastName?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { phone, firstName, lastName, source = "west72" } = body;

  if (!phone) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }

  const e164 = toE164(phone);
  if (!e164) {
    return NextResponse.json({ error: "Invalid US phone number" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.laylo.com/v1/fans/subscribe", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone: e164,
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        source,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Laylo] subscribe error:", res.status, err);
      // Treat 409 (already subscribed) as success — fan is on the list
      if (res.status === 409) {
        return NextResponse.json({ success: true, alreadySubscribed: true });
      }
      return NextResponse.json({ error: "Laylo error" }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Laylo] fetch error:", err);
    return NextResponse.json({ error: "Network error" }, { status: 502 });
  }
}
