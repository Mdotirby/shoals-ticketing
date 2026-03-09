"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getCookie } from "@/lib/cookies";

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg";

export default function AISeatingGeneratorPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const venueId = getCookie("venue-id") || "";

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      setError("Only PDF, PNG, and JPG files are accepted.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setError("File too large. Maximum 20 MB.");
      return;
    }

    setError("");
    setFileName(file.name);
    setUploading(true);

    // Show preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPreviewSrc(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPreviewSrc(null);
    }

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "seating-diagrams");

      const res = await fetch("/api/seating/upload-diagram", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const { url } = await res.json();
      setUploadedUrl(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async () => {
    if (!uploadedUrl) return;
    setAnalyzing(true);
    setError("");

    try {
      const res = await fetch("/api/seating/analyze-diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: uploadedUrl, venue_id: venueId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Analysis failed");
      }

      const data = await res.json();

      // Store result in sessionStorage and navigate to preview
      sessionStorage.setItem("ai-seating-result", JSON.stringify(data));
      sessionStorage.setItem("ai-seating-image-url", uploadedUrl);
      router.push("/admin/seating/ai-preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRemove = () => {
    setUploadedUrl(null);
    setPreviewSrc(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="admin-form-page">
      <h1 className="admin-page-title">AI Seating Chart Generator</h1>
      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 24 }}>
        Upload a venue seating diagram (Cvent PDF, PNG, or JPG) and our AI will automatically detect
        sections, rows, tables, and seats to generate a seating template.
      </p>

      {error && <div className="admin-form-error">{error}</div>}

      {/* Upload Area */}
      <div style={{
        padding: 32, borderRadius: 12,
        border: `2px dashed ${uploadedUrl ? "rgba(99,102,241,0.3)" : "rgba(208,194,144,0.2)"}`,
        background: uploadedUrl ? "rgba(99,102,241,0.04)" : "rgba(208,194,144,0.02)",
        textAlign: "center",
        cursor: uploadedUrl ? "default" : "pointer",
        transition: "all 0.2s",
      }}
        onClick={() => !uploadedUrl && fileInputRef.current?.click()}
      >
        {uploading ? (
          <div style={{ color: "#d0c290", fontSize: 14 }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>&#8987;</div>
            Uploading diagram...
          </div>
        ) : uploadedUrl ? (
          <div>
            {previewSrc && (
              <img
                src={previewSrc}
                alt="Uploaded diagram"
                style={{
                  maxWidth: "100%", maxHeight: 300, borderRadius: 8,
                  marginBottom: 16, border: "1px solid rgba(255,255,255,0.1)",
                }}
              />
            )}
            <div style={{ color: "#818cf8", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
              {fileName}
            </div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 12 }}>
              Diagram uploaded successfully
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(); }}
              style={{
                padding: "6px 16px", borderRadius: 6,
                background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)",
                color: "#ff6b6b", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              Remove & Re-upload
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>&#128196;</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, fontWeight: 600 }}>
              Click to upload a seating diagram
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 6 }}>
              PDF, PNG, or JPG — max 20 MB
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileSelect}
          style={{ display: "none" }}
        />
      </div>

      {/* Analyze Button */}
      {uploadedUrl && (
        <button
          onClick={handleAnalyze}
          disabled={analyzing}
          style={{
            marginTop: 24, padding: "14px 32px", borderRadius: 10,
            background: analyzing ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1, #818cf8)",
            color: "#fff", border: "none",
            fontWeight: 700, fontSize: 15, cursor: analyzing ? "wait" : "pointer",
            width: "100%", maxWidth: 400, display: "block", margin: "24px auto 0",
            transition: "all 0.2s",
          }}
        >
          {analyzing ? "Analyzing with AI..." : "Analyze Diagram with AI"}
        </button>
      )}

      {analyzing && (
        <div style={{
          marginTop: 16, textAlign: "center",
          color: "rgba(255,255,255,0.4)", fontSize: 12,
        }}>
          This may take 10-30 seconds. The AI is detecting sections, rows, tables, and seats...
        </div>
      )}
    </div>
  );
}
