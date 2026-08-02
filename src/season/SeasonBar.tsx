// ============================================================
// شريط سياق الموسم — يظهر فقط عند تصفّح موسم مؤرشَف
// ============================================================
// خ٣ في #42: أخطر ما في تبديل المواسم أن ينسى المستخدم أين هو.
// الشريط دائم لا قابل للإغلاق، ويحمل مخرجاً واحداً واضحاً.
import { btnS } from "../utils";
import { useSeason } from "./useSeason";

export function SeasonBar() {
  const { readOnly, viewedSeason, activeSeason, returnToActive } = useSeason();
  if (!readOnly) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      flexWrap: "wrap", gap: 10, padding: "8px 16px",
      background: "var(--warning-bg)",
      borderBottom: "0.5px solid var(--border)",
      fontFamily: "var(--font-body)", fontSize: 12,
    }}>
      <span style={{ fontWeight: 700, color: "var(--text)" }}>
        أنت تتصفّح موسم {viewedSeason.name} — للعرض فقط
      </span>
      <span style={{ color: "var(--text-muted)" }}>
        الموسم النشط هو {activeSeason.name}
      </span>
      <button onClick={returnToActive} style={btnS({ background: "var(--bg-input)" })}>
        العودة إلى الموسم النشط
      </button>
    </div>
  );
}
