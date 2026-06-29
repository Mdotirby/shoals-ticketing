"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type ScanResult = {
  valid: boolean;
  reason?: string;
  customer_name?: string;
  event_title?: string;
  seat_assignments?: { section: string; row: string; seat: string }[];
};

type EventOption = {
  id: string;
  title: string;
  date: string;
  venue: string;
};

type TicketRow = {
  id: string;
  qr_code: string;
  is_scanned: boolean;
  scanned_at: string | null;
  tier_name: string;
};

type PersonResult = {
  customer_name: string;
  customer_email: string;
  tickets: TicketRow[];
  total: number;
  scanned: number;
};

const DISPLAY_MS = 5000;
const COOLDOWN_MS = 10000;

export default function AdminScanPage() {
  // ── QR scanner state ──────────────────────────────────────────────────────
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const resultTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Event selector ────────────────────────────────────────────────────────
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");

  // ── Name search state ─────────────────────────────────────────────────────
  const [lastName, setLastName] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Manual code state ─────────────────────────────────────────────────────
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);

  // Load upcoming events on mount
  useEffect(() => {
    fetch("/api/admin/scan/events")
      .then((r) => r.json())
      .then((data: EventOption[]) => {
        setEvents(data ?? []);
        const today = new Date().toISOString().slice(0, 10);
        const todayEvent = data.find((e) => e.date === today);
        if (todayEvent) setSelectedEventId(todayEvent.id);
        else if (data.length > 0) setSelectedEventId(data[0].id);
      })
      .catch(() => {});
  }, []);

  // Debounced last-name search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!lastName.trim() || !selectedEventId) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/scan/search?event_id=${selectedEventId}&last_name=${encodeURIComponent(lastName.trim())}`
        );
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastName, selectedEventId]);

  // ── QR validation ─────────────────────────────────────────────────────────
  const validateTicket = useCallback(async (qrCode: string) => {
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

      if (navigator.vibrate) {
        navigator.vibrate(data.valid ? 100 : [100, 50, 100]);
      }

      if (resultTimeoutRef.current) clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = setTimeout(() => {
        setResult(null);
      }, DISPLAY_MS);
    } catch {
      setResult({ valid: false, reason: "Network error" });
    } finally {
      setProcessing(false);
    }
  }, []);

  // ── Camera scanner — Android-safe three-layer fallback ────────────────────
  const startScanner = async () => {
    if (scanning) return;
    setScanning(true);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      html5QrRef.current = scanner;

      const onSuccess = (decodedText: string) => {
        const code = decodedText.includes("/tickets/")
          ? decodedText.split("/tickets/").pop() || decodedText
          : decodedText;
        validateTicket(code);
      };
      const onError = () => {};
      const config = { fps: 6, qrbox: { width: 250, height: 250 } };

      // Layer 1: enumerate cameras and pick rear by device ID (most reliable on Android)
      let started = false;
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          const rear =
            cameras.find((c) => /back|rear|environment/i.test(c.label)) ??
            cameras[cameras.length - 1];
          await scanner.start(rear.id, config, onSuccess, onError);
          started = true;
        }
      } catch {}

      // Layer 2: exact facingMode (some Android Chrome versions require this)
      if (!started) {
        try {
          await scanner.start({ facingMode: { exact: "environment" } }, config, onSuccess, onError);
          started = true;
        } catch {}
      }

      // Layer 3: loose facingMode — works on iOS and most desktop browsers
      if (!started) {
        await scanner.start({ facingMode: "environment" }, config, onSuccess, onError);
      }
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

  // File-input fallback — bypasses getUserMedia entirely, guaranteed on Android
  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader-file");
      const decoded = await scanner.scanFile(file, true);
      const code = decoded.includes("/tickets/")
        ? decoded.split("/tickets/").pop() || decoded
        : decoded;
      validateTicket(code);
    } catch {
      setResult({ valid: false, reason: "Could not read QR code from image" });
    }
    e.target.value = "";
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { return () => { stopScanner(); }; }, []);

  // ── Manual code entry ─────────────────────────────────────────────────────
  const handleManualScan = () => {
    if (!manualCode.trim()) return;
    const code = manualCode.includes("/tickets/")
      ? manualCode.split("/tickets/").pop() || manualCode
      : manualCode;
    validateTicket(code);
    setManualCode("");
  };

  // ── Bulk check-in ─────────────────────────────────────────────────────────
  const handleBulkCheckIn = async (person: PersonResult) => {
    const key = `${person.customer_name}||${person.customer_email}`;
    const unscannedIds = person.tickets.filter((t) => !t.is_scanned).map((t) => t.id);
    if (unscannedIds.length === 0) return;

    setCheckingIn((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/admin/scan/bulk-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_ids: unscannedIds }),
      });
      const data = await res.json();
      if (data.checked_in >= 0) {
        setSearchResults((prev) =>
          prev.map((p) => {
            if (`${p.customer_name}||${p.customer_email}` !== key) return p;
            return {
              ...p,
              tickets: p.tickets.map((t) =>
                unscannedIds.includes(t.id)
                  ? { ...t, is_scanned: true, scanned_at: new Date().toISOString() }
                  : t
              ),
              scanned: p.total,
            };
          })
        );
        if (navigator.vibrate) navigator.vibrate(100);
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          gain.gain.value = 0.2;
          osc.frequency.value = 880;
          osc.type = "sine";
          osc.start();
          osc.stop(ctx.currentTime + 0.12);
        } catch {}
      }
    } catch {}
    setCheckingIn((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleSingleCheckIn = async (person: PersonResult, ticketId: string) => {
    setCheckingIn((prev) => new Set(prev).add(ticketId));
    try {
      const res = await fetch("/api/admin/scan/bulk-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_ids: [ticketId] }),
      });
      const data = await res.json();
      if (data.checked_in >= 0) {
        const personKey = `${person.customer_name}||${person.customer_email}`;
        setSearchResults((prev) =>
          prev.map((p) => {
            if (`${p.customer_name}||${p.customer_email}` !== personKey) return p;
            return {
              ...p,
              tickets: p.tickets.map((t) =>
                t.id === ticketId
                  ? { ...t, is_scanned: true, scanned_at: new Date().toISOString() }
                  : t
              ),
              scanned: p.scanned + 1,
            };
          })
        );
        if (navigator.vibrate) navigator.vibrate(100);
      }
    } catch {}
    setCheckingIn((prev) => {
      const next = new Set(prev);
      next.delete(ticketId);
      return next;
    });
  };

  const overlayBg = result
    ? result.valid ? "rgba(34, 197, 94, 0.95)" : "rgba(239, 68, 68, 0.95)"
    : "transparent";

  return (
    <div className="admin-form-page" style={{ position: "relative", minHeight: "100vh" }}>

      {/* ── FULL-SCREEN RESULT OVERLAY ── */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: result ? 9999 : -1,
          background: overlayBg,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
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
            <div style={{ fontSize: 96, lineHeight: 1, marginBottom: 16, animation: "scan-pop 300ms ease-out" }}>
              {result.valid ? "✓" : "✗"}
            </div>
            <h2 style={{
              color: "#fff", fontSize: 32, fontWeight: 800, margin: "0 0 8px",
              fontFamily: "var(--font-bayon), sans-serif",
              textTransform: "uppercase", letterSpacing: 2,
            }}>
              {result.valid ? "VALID TICKET" : "INVALID"}
            </h2>
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
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 5, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
              <div style={{ height: "100%", background: "rgba(255,255,255,0.7)", animation: `scan-countdown ${DISPLAY_MS}ms linear forwards` }} />
            </div>
          </>
        )}
      </div>

      {/* ── PAGE HEADER + EVENT SELECTOR ── */}
      <div className="scan-page-header">
        <h1 className="admin-page-title" style={{ marginBottom: 0 }}>Ticket Scanner</h1>
        {events.length > 0 && (
          <select
            className="admin-form-input scan-event-select"
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setLastName("");
              setSearchResults([]);
            }}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} — {ev.date}
              </option>
            ))}
          </select>
        )}
      </div>

      {processing && (
        <div style={{ textAlign: "center", padding: 12, color: "#d0c290", fontSize: 14 }}>
          Validating…
        </div>
      )}

      {/* ── CAMERA SCANNER ── */}
      <div className="scan-camera-section">
        <div
          id="qr-reader"
          ref={scannerRef}
          className="scan-camera-view"
          style={{
            borderRadius: 12, overflow: "hidden",
            border: scanning ? "2px solid rgba(208,194,144,0.3)" : "2px dashed rgba(255,255,255,0.1)",
            minHeight: scanning ? 300 : 80,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "min-height 300ms ease",
          }}
        />
        {/* Hidden node required by html5-qrcode scanFile */}
        <div id="qr-reader-file" style={{ display: "none" }} />

        <div className="scan-controls" style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {!scanning ? (
            <button className="admin-form-submit" onClick={startScanner} style={{ minWidth: 160 }}>
              Start Camera
            </button>
          ) : (
            <button className="portal-signout-btn" onClick={stopScanner} style={{ minWidth: 160 }}>
              ⏹ Stop Camera
            </button>
          )}
          <label className="scan-file-btn">
            📷 Scan from Photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={handleFileInput}
            />
          </label>
        </div>
      </div>

      {/* ── LAST NAME SEARCH ── */}
      <div className="scan-search-section">
        <div className="scan-section-label">Search by Last Name</div>
        <div className="scan-search-input-row">
          <span className="scan-search-icon">🔍</span>
          <input
            type="text"
            className="admin-form-input scan-search-input"
            placeholder="Last name…"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
          />
          {lastName && (
            <button
              className="scan-search-clear"
              onClick={() => { setLastName(""); setSearchResults([]); }}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {!selectedEventId && (
          <p className="scan-search-hint">Select a show above to search guest names.</p>
        )}
        {searching && <p className="scan-search-hint">Searching…</p>}
        {!searching && lastName.trim() && searchResults.length === 0 && selectedEventId && (
          <p className="scan-search-hint">No tickets found for &ldquo;{lastName}&rdquo; at this show.</p>
        )}

        {searchResults.map((person) => {
          const key = `${person.customer_name}||${person.customer_email}`;
          const isLoading = checkingIn.has(key);
          const allScanned = person.scanned === person.total;

          return (
            <div key={key} className={`scan-person-card${allScanned ? " scan-person-done" : ""}`}>
              <div className="scan-person-header">
                <div className="scan-person-info">
                  <div className="scan-person-name">{person.customer_name}</div>
                  <div className="scan-person-meta">
                    {person.scanned} of {person.total} checked in
                    {person.customer_email && (
                      <span className="scan-person-email"> · {person.customer_email}</span>
                    )}
                  </div>
                </div>
                {allScanned ? (
                  <span className="scan-all-done-badge">✓ All In</span>
                ) : (
                  <button
                    className="scan-checkin-all-btn"
                    onClick={() => handleBulkCheckIn(person)}
                    disabled={isLoading}
                  >
                    {isLoading ? "…" : `Check In All (${person.total - person.scanned})`}
                  </button>
                )}
              </div>

              <div className="scan-ticket-list">
                {person.tickets.map((ticket) => {
                  const ticketLoading = checkingIn.has(ticket.id);
                  return (
                    <div key={ticket.id} className={`scan-ticket-row${ticket.is_scanned ? " scan-ticket-scanned" : ""}`}>
                      <span className="scan-ticket-status">
                        {ticket.is_scanned ? "✓" : "○"}
                      </span>
                      <span className="scan-ticket-tier">{ticket.tier_name}</span>
                      {ticket.is_scanned && ticket.scanned_at && (
                        <span className="scan-ticket-time">
                          {new Date(ticket.scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {!ticket.is_scanned && (
                        <button
                          className="scan-single-checkin-btn"
                          onClick={() => handleSingleCheckIn(person, ticket.id)}
                          disabled={ticketLoading}
                        >
                          {ticketLoading ? "…" : "Check In"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MANUAL CODE ENTRY (secondary / collapsed) ── */}
      <div className="scan-manual-section">
        <button
          className="scan-manual-toggle"
          onClick={() => setShowManual((v) => !v)}
        >
          {showManual ? "▲" : "▼"} Manual Code Entry
        </button>
        {showManual && (
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
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
        )}
      </div>

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
