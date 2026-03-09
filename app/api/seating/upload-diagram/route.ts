import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * POST /api/seating/upload-diagram
 * Upload a seating diagram (PDF, PNG, JPG) to Supabase Storage bucket: seating-diagrams
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PDF, PNG, and JPG are allowed." },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 20 MB." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await admin.storage
      .from("seating-diagrams")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage
      .from("seating-diagrams")
      .getPublicUrl(fileName);

    return NextResponse.json({ url: urlData.publicUrl, fileName });
  } catch (err) {
    console.error("Diagram upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
