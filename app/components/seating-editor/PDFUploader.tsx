"use client";

import { useState, useRef, useCallback } from "react";

type Props = {
  layoutId: string;
  onBackgroundSet: (url: string) => void;
};

type UploadState = "idle" | "uploading" | "converting" | "done" | "error";

const CONVERSION_TIMEOUT_MS = 15000;

/**
 * PDFUploader — handles PDF/image upload with robust conversion.
 *
 * Flow:
 * 1. User selects file (PDF or image)
 * 2. If image → upload directly to Supabase
 * 3. If PDF → upload raw PDF, then convert client-side with timeout + retry
 * 4. Upload converted PNG to Supabase
 * 5. Save URL to layout
 */
export default function PDFUploader({ layoutId, onBackgroundSet }: Props) {
  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFileRef = useRef<File | null>(null);

  const uploadToSupabase = useCallback(
    async (file: File | Blob, fileName: string): Promise<string> => {
      const formData = new FormData();
      formData.append("file", file, fileName);
      formData.append("layout_id", layoutId);

      const res = await fetch("/api/layouts/upload-background", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      return data.url;
    },
    [layoutId]
  );

  const convertPdfToPng = useCallback(async (file: File): Promise<Blob> => {
    return new Promise(async (resolve, reject) => {
      // Timeout failsafe
      const timeout = setTimeout(() => {
        reject(new Error("PDF conversion timed out. Try uploading a PNG/JPG instead."));
      }, CONVERSION_TIMEOUT_MS);

      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        const scale = 2;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context unavailable");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

        clearTimeout(timeout);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Failed to create PNG from PDF"));
          },
          "image/png",
          0.92
        );
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }, []);

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      lastFileRef.current = file;
      setError("");

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      try {
        if (!isPdf) {
          // Direct image upload
          setState("uploading");
          setProgress("Uploading image…");
          const url = await uploadToSupabase(file, file.name);
          onBackgroundSet(url);
          setState("done");
          setProgress("");
          setTimeout(() => setState("idle"), 2000);
        } else {
          // PDF: convert then upload
          setState("converting");
          setProgress("Converting PDF to image…");

          const pngBlob = await convertPdfToPng(file);
          const pngName = file.name.replace(/\.pdf$/i, ".png");

          setState("uploading");
          setProgress("Uploading converted image…");

          const url = await uploadToSupabase(
            new File([pngBlob], pngName, { type: "image/png" }),
            pngName
          );
          onBackgroundSet(url);
          setState("done");
          setProgress("");
          setTimeout(() => setState("idle"), 2000);
        }
      } catch (err) {
        console.error("PDF upload/conversion error:", err);
        setState("error");
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [uploadToSupabase, convertPdfToPng, onBackgroundSet]
  );

  const handleRetry = useCallback(() => {
    const file = lastFileRef.current;
    if (!file) return;
    setError("");
    setState("idle");
    // Re-trigger by simulating the upload with the cached file
    const dt = new DataTransfer();
    dt.items.add(file);
    if (fileRef.current) {
      fileRef.current.files = dt.files;
      fileRef.current.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, []);

  const isWorking = state === "uploading" || state === "converting";

  return (
    <div style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 8 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          background:
            state === "done"
              ? "rgba(74,222,128,0.15)"
              : state === "error"
              ? "rgba(248,113,113,0.15)"
              : "rgba(99,102,241,0.15)",
          border: `1px dashed ${
            state === "done"
              ? "rgba(74,222,128,0.4)"
              : state === "error"
              ? "rgba(248,113,113,0.4)"
              : "rgba(99,102,241,0.4)"
          }`,
          borderRadius: 8,
          cursor: isWorking ? "wait" : "pointer",
          color:
            state === "done"
              ? "#4ade80"
              : state === "error"
              ? "#f87171"
              : "#a5b4fc",
          fontSize: 12,
          fontWeight: 500,
          transition: "all 0.15s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontSize: 14 }}>
          {state === "done" ? "✓" : state === "error" ? "✗" : "📄"}
        </span>
        {isWorking
          ? progress || "Processing…"
          : state === "done"
          ? "Background set!"
          : state === "error"
          ? "Failed"
          : "Upload Background"}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleUpload}
          disabled={isWorking}
          style={{ display: "none" }}
        />
      </label>

      {state === "error" && (
        <button
          onClick={handleRetry}
          style={{
            padding: "5px 12px",
            background: "rgba(248,113,113,0.15)",
            border: "1px solid rgba(248,113,113,0.3)",
            borderRadius: 6,
            color: "#fca5a5",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      )}

      {error && (
        <span style={{ color: "#f87171", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
          {error}
        </span>
      )}
    </div>
  );
}
