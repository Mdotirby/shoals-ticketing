"use client";

/**
 * The ticket scanner: camera, photo fallback, name search, manual code and the
 * full-screen result. It scans for one show, and a ticket for any other is
 * refused. Used by the Scanner page and, as an overlay, by the box office.
 */

import { useState, useEffect, useRef, useCallback, type ComponentType, type ReactNode } from "react";
import { Button } from "@/app/components/admin/ui";

type ScanResult = {
  valid: boolean;
  reason?: string;
  customer_name?: string;
  event_title?: string;
  seat_assignments?: { section: string; row: string; seat: string }[];
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

/** Buttons come from the host: the box office isn't inside the admin shell's styles. */
export type ScannerButton = ComponentType<{
  variant?: "primary" | "danger";
  onClick?: () => void;
  children?: ReactNode;
}>;

export default function TicketScanner({
  eventId,
  autoStart = false,
  onScanned,
  Btn = Button as ScannerButton,
  inline = false,
  footer,
}: {
  eventId: string;
  /** Open the camera straight away. */
  autoStart?: boolean;
  /** After a ticket is admitted, so the host can refresh its counts. */
  onScanned?: () => void;
  Btn?: ScannerButton;
  /** Camera beside results on a wide screen, instead of a full-screen flash. */
  inline?: boolean;
  /** Shown under the results when inline. */
  footer?: ReactNode;
}) {
  // ── QR scanner state ──────────────────────────────────────────────────────
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<unknown>(null);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const resultTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [cameraError, setCameraError] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [recent, setRecent] = useState<{ at: string; name: string; valid: boolean; note: string }[]>([]);
  // The camera's callback is made once, so it reads the show from here.
  const eventIdRef = useRef(eventId);
  useEffect(() => { eventIdRef.current = eventId; }, [eventId]);
  const onScannedRef = useRef(onScanned);
  useEffect(() => { onScannedRef.current = onScanned; }, [onScanned]);

  // ── Name search state ─────────────────────────────────────────────────────
  const [lastName, setLastName] = useState("");
  const [searchResults, setSearchResults] = useState<PersonResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [checkingIn, setCheckingIn] = useState<Set<string>>(new Set());
  /** Why the server refused a check-in — a void or refunded ticket. */
  const [bulkRefusal, setBulkRefusal] = useState<string | null>(null);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Manual code state ─────────────────────────────────────────────────────
  const [manualCode, setManualCode] = useState("");
  const [showManual, setShowManual] = useState(false);

  // A new show starts a new search.
  useEffect(() => {
    setLastName("");
    setSearchResults([]);
  }, [eventId]);

  // Debounced last-name search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!lastName.trim() || !eventId) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/admin/scan/search?event_id=${eventId}&q=${encodeURIComponent(lastName.trim())}`
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
  }, [lastName, eventId]);

  // ── QR validation ─────────────────────────────────────────────────────────
  const validateTicket = useCallback(async (qrCode: string) => {
    const now = Date.now();
    if (qrCode === lastScannedRef.current && now - lastScanTimeRef.current < COOLDOWN_MS) return;
    lastScannedRef.current = qrCode;
    lastScanTimeRef.current = now;

    setProcessing(true);
    setResult(null);

    try {
      const res = await fetch(`/api/tickets/${qrCode}/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventIdRef.current || undefined }),
      });
      const data = await res.json();
      // A refused request has an error, not a verdict. Never read that as admitted.
      if (typeof data.valid !== "boolean") {
        data.valid = false;
        data.reason = res.status === 401 ? "You're signed out. Sign in again to scan." : data.error || "This account can't scan tickets.";
      }
      setResult(data);
      setLastResult(data);
      setRecent((r) => [{
        at: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        name: data.customer_name || "Unknown ticket",
        valid: !!data.valid,
        note: data.valid ? "Checked in" : data.reason || "Refused",
      }, ...r].slice(0, 20));
      if (data.valid) onScannedRef.current?.();

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

  // ── USB scanner ───────────────────────────────────────────────────────────
  // A USB scanner types the code fast and presses Enter. Anything slower, or
  // typed into a box, is a person and isn't a scan.
  useEffect(() => {
    if (!inline) return;
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return;
      const now = Date.now();
      if (now - last > 80) buffer = "";
      last = now;
      if (e.key === "Enter") {
        if (buffer.length >= 6) {
          const raw = buffer;
          buffer = "";
          e.preventDefault();
          validateTicket(raw.includes("/tickets/") ? raw.split("/tickets/").pop() || raw : raw);
        }
        return;
      }
      if (e.key.length === 1) buffer += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inline, validateTicket]);

  // ── Camera scanner — Android-safe three-layer fallback ────────────────────
  const startScanner = async () => {
    if (scanning) return;
    setScanning(true);
    setCameraError("");

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
      setCameraError("The camera didn't start. Check its permission, or use Scan from Photo.");
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

  useEffect(() => {
    if (!autoStart) return;
    const start = setTimeout(startScanner, 100);
    return () => clearTimeout(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // Only mark what the server actually admitted. This used to mark every
        // requested ticket scanned regardless, so a void or refunded ticket
        // the server refused still showed as checked in on the door's screen.
        const refused: { id: string; name: string | null; reason: string }[] = data.refused ?? [];
        const refusedIds = new Set(refused.map((r) => r.id));
        const admitted = unscannedIds.filter((id) => !refusedIds.has(id));
        setSearchResults((prev) =>
          prev.map((p) => {
            if (`${p.customer_name}||${p.customer_email}` !== key) return p;
            const tickets = p.tickets.map((t) =>
              admitted.includes(t.id)
                ? { ...t, is_scanned: true, scanned_at: new Date().toISOString() }
                : t
            );
            return { ...p, tickets, scanned: tickets.filter((t) => t.is_scanned).length };
          })
        );
        if (refused.length > 0) {
          setBulkRefusal(`${refused.length} ticket${refused.length > 1 ? "s" : ""} refused — ${refused[0].reason}`);
          if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
        }
        if (admitted.length === 0) return;
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
      const refusedOne: { id: string; name: string | null; reason: string }[] = data.refused ?? [];
      if (refusedOne.length > 0) {
        // The server would not admit it; do not draw it as admitted.
        setBulkRefusal(refusedOne[0].reason);
        if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
      } else if (data.checked_in >= 0) {
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
    <div className={inline ? "scan-inline" : undefined}>

      {/* ── FULL-SCREEN RESULT OVERLAY ── */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: result ? 9999 : -1,
          background: overlayBg,
          display: inline ? "none" : "flex", flexDirection: "column",
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
              fontFamily: "var(--font-archivo), sans-serif",
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
                    marginTop: 10, padding: "8px 14px", borderRadius: "var(--lg-radius-sm)",
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.22)",
                  }}>
                    <p style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(255,255,255,0.60)", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.17em" }}>
                      Assigned Seats
                    </p>
                    {result.seat_assignments.map((s, i) => (
                      <p key={i} style={{ fontSize: 14, margin: "2px 0", color: "#fff" }}>
                        <strong style={{ color: "#ffffff" }}>{s.section}</strong> &middot; Row {s.row} &middot; Seat {s.seat}
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

      {processing && (
        <div style={{ textAlign: "center", padding: 12, color: "#ffffff", fontSize: 14 }}>
          Validating…
        </div>
      )}

      <div className={inline ? "scan-inline-left" : undefined}>
      {/* ── CAMERA SCANNER ── */}
      <div className="scan-camera-section">
        <div
          id="qr-reader"
          ref={scannerRef}
          className="scan-camera-view"
          style={{
            borderRadius: "var(--lg-radius-sm)", overflow: "hidden",
            border: scanning
              ? "1px solid rgba(255,255,255,0.30)"
              : "1px dashed rgba(255,255,255,0.16)",
            minHeight: scanning ? 300 : 80,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "min-height 300ms ease",
          }}
        />
        {/* Hidden node required by html5-qrcode scanFile */}
        <div id="qr-reader-file" style={{ display: "none" }} />

        <div className="scan-controls" style={{ display: "flex", gap: 10, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
          {!scanning ? (
            <Btn variant="primary" onClick={startScanner}>
              Start Camera
            </Btn>
          ) : (
            <Btn variant="danger" onClick={stopScanner}>
              Stop Camera
            </Btn>
          )}
          <label className="scan-file-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: -2 }}>
              <path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            Scan from Photo
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

      </div>

      <div className={inline ? "scan-inline-right" : undefined}>
      {cameraError && (
        <div className="scan-refusal" role="alert">
          <strong>Camera</strong>
          <span>{cameraError}</span>
          <button type="button" onClick={() => setCameraError("")} aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* ── GUEST NAME / EMAIL SEARCH ── */}
      {/* A refused check-in must be visible at the door. The list used to
          draw a refused ticket as admitted and say nothing. */}
      {bulkRefusal && (
        <div className="scan-refusal" role="alert">
          <strong>Not checked in</strong>
          <span>{bulkRefusal}</span>
          <button type="button" onClick={() => setBulkRefusal(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="scan-search-section">
        <div className="scan-section-label">Search by Name or Email</div>
        <div className="scan-search-input-row">
          <svg className="scan-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            type="text"
            className="scan-search-input"
            placeholder="Name or email…"
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

        {!eventId && (
          <p className="scan-search-hint">Select a show above to search guest names.</p>
        )}
        {searching && <p className="scan-search-hint">Searching…</p>}
        {!searching && lastName.trim() && searchResults.length === 0 && eventId && (
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
              placeholder="Paste ticket code or URL"
              style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", color: "#fff" }}
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleManualScan()}
            />
            <Btn variant="primary" onClick={handleManualScan}>Validate</Btn>
          </div>
        )}
      </div>

      {inline && (
        <>
          <div
            className="scan-res"
            role="status"
            data-tone={!lastResult ? "" : lastResult.valid ? "good" : /^already scanned/i.test(lastResult.reason ?? "") ? "warn" : "bad"}
          >
            <i>{!lastResult ? "⌕" : lastResult.valid ? "✓" : /^already scanned/i.test(lastResult.reason ?? "") ? "!" : "✕"}</i>
            <div style={{ minWidth: 0 }}>
              <b>{!lastResult ? "Ready" : lastResult.valid ? "Valid" : /^already scanned/i.test(lastResult.reason ?? "") ? "Already scanned" : "Not valid"}</b>
              <span>
                {!lastResult
                  ? "Hold the ticket QR up to the camera, or use a USB scanner."
                  : lastResult.valid
                    ? [lastResult.customer_name, ...(lastResult.seat_assignments ?? []).map((a) => `${a.section} · Row ${a.row} · Seat ${a.seat}`)].filter(Boolean).join(" · ")
                    : [lastResult.reason, lastResult.customer_name].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          <div className="scan-log">
            <div className="pos-eyebrow">Recent scans</div>
            {recent.map((r, i) => (
              <div className="row" key={i}>
                <em data-ok={r.valid} />
                <span style={{ width: 70, color: "rgba(255,255,255,0.66)" }}>{r.at}</span>
                <b style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</b>
                <span style={{ color: "rgba(255,255,255,0.72)", maxWidth: "45%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.note}</span>
              </div>
            ))}
            {recent.length === 0 && <div className="pos-sub" style={{ marginTop: 10 }}>Nothing scanned yet on this screen.</div>}
          </div>
          {footer}
        </>
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
