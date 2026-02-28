import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";
import { PKPass } from "passkit-generator";
import path from "path";
import fs from "fs";

// GET /api/tickets/{qr_code}/wallet — Generate Apple Wallet .pkpass
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();

  // Fetch ticket + event details
  const { data: ticket, error } = await admin
    .from("tickets")
    .select("*, events!inner(title, venue, date, image_url)")
    .eq("qr_code", id)
    .single();

  if (error || !ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Check for Apple Wallet certificates
  const certsDir = path.join(process.cwd(), "certs");
  const signerCert = path.join(certsDir, "signerCert.pem");
  const signerKey = path.join(certsDir, "signerKey.pem");
  const wwdr = path.join(certsDir, "wwdr.pem");

  if (!fs.existsSync(signerCert) || !fs.existsSync(signerKey) || !fs.existsSync(wwdr)) {
    return NextResponse.json(
      { error: "Apple Wallet certificates not configured. Contact support." },
      { status: 503 }
    );
  }

  try {
    const event = ticket.events;
    const eventDate = new Date(
      event.date.length === 10 ? event.date + "T19:00:00" : event.date
    );

    const pass = new PKPass(
      {},
      {
        signerCert: fs.readFileSync(signerCert),
        signerKey: fs.readFileSync(signerKey),
        wwdr: fs.readFileSync(wwdr),
        signerKeyPassphrase: process.env.APPLE_PASS_KEY_PASSPHRASE || "",
      },
      {
        formatVersion: 1,
        passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID || "pass.live.venuecore.tickets",
        teamIdentifier: process.env.APPLE_TEAM_ID || "",
        organizationName: "VenueCore",
        description: `Ticket for ${event.title}`,
        serialNumber: ticket.qr_code,
        foregroundColor: "rgb(255, 255, 255)",
        backgroundColor: "rgb(11, 13, 29)",
        labelColor: "rgb(208, 194, 144)",
        logoText: "VenueCore",
      }
    );

    // Set as event ticket
    pass.type = "eventTicket";

    // Primary fields
    pass.primaryFields.push({
      key: "event",
      label: "EVENT",
      value: event.title,
    });

    // Secondary fields
    pass.secondaryFields.push(
      {
        key: "date",
        label: "DATE",
        value: eventDate.toISOString(),
        dateStyle: "PKDateStyleMedium",
        timeStyle: "PKDateStyleNone",
      },
      {
        key: "venue",
        label: "VENUE",
        value: event.venue,
      }
    );

    // Auxiliary fields
    pass.auxiliaryFields.push(
      {
        key: "guest",
        label: "GUEST",
        value: ticket.customer_name || "Guest",
      },
      {
        key: "type",
        label: "TYPE",
        value: "General Admission",
      }
    );

    // Back fields (shown when pass is flipped)
    pass.backFields.push(
      {
        key: "email",
        label: "Email",
        value: ticket.customer_email || "",
      },
      {
        key: "terms",
        label: "Terms",
        value: "All sales are final. Refunds issued only if event is cancelled by organizer.",
      }
    );

    // Set barcode (QR code)
    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: `https://venuecore.live/tickets/${ticket.qr_code}`,
      messageEncoding: "iso-8859-1",
      altText: ticket.qr_code,
    });

    // Set relevant date for lock screen
    pass.setRelevantDate(eventDate);

    // Generate the .pkpass buffer
    const buffer = pass.getAsBuffer();

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition": `attachment; filename="${event.title.replace(/[^a-zA-Z0-9]/g, "-")}-ticket.pkpass"`,
      },
    });
  } catch (err) {
    console.error("Apple Wallet pass generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate Apple Wallet pass" },
      { status: 500 }
    );
  }
}
