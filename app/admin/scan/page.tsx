"use client";

import { useState, useEffect, useRef } from "react";

type ScanResult = {
  valid: boolean;
  reason?: string;
  customer_name?: string;
  event_title?: string;
};

export default function AdminScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);

  const validateTicket = async (qrCode: string) => {
    setResult(null);
    try {
      const res = await fetch(`/api/tickets/${qrCode}/validate`, { method: "POST" });
      const data = await res.json();
      setResult(data);

      // Auto-clear result after 5 seconds
      setTimeout(() => setResult(null), 5000);
    } catch {
      setResult({ valid: false, reason: "Network error" });
    }
  };

  const startScanner = async () => {
    if (scanning) return;
    setScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      html5QrRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Extract QR code from URL or use raw
          const code = decodedText.includes("/tickets/")
            ? decodedText.split("/tickets/").pop() || decodedText
            : decodedText;
          validateTicket(code);
        },
        () => {} // ignore errors
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

  useEffect(() => {
    return () => { stopScanner(); };
  }, []);

  const handleManualScan = () => {
    if (manualCode.trim()) {
      const code = manualCode.includes("/tickets/")
        ? manualCode.split("/tickets/").pop() || manualCode
        : manualCode;
      validateTicket(code);
      setManualCode("");
    }
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">Ticket Scanner</h1>

      {/* Scan Result Overlay */}
      {result && (
        <div className={`scan-result ${result.valid ? "scan-valid" : "scan-invalid"}`}>
          <div className="scan-result-icon">{result.valid ? "✅" : "❌"}</div>
          <div className="scan-result-text">
            {result.valid ? (
              <>
                <h2>Valid Ticket</h2>
                <p>{result.customer_name}</p>
                <p className="scan-result-event">{result.event_title}</p>
              </>
            ) : (
              <>
                <h2>Invalid</h2>
                <p>{result.reason}</p>
                {result.customer_name && <p>{result.customer_name}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {/* Camera Scanner */}
      <div className="scan-camera-section">
        <div id="qr-reader" ref={scannerRef} className="scan-camera-view" />
        <div className="scan-controls">
          {!scanning ? (
            <button className="admin-form-submit" onClick={startScanner}>Start Camera</button>
          ) : (
            <button className="portal-signout-btn" onClick={stopScanner}>Stop Camera</button>
          )}
        </div>
      </div>

      {/* Manual Entry */}
      <div className="scan-manual-section">
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
    </div>
  );
}
