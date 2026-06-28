import { useState, useCallback } from "react";

/* ─── types ─── */
type AlertType = "error" | "success" | "warning" | "info";

interface AlertState {
  type: AlertType;
  message: string;
}

/* ─── useAlert hook ─── */
function useAlert() {
  const [alert, setAlert] = useState<AlertState | null>(null);

  const showAlert = useCallback(
    (type: AlertType | null, message?: string) => {
      if (type === null) { setAlert(null); return; }
      setAlert({ type, message: message ?? "" });
    },
    []
  );

  return { alert, showAlert };
}

/* ─── color map ─── */
const COLORS: Record<AlertType, { bg: string; border: string; icon: string; text: string }> = {
  error:   { bg: "rgba(198,40,40,.08)",   border: "rgba(198,40,40,.3)",  icon: "#C62828", text: "#C62828" },
  success: { bg: "rgba(42,157,143,.08)",  border: "rgba(42,157,143,.3)", icon: "#2A9D8F", text: "#2A9D8F" },
  warning: { bg: "rgba(230,81,0,.08)",    border: "rgba(230,81,0,.3)",   icon: "#E65100", text: "#E65100" },
  info:    { bg: "rgba(21,101,192,.08)",  border: "rgba(21,101,192,.3)", icon: "#1565C0", text: "#1565C0" },
};

const ICONS: Record<AlertType, string> = {
  error:   `<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>`,
  success: `<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>`,
  warning: `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
  info:    `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
};

const LABELS: Record<AlertType, string> = {
  error:   "خطأ",
  success: "تم بنجاح",
  warning: "تنبيه",
  info:    "معلومة",
};

/* ─── AlertModal component ─── */
function AlertModal({ alert, onClose }: { alert: AlertState | null; onClose: () => void }) {
  if (!alert) return null;

  const c = COLORS[alert.type];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: 20, pointerEvents: "none",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          pointerEvents: "auto",
          display: "flex", alignItems: "center", gap: 12,
          padding: "12px 16px",
          background: "var(--paper)",
          border: `1px solid ${c.border}`,
          borderRight: `4px solid ${c.icon}`,
          borderRadius: 12,
          boxShadow: "0 4px 20px rgba(0,0,0,.12)",
          minWidth: 260, maxWidth: 400,
          animation: "alertSlideIn .2s ease",
          direction: "rtl",
        }}
      >
        {/* أيقونة */}
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: c.bg, display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke={c.icon} strokeWidth="2" strokeLinecap="round"
            dangerouslySetInnerHTML={{ __html: ICONS[alert.type] }} />
        </div>

        {/* النص */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.text, marginBottom: 2 }}>
            {LABELS[alert.type]}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.5 }}>
            {alert.message}
          </div>
        </div>

        {/* زر الإغلاق */}
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: "transparent", border: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes alertSlideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export { AlertModal, useAlert };
export type { AlertState, AlertType };
