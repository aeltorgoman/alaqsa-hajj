import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/* ═══════════════════════════════════════════════════════
   ErrorBoundary — حاجز أخطاء يمنع انهيار التطبيق بالكامل
   عند حدوث خطأ في إحدى الصفحات
   ═══════════════════════════════════════════════════════ */

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error?.message || "" };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        flex: 1, minHeight: 400, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, direction: "rtl", fontFamily: "var(--font-body)",
      }}>
        <div style={{
          background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16,
          padding: "36px 32px", maxWidth: 420, width: "100%", textAlign: "center",
          boxShadow: "0 8px 30px rgba(0,0,0,.08)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 16px",
            background: "rgba(198,40,40,.08)", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#C62828" strokeWidth="2" strokeLinecap="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink)", marginBottom: 8 }}>
            حدث خطأ غير متوقع
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 20 }}>
            نعتذر، حدث خطأ أثناء عرض هذه الصفحة. بيانات النظام سليمة ولم تتأثر.
            يمكنك إعادة المحاولة أو تحديث الصفحة.
          </div>
          {this.state.errorMessage && (
            <div style={{
              fontSize: 11, color: "var(--text-muted)", background: "var(--ivory)",
              border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px",
              marginBottom: 20, direction: "ltr", textAlign: "left", wordBreak: "break-word",
              maxHeight: 70, overflowY: "auto",
            }}>
              {this.state.errorMessage}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={this.handleRetry}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                background: "var(--primary)", color: "white", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "var(--font-body)",
              }}
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 10, border: "1px solid var(--line)",
                background: "var(--paper)", color: "var(--ink)", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "var(--font-body)",
              }}
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export { ErrorBoundary };
