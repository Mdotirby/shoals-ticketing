import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/layouts/upload-background
 * Upload a background image (PNG/JPG) for a seating layout.
 * PDF-to-PNG conversion happens client-side via pdfjs-dist.
 * This endpoint receives the already-converted PNG.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const layoutId = formData.get("layout_id") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const fileName = `layout-bg-${layoutId || Date.now()}-${Date.now()}.${ext}`;

    // Upload to venue-layouts bucket
    const { error: uploadError } = await admin.storage
      .from("venue-layouts")
      .upload(fileName, buffer, {
        contentType: file.type || "image/png",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Upload failed: " + uploadError.message },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage
      .from("venue-layouts")
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    // If layoutId provided, update the layout record
    if (layoutId) {
      await admin
        .from("venue_layouts")
        .update({ background_image_url: publicUrl })
        .eq("id", layoutId);
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
