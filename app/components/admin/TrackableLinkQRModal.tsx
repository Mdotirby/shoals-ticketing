"use client";

import { useEffect, useState } from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const QRCode = require("qrcode");

type Props = {
  url: string;
  label: string;
  eventTitle?: string;
  onClose: () => void;
};

/**
 * Modal that renders a QR code for a trackable link with download options.
 * Generates the QR client-side via the `qrcode` package (no DB storage needed —
 * the QR is deterministic from the URL).
 */
export default function TrackableLinkQRModal({ url, label, eventTitle, onClose }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  // Generate the QR image as a data URL for display + plain download
  useEffect(() => {
    QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      color: { dark: "#0b0d1d", light: "#ffffff" },
    })
      .then((dataUrl: string) => setQrDataUrl(dataUrl))
      .catch((err: unknown) => {
        console.error("QR generation failed:", err);
      });
  }, [url]);

  // Download a plain QR code PNG (just the code, no surrounding graphics)
  function downloadPlainQR() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `qr-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  }

  // Build a "flyer" PNG with the QR plus event title, label, and URL text
  async function downloadFlyerQR() {
    if (!qrDataUrl) return;

    const canvas = document.createElement("canvas");
    const size = 1000;
    canvas.width = size;
    canvas.height = size + 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load the QR image onto the canvas
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, (canvas.width - size) / 2, 40, size, size);
        resolve();
      };
      img.src = qrDataUrl;
    });

    // Event title (if provided)
    if (eventTitle) {
      ctx.fillStyle = "#0b0d1d";
      ctx.font = "bold 52px 'Helvetica Neue', Helvetica, Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(eventTitle, canvas.width / 2, size + 110);
    }

    // Label / CTA
    ctx.fillStyle = "#6b6b6b";
    ctx.font = "500 32px 'Helvetica Neue', Helvetica, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Scan for tickets — ${label}`, canvas.width / 2, size + (eventTitle ? 170 : 130));

    // URL
    ctx.fillStyle = "#888";
    ctx.font = "24px monospace";
    ctx.fillText(url, canvas.width / 2, size + (eventTitle ? 215 : 170));

    // Trigger download
    const flyerUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = flyerUrl;
    a.download = `qr-flyer-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 12,
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#131629",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: 14,
          padding: 20,
          maxWidth: 440,
          width: "100%",
          maxHeight: "calc(100vh - 24px)",
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>
              QR Code
            </h2>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
              {label}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none",
              color: "rgba(255,255,255,0.5)", cursor: "pointer",
              fontSize: 20, lineHeight: 1, padding: 4,
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* QR image container */}
        <div style={{
          background: "#fff", borderRadius: 10,
          padding: 16, display: "flex", justifyContent: "center",
        }}>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`QR code for ${url}`}
              style={{ width: "100%", maxWidth: 320, height: "auto" }}
            />
          ) : (
            <div style={{ minHeight: 240, display: "flex", alignItems: "center", color: "#666" }}>
              Generating…
            </div>
          )}
        </div>

        {/* URL display */}
        <div style={{
          padding: "10px 14px", borderRadius: 8,
          background: "rgba(6,182,212,0.08)",
          border: "1px solid rgba(6,182,212,0.2)",
          fontSize: 12, color: "#06b6d4",
          fontFamily: "monospace", wordBreak: "break-all",
          textAlign: "center",
        }}>
          {url}
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={downloadPlainQR}
            disabled={!qrDataUrl}
            style={{
              width: "100%",
              padding: "12px 16px", borderRadius: 8,
              fontSize: 14, fontWeight: 600,
              background: "rgba(6,182,212,0.12)",
              border: "1px solid rgba(6,182,212,0.3)",
              color: "#06b6d4",
              cursor: qrDataUrl ? "pointer" : "not-allowed",
              opacity: qrDataUrl ? 1 : 0.5,
            }}
          >
            Download QR Only
          </button>
          <button
            onClick={downloadFlyerQR}
            disabled={!qrDataUrl}
            style={{
              width: "100%",
              padding: "12px 16px", borderRadius: 8,
              fontSize: 14, fontWeight: 600,
              background: "rgba(255, 255, 255, 0.12)",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              color: "#ffffff",
              cursor: qrDataUrl ? "pointer" : "not-allowed",
              opacity: qrDataUrl ? 1 : 0.5,
            }}
          >
            Download Printable Flyer
          </button>
        </div>

      </div>
    </div>
  );
}
