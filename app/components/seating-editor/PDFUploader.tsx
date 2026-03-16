"use client";

import { useState, useRef, useCallback } from "react";

type Props = {
  layoutId: string;
  onBackgroundSet: (url: string) => void;
};

/**
 * PDFUploader — handles PDF/image upload and PDF-to-PNG conversion client-side.
 * Uses pdfjs-dist to render the first page of a PDF to a canvas, then uploads the PNG.
 */
export default function PDFUploader({ layoutId, onBackgroundSet }: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const convertPdfToPng = useCallback(async (file: File): Promise<Blob> => {
    const pdfjsLib = await import("pdfjs-dist");
    // Use the bundled worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const scale = 2; // Higher quality
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext("2d")!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob!), "image/png", 0.95);
    });
  }, []);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    try {
      let uploadFile: File = file;
      let fileName = file.name;

      // If PDF, convert to PNG first
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        const pngBlob = await convertPdfToPng(file);
        const pngName = file.name.replace(/\.pdf$/i, ".png");
        uploadFile = new File([pngBlob], pngName, { type: "image/png" });
        fileName = pngName;
      }

      const formData = new FormData();
      formData.append("file", uploadFile, fileName);
      formData.append("layout_id", layoutId);

      const res = await fetch("/api/layouts/upload-background", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      onBackgroundSet(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [layoutId, onBackgroundSet, convertPdfToPng]);

  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          background: "rgba(99,102,241,0.15)",
          border: "1px dashed rgba(99,102,241,0.4)",
          borderRadius: 8,
          cursor: uploading ? "wait" : "pointer",
          color: "#a5b4fc",
          fontSize: 13,
          fontWeight: 500,
          transition: "background 0.15s",
        }}
      >
        <span style={{ fontSize: 16 }}>📄</span>
        {uploading ? "Converting & uploading…" : "Upload PDF or Image Background"}
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={handleUpload}
          disabled={uploading}
          style={{ display: "none" }}
        />
      </label>
      {error && (
        <p style={{ color: "#f87171", fontSize: 12, marginTop: 6 }}>{error}</p>
      )}
    </div>
  );
}
