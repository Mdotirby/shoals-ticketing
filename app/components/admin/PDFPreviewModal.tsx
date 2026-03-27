"use client";

type PDFPreviewModalProps = {
  title: string;
  rows: Array<{ name: string; quantity: number }>;
  onDownload: () => void;
  onClose: () => void;
};

export default function PDFPreviewModal({
  title,
  rows,
  onDownload,
  onClose,
}: PDFPreviewModalProps) {
  const total = rows.reduce((s, r) => s + r.quantity, 0);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(0,0,0,0.8)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          background: "#0b0d1d",
          border: "1px solid rgba(208,194,144,0.2)",
          borderRadius: 12,
          width: "100%",
          maxWidth: 560,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <h3 style={{ color: "#d0c290", margin: 0, fontSize: "1rem", fontWeight: 700 }}>
            Preview — {title}
          </h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 20, lineHeight: 1 }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Table */}
        <div style={{ overflow: "auto", flex: 1, padding: "16px 20px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.12)" }}>
                <th style={{ textAlign: "left", padding: "8px 0", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>#</th>
                <th style={{ textAlign: "left", padding: "8px 0", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Name</th>
                <th style={{ textAlign: "right", padding: "8px 0", color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "9px 0", color: "rgba(255,255,255,0.35)" }}>{i + 1}</td>
                  <td style={{ padding: "9px 0", color: "#fff" }}>{row.name}</td>
                  <td style={{ padding: "9px 0", textAlign: "right", color: "#d0c290" }}>{row.quantity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "1px solid rgba(208,194,144,0.2)" }}>
                <td colSpan={2} style={{ padding: "10px 0", color: "rgba(255,255,255,0.5)", fontWeight: 600 }}>Total Guests</td>
                <td style={{ padding: "10px 0", textAlign: "right", color: "#d0c290", fontWeight: 700 }}>{total}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Actions */}
        <div style={{
          display: "flex", gap: 10, padding: "14px 20px",
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}>
          <button
            onClick={onDownload}
            className="admin-form-submit"
            style={{ flex: 1, margin: 0 }}
          >
            ↓ Download PDF
          </button>
          <button
            onClick={() => { onDownload(); }}
            className="admin-header-btn"
            style={{ flex: 1 }}
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}
