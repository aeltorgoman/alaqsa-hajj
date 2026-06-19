import { useState } from "react";

export type AlertType = "success" | "error" | "warning" | "info";

export interface AlertState {
  type: AlertType;
  message: string;
  title?: string;
}

const ALERT_STYLES: Record<AlertType, { bg: string; color: string; icon: string; defaultTitle: string }> = {
  success: { bg: "var(--success-bg)", color: "var(--success)", icon: "✓", defaultTitle: "تم بنجاح"  },
  error:   { bg: "var(--danger-bg)",  color: "var(--danger)",  icon: "✕", defaultTitle: "حدث خطأ" },
  warning: { bg: "var(--warning-bg)", color: "var(--warning)", icon: "!", defaultTitle: "تنبيه"     },
  info:    { bg: "rgba(125,31,60,0.07)", color: "var(--em7)", icon: "ⓘ", defaultTitle: "تنبيه" },
};

/**
 * Hook لاستبدال alert() الافتراضي للمتصفح برسالة منسجمة مع تصميم النظام.
 * الرسالة تبقى ظاهرة حتى يضغط المستخدم "حسنًا" — لضمان قراءة التنبيهات المهمة.
 *
 * مثال الاستخدام:
 *   const { alert, showAlert } = useAlert();
 *   showAlert("error", "فشل حفظ البيانات، يرجى المحاولة مرة أخرى");
 *   <AlertModal alert={alert} onClose={() => showAlert(null)} />
 */
export function useAlert() {
  const [alert, setAlert] = useState<AlertState | null>(null);
  function showAlert(arg: AlertType | null, message?: string, title?: string) {
    if (arg === null) { setAlert(null); return; }
    setAlert({ type: arg, message: message || "", title });
  }
  return { alert, showAlert };
}

export function AlertModal({ alert, onClose }: { alert: AlertState | null; onClose: () => void }) {
  if (!alert) return null;
  const s = ALERT_STYLES[alert.type];
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--paper)", borderRadius: 14, padding: "22px 22px 18px", maxWidth: 360, width: "100%", textAlign: "center", boxShadow: "0 8px 30px rgba(0,0,0,0.25)" }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ width: 48, height: 48, borderRadius: "50%", background: s.bg, color: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, margin: "0 auto 12px" }}>
          {s.icon}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{alert.title || s.defaultTitle}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 18, lineHeight: 1.7, whiteSpace: "pre-line" }}>{alert.message}</div>
        <button
          onClick={onClose}
          style={{ background: s.color, color: "#fff", border: "none", borderRadius: 99, padding: "9px 32px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          حسنًا
        </button>
      </div>
    </div>
  );
}
