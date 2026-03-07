"use client";

import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

/**
 * Global error boundary that catches unhandled React errors
 * and shows a branded fallback UI instead of a white screen.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b0d1d",
            color: "#fff",
            fontFamily: "var(--font-urbanist), sans-serif",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              background: "rgba(208,194,144,0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#d0c290" strokeWidth="1.5" />
              <path d="M12 8v4M12 16h.01" stroke="#d0c290" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#d0c290", marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.95rem", maxWidth: 400, marginBottom: 24 }}>
            An unexpected error occurred. Please try again or refresh the page.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              onClick={this.handleRetry}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "1px solid rgba(208,194,144,0.3)",
                background: "rgba(208,194,144,0.1)",
                color: "#d0c290",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={() => (window.location.href = "/")}
              style={{
                padding: "10px 24px",
                borderRadius: 8,
                border: "none",
                background: "#d0c290",
                color: "#0b0d1d",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Go Home
            </button>
          </div>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <pre
              style={{
                marginTop: 32,
                padding: 16,
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                color: "rgba(255,255,255,0.4)",
                fontSize: 12,
                maxWidth: 600,
                overflow: "auto",
                textAlign: "left",
              }}
            >
              {this.state.error.message}
              {"\n"}
              {this.state.error.stack}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
