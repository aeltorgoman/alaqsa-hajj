import { useState } from "react";
import { Modal } from "./Modal";
import { Avatar } from "./Avatar";
import { btnS } from "../utils";
import type { Passenger } from "../types";
import { namesClearlyDiffer, type PermitConfirmState } from "./permitMatch";

/* ═══════════════════════════════════════════════════════════════
   تأكيد تصريح الحج — مودال واحد لكل المسارات

   كان لتصريح الحج مساران بتجربتين مختلفتين: واحد من ملف الحاجّ،
   وآخر من زر المسح العام. والسؤال في الحالتين واحد — «هل هذا
   التصريح يخصّ هذا الحاجّ؟» — فلا سبب لجوابين مختلفين في الشكل.

   ولهذا خرج المودال إلى هنا **نقلاً بلا تغيير منطق**: هو عرضٌ
   وتأكيد لا أكثر. والرفع وحفظ القاعدة وتنظيف الكائن عند فشل
   الحفظ تبقى كلها عند المستدعي، فلا يملك هذا الملف قراراً.

   ⚠️ المودال القديم في صفحة الحجاج يبقى للجواز والبطاقة كما هو:
   سؤالهما مختلف (مرشَّحون متعددون · مقارنة صور · «حاجّ جديد»)،
   وتوحيدهما ليس من هذا النطاق.
   ═══════════════════════════════════════════════════════════════ */

type Props = {
  state: PermitConfirmState | null;
  passengers: Passenger[];
  saving: boolean;
  /** تغيير الحاجّ المختار — يحسب تحذير الاسم للمختار الجديد */
  onChange: (next: PermitConfirmState) => void;
  /** الرفع والحفظ عند المستدعي — هذا المكوّن لا يكتب شيئاً */
  onConfirm: () => void;
  onCancel: () => void;
};

export function PermitConfirmModal({ state, passengers, saving, onChange, onConfirm, onCancel }: Props) {
  const [search, setSearch] = useState("");

  const pick = (x: Passenger) => onChange({
    ...state!, passenger: x, matchedBy: null,
    nameMismatch: !!(state!.parsed.full_name && namesClearlyDiffer(state!.parsed.full_name, x)),
  });

  return (
    <Modal show={!!state} onClose={() => { if (!saving) onCancel(); }} title="تأكيد تصريح الحج" maxWidth={400}>
      {state && (() => {
        const { parsed, passenger, matchedBy, nameMismatch } = state;
        const rows: [string, string][] = [
          ["رقم الهوية", parsed.national_id],
          ["رقم الجواز", parsed.passport_number],
          ["الاسم", parsed.full_name],
        ];
        return (
          <>
            {/* البيانات المستخرَجة تُعرض في الحالتين — قبل المطابقة
                وقبل الاختيار اليدوي على السواء */}
            <div style={{ background: "var(--bg-2)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>قُرئ من التصريح:</div>
              {rows.map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 5 }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: value ? 700 : 400, color: value ? "var(--em7)" : "var(--muted)" }}>{value || "غير موجود"}</span>
                </div>
              ))}
            </div>

            {passenger ? (
              <>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>
                  {matchedBy === "national_id" ? "طوبق بالهوية مع:" : matchedBy === "passport" ? "طوبق برقم الجواز مع:" : "الحاجّ المختار:"}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--paper)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--line)" }}>
                  <Avatar name={passenger.name_ar} gender={passenger.gender} size={36} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{passenger.short_ar || passenger.name_ar}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{passenger.nat} · {passenger.national_id || passenger.passport || "—"}</div>
                  </div>
                  <button disabled={saving} onClick={() => onChange({ ...state, passenger: null, matchedBy: null, nameMismatch: false })}
                    style={{ background: "var(--bg-2)", border: "1px solid var(--line)", borderRadius: 7, padding: "5px 9px", fontSize: 10.5, cursor: "pointer", color: "var(--text-muted)" }}>تغيير</button>
                </div>

                {nameMismatch && (
                  <div style={{ marginTop: 10, background: "var(--danger-bg)", border: "1px solid #f0c0cc", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--danger)", marginBottom: 3 }}>⚠ الاسم في التصريح يختلف عن اسم الحاجّ</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>الرقم طابق، لكن الاسم المقروء «{parsed.full_name}» لا يشبه «{passenger.name_ar}». راجع المستند قبل الحفظ.</div>
                  </div>
                )}

                <div style={{ fontSize: 12, color: "var(--text-muted)", margin: "14px 0" }}>هل تؤكّد أن هذا التصريح يخصّ هذا الحاجّ؟ سيُرفع الملف بعد التأكيد.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button disabled={saving} onClick={onConfirm}
                    style={{ flex: 1, background: "var(--em7)", color: "var(--g3)", border: "none", padding: "10px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? .6 : 1 }}>
                    {saving ? "جارٍ الحفظ…" : "نعم، ارفع واحفظ"}
                  </button>
                  <button disabled={saving} onClick={onCancel} style={{ flex: 1, background: "var(--female-bg)", color: "var(--danger)", border: "0.5px solid #f0c0cc", padding: "10px 0", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>إلغاء</button>
                </div>
              </>
            ) : (
              <>
                {/* لا مطابقة آمنة: الاسم وحده لا يكفي للتحديد التلقائي،
                    فالاختيار للمستخدم ثم التأكيد */}
                <div style={{ fontSize: 11.5, color: "var(--danger)", fontWeight: 700, marginBottom: 8 }}>تعذّر تحديد الحاجّ بأمان من التصريح — اختره يدوياً.</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--bg-2)", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                  <input style={{ border: "none", background: "transparent", fontSize: 12, flex: 1, outline: "none", fontFamily: "inherit" }}
                    placeholder="ابحث بالاسم أو الرقم..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto" }}>
                  {passengers.filter(x => !search
                    || (x.name_ar || "").includes(search)
                    || (x.short_ar || "").includes(search)
                    || (x.national_id || "").includes(search)
                    || (x.passport || "").includes(search)).slice(0, 60).map(x => (
                    <div key={x.id} onClick={() => pick(x)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 3, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = "var(--success-bg)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <Avatar name={x.name_ar} gender={x.gender} size={28} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{x.short_ar || x.name_ar}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{x.national_id || x.passport || "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={onCancel} style={{ ...btnS(), width: "100%", marginTop: 10 }}>إلغاء — بلا رفع</button>
              </>
            )}
          </>
        );
      })()}
    </Modal>
  );
}
