import { useState, useCallback, useEffect } from "react";

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
  /* إغلاق تلقائي بعد 3.5 ثانية */
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => onClose(), 3500);
    return () => clearTimeout(timer);
  }, [alert, onClose]);

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

/* ═══════════════════════════════════════════════════════
   useConfirm / ConfirmModal — بديل مخصص لـ window.confirm()
   ═══════════════════════════════════════════════════════ */
interface ConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

function useConfirm() {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const confirmAction = useCallback(
    (message: string, opts?: { title?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => {
      return new Promise<boolean>((resolve) => {
        setConfirmState({
          title: opts?.title || "تأكيد الإجراء",
          message,
          confirmLabel: opts?.confirmLabel || "تأكيد",
          cancelLabel: opts?.cancelLabel || "إلغاء",
          danger: opts?.danger ?? true,
          resolve,
        });
      });
    },
    []
  );

  const handleConfirm = useCallback(() => {
    confirmState?.resolve(true);
    setConfirmState(null);
  }, [confirmState]);

  const handleCancel = useCallback(() => {
    confirmState?.resolve(false);
    setConfirmState(null);
  }, [confirmState]);

  return { confirmState, confirmAction, handleConfirm, handleCancel };
}

function ConfirmModal({
  state,
  onConfirm,
  onCancel,
}: {
  state: ConfirmState | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!state) return null;
  const c = state.danger ? "#C62828" : "var(--primary)";
  const cBg = state.danger ? "#fff0f0" : "rgba(125,31,60,.08)";

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 10000,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--paper)", borderRadius: 16, padding: 28,
          width: 340, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          textAlign: "center", direction: "rtl",
          animation: "alertSlideIn .2s ease",
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: cBg, display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 14px",
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
            {state.danger
              ? <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></>
              : <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
            }
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--ink)", marginBottom: 8 }}>{state.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 22, lineHeight: 1.6 }}>{state.message}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onConfirm}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: c, color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            {state.confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-body)" }}
          >
            {state.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { AlertModal, useAlert, ConfirmModal, useConfirm };
export type { AlertState, AlertType, ConfirmState };
