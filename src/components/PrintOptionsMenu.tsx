// ============================================================
// «خيارات الطباعة» — زرٌّ واحدٌ يخدم كلَّ تقرير
// ============================================================
/* لا نسخةَ لكلّ تقرير ولا صندوقَ إعداداتٍ كبير: زرٌّ صغيرٌ بجوار أزرار
   الطباعة، يفتح ما يخصّ هذا التقريرَ وحدَه من الخيارات (تصفه
   `PrintOptionsSpec`)، فيُبدّل الموظّفُ ثمّ يطبع في الحال.

   والحالُ محليّةٌ في الجلسة: لا قاعدةَ بيانات ولا حالةٌ مشتركة —
   فالخيارُ قرارُ طبعةٍ لا إعدادُ نظام. */
import { useEffect, useRef, useState } from "react";
import { PRINT_OPTION_LABEL, PRINT_SPECS,
         type PrintOptionKey, type PrintOptionsState, type PrintReportKey } from "../print";

type Props = {
  report: PrintReportKey;
  value: PrintOptionsState;
  onChange: (next: PrintOptionsState) => void;
  /** خياراتٌ تُخفى لأنّ هذا المطبوعَ بعينه لا معنى لها فيه. */
  hide?: PrintOptionKey[];
};

export function PrintOptionsMenu({ report, value, onChange, hide = [] }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  /* النقرُ خارج اللوحة يغلقها — ولا تُغلَق بالتبديل، فالموظّف قد
     يبدّل أكثرَ من خيارٍ قبل أن يطبع. */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const keys = PRINT_SPECS[report].available.filter(k => !hide.includes(k));
  if (keys.length === 0) return null;
  const changed = keys.filter(k => value[k] !== PRINT_SPECS[report].defaults[k]).length;

  return (
    <div ref={box} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="خيارات إظهار عناصر المطبوع — لا تغيّر بيانات التقرير"
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "var(--bg-2, var(--paper))", border: "1px solid var(--border, var(--line))",
          color: "var(--text, var(--ink))", padding: "5px 11px", borderRadius: "var(--radius-sm, 8px)",
          fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "var(--font-body)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />
        </svg>
        خيارات الطباعة
        {changed > 0 && (
          <span style={{ fontSize: 10, fontWeight: 800, background: "var(--em7, var(--primary))",
                         color: "#fff", borderRadius: 99, padding: "0 5px", lineHeight: "15px" }}>
            {changed}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 6px)", insetInlineEnd: 0, zIndex: 50,
            minWidth: 236, padding: "8px 10px 10px", borderRadius: 10,
            background: "var(--paper, #fff)", border: "1px solid var(--line, #ddd)",
            boxShadow: "0 8px 24px rgba(0,0,0,.12)", textAlign: "right",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", marginBottom: 6 }}>
            عناصر المطبوع
          </div>
          {keys.map(k => (
            <label
              key={k}
              style={{
                display: "flex", alignItems: "center", gap: 7, padding: "5px 2px",
                fontSize: 12, fontWeight: 600, cursor: "pointer",
                color: value[k] ? "var(--ink, var(--text))" : "var(--muted)",
              }}
            >
              <input
                type="checkbox"
                checked={value[k]}
                onChange={e => onChange({ ...value, [k]: e.target.checked })}
                style={{ cursor: "pointer" }}
              />
              {PRINT_OPTION_LABEL[k]}
            </label>
          ))}
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
            تغيّر شكل المطبوع فقط — لا تغيّر بيانات التقرير ولا فلاتره.
          </div>
        </div>
      )}
    </div>
  );
}
