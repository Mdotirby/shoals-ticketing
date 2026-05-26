"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ScanResult = {
  valid: boolean;
  reason?: string;
  customer_name?: string;
  event_title?: string;
  seat_assignments?: { section: string; row: string; seat: string }[];
};

const DISPLAY_MS = 5000;   // overlay stays visible for 5 seconds
const COOLDOWN_MS = 10000; // same ticket blocked from re-scanning for 10 seconds

export default function AdminScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const resultTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const validateTicket = useCallback(async (qrCode: string) => {
    // Block same code for COOLDOWN_MS regardless of whether the overlay is still showing
    const now = Date.now();
    if (qrCode === lastScannedRef.current && now - lastScanTimeRef.current < COOLDOWN_MS) return;
    lastScannedRef.current = qrCode;
    lastScanTimeRef.current = now;

    setProcessing(true);
    setResult(null);

    try {
      const res = await fetch(`/api/tickets/${qrCode}/validate`, { method: "POST" });
      const data = await res.json();
      setResult(data);

      // Play sound feedback
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = 0.3;
        osc.frequency.value = data.valid ? 880 : 330;
        osc.type = data.valid ? "sine" : "square";
        osc.start();
        osc.stop(ctx.currentTime + (data.valid ? 0.15 : 0.3));
      } catch {}

      // Vibrate on mobile
      if (navigator.vibrate) {
        navigator.vibrate(data.valid ? 100 : [100, 50, 100]);
      }

      // Auto-clear overlay after DISPLAY_MS — cooldown stays active until COOLDOWN_MS
      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => {
        setResult(null);
        // Do NOT reset lastScannedRef here — cooldown runs independently
      }, DISPLAY_MS);
    } catch {
      setResult({ valid: false, reason: "Network error" });
    } finally {
      setProcessing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startScanner = async () => {
    if (scanning) return;
    setScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 6, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const code = decodedText.includes("/tickets/")
            ? decodedText.split("/tickets/").pop() || decodedText
            : decodedText;
          validateTicket(code);
        },
        () => {}
      );
    } catch (err) {
      console.error("Scanner error:", err);
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrRef.current) {
      try {
        await (html5QrRef.current as { stop: () => Promise<void> }).stop();
      } catch {}
    }
    setScanning(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { return () => { stopScanner(); }; }, []);

  const handleManualScan = () => {
    if (manualCode.trim()) {
      const code = manualCode.includes("/tickets/")
        ? manualCode.split("/tickets/").pop() || manualCode
        : manualCode;
      validateTicket(code);
      setManualCode("");
    }
  };

  // Full-screen overlay colors
  const overlayBg = result
    ? result.valid
      ? "rgba(34, 197, 94, 0.95)"   // green
      : "rgba(239, 68, 68, 0.95)"   // red
    : "transparent";

  return (
    <div className="admin-form-page" style={{ position: "relative", minHeight: "100vh" }}>

      {/* ── FULL-SCREEN RESULT OVERLAY ── */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: result ? 9999 : -1,
          background: overlayBg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: result ? 1 : 0,
          transition: "opacity 200ms ease, background 200ms ease",
          pointerEvents: result ? "auto" : "none",
        }}
        onClick={() => {
          setResult(null);
          if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
          lastScannedRef.current = "";
          lastScanTimeRef.current = 0;
        }}
      >
        {result && (
          <>
            {/* Large icon */}
            <div style={{
              fontSize: 96, lineHeight: 1, marginBottom: 16,
              animation: "scan-pop 300ms ease-out",
            }}>
              {result.valid ? "✓" : "✗"}
            </div>

            {/* Status text */}
            <h2 style={{
              color: "#fff", fontSize: 32, fontWeight: 800, margin: "0 0 8px",
              fontFamily: "var(--font-bayon), sans-serif",
              textTransform: "uppercase", letterSpacing: 2,
            }}>
              {result.valid ? "VALID TICKET" : "INVALID"}
            </h2>

            {/* Details */}
            {result.valid ? (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.9)" }}>
                <p style={{ fontSize: 22, fontWeight: 700, margin: "4px 0" }}>{result.customer_name}</p>
                <p style={{ fontSize: 16, opacity: 0.8, margin: "4px 0" }}>{result.event_title}</p>
                {result.seat_assignments && result.seat_assignments.length > 0 && (
                  <div style={{
                    marginTop: 10, padding: "8px 14px", borderRadius: 8,
                    background: "rgba(99,102,241,0.15)",
                    border: "1px solid rgba(99,102,241,0.3)",
                  }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#818cf8", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: 1 }}>
                      Assigned Seats
                    </p>
                    {result.seat_assignments.map((s, i) => (
                      <p key={i} style={{ fontSize: 14, margin: "2px 0", color: "#fff" }}>
                        <strong style={{ color: "#d0c290" }}>{s.section}</strong> &middot; Row {s.row} &middot; Seat {s.seat}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.9)" }}>
                <p style={{ fontSize: 18, margin: "4px 0" }}>{result.reason}</p>
                {result.customer_name && (
                  <p style={{ fontSize: 16, opacity: 0.8, margin: "4px 0" }}>{result.customer_name}</p>
                )}
              </div>
            )}

            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 24 }}>
              Tap anywhere to dismiss early
            </p>

            {/* Countdown bar */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: 5,
              background: "rgba(255,255,255,0.2)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", background: "rgba(255,255,255,0.7)",
                animation: `scan-countdown ${DISPLAY_MS}ms linear forwards`,
              }} />
            </div>
          </>
        )}
      </div>

      {/* ── SCANNER UI ── */}
      <h1 className="admin-page-title">Ticket Scanner</h1>

      {processing && (
        <div style={{
          textAlign: "center", padding: 12, color: "#d0c290", fontSize: 14,
        }}>
          Validating…
        </div>
      )}

      {/* Camera Scanner */}
      <div className="scan-camera-section">
        <div
          id="qr-reader"
          ref={scannerRef}
          className="scan-camera-view"
          style={{
            borderRadius: 12,
            overflow: "hidden",
            border: scanning ? "2px solid rgba(208,194,144,0.3)" : "2px dashed rgba(255,255,255,0.1)",
            minHeight: scanning ? 300 : 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "min-height 300ms ease",
          }}
        />
        <div className="scan-controls" style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "center" }}>
          {!scanning ? (
            <button className="admin-form-submit" onClick={startScanner} style={{ minWidth: 160 }}>
              Start Camera
            </button>
          ) : (
            <button className="portal-signout-btn" onClick={stopScanner} style={{ minWidth: 160 }}>
              ⏹ Stop Camera
            </button>
          )}
        </div>
      </div>

      {/* Manual Entry */}
      <div className="scan-manual-section" style={{ marginTop: 32 }}>
        <h3 className="portal-form-heading">Manual Entry</h3>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            className="admin-form-input"
            placeholder="Paste ticket code or URL"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualScan()}
          />
          <button className="admin-form-submit" onClick={handleManualScan}>Validate</button>
        </div>
      </div>

      {/* Animation keyframes */}
      <style jsx>{`
        @keyframes scan-pop {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes scan-countdown {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>
    </div>
  );
}
