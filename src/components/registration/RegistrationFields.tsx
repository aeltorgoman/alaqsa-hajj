import type { ReactNode } from "react";
import { inp } from "../../utils";

/* ═══════════════════════════════════════════════════════════════
   حقول التسجيل — عرضٌ فقط

   الحقول مجموعاتٌ بالمعنى لا بترتيب صفحة الجواز (تختلف الجوازات بين
   الدول): البيانات الشخصية، ثم المستندات، ثم التواصل، ثم ما يخصّ
   نوع التسجيل. والتسميات هي هي، والقيم وتحقّقها ملكُ الصفحة.
   ═══════════════════════════════════════════════════════════════ */

export type IdentityForm = {
  name_ar: string; name_en: string; short_ar: string; short_en: string;
  passport: string; national_id: string; nat: string;
  dob: string; expiry: string; id_expiry: string; gender: string; phone: string;
};
type TextKey = Exclude<keyof IdentityForm, "gender">;

const PERSONAL: [string, TextKey][] = [
  ["الاسم بالعربي *", "name_ar"], ["الاسم بالإنجليزي", "name_en"],
  ["المختصر عربي", "short_ar"], ["المختصر إنجليزي", "short_en"],
  ["الجنسية", "nat"], ["تاريخ الميلاد", "dob"],
];
const DOCUMENTS: [string, TextKey][] = [
  ["رقم الجواز", "passport"], ["انتهاء الجواز", "expiry"],
  ["رقم البطاقة", "national_id"], ["انتهاء البطاقة", "id_expiry"],
];

export function FieldSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="regf-sec">
      <legend className="regf-legend">{title}</legend>
      {children}
      <style>{FIELDS_CSS}</style>
    </fieldset>
  );
}

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className="regf-field" style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <span className="regf-label">{label}</span>
      {children}
    </label>
  );
}

/** الحقول المشتركة بين الحاجّ والإداري — بأسمائها ومواضعها في القاعدة كما هي. */
export function IdentityFields<F extends IdentityForm>({ form, onChange, phoneLabel = "رقم الهاتف" }: {
  form: F;
  onChange: (key: keyof IdentityForm, value: string) => void;
  phoneLabel?: string;
}) {
  const text = ([label, key]: [string, TextKey]) => (
    <Field key={key} label={label}>
      <input style={inp} value={form[key] ?? ""} onChange={e => onChange(key, e.target.value)} />
    </Field>
  );
  return (
    <>
      <FieldSection title="البيانات الشخصية">
        <div className="regf-grid">
          {PERSONAL.map(text)}
          <Field label="الجنس">
            <select style={inp} value={form.gender} onChange={e => onChange("gender", e.target.value)}>
              <option value="ذكر">ذكر</option>
              <option value="أنثى">أنثى</option>
            </select>
          </Field>
        </div>
      </FieldSection>
      <FieldSection title="بيانات المستندات">
        <div className="regf-grid">{DOCUMENTS.map(text)}</div>
      </FieldSection>
      <FieldSection title="بيانات التواصل">
        <div className="regf-grid">{text([phoneLabel, "phone"])}</div>
      </FieldSection>
    </>
  );
}

/** شريط حالة القراءة — حالاتٌ حقيقية لا نسبة مخترعة. */
export function ScanStatusBar({ scanning, error, onRetry }: { scanning: string | null; error: string | null; onRetry?: () => void }) {
  if (scanning) {
    return (
      <div role="status" className="regf-scan">
        <span className="docv-spin" />
        <div><b>{scanning}</b><div className="regf-scan-sub">قد تستغرق القراءة بضع ثوانٍ — يمكنك متابعة الإدخال، والحفظ متاح بعد انتهائها</div></div>
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="regf-scan err">
        <div style={{ flex: 1 }}><b>تعذّرت قراءة المستند</b><div className="regf-scan-sub">{error} — يمكنك إعادة المحاولة أو إدخال البيانات يدوياً.</div></div>
        {onRetry && <button type="button" className="regf-retry" onClick={onRetry}>إعادة المحاولة</button>}
      </div>
    );
  }
  return null;
}

const FIELDS_CSS = `
.regf-sec{border:none;margin:0 0 14px;padding:0;min-width:0}
.regf-legend{width:100%;text-align:start;font-size:11.5px;font-weight:800;color:var(--primary);margin-bottom:8px;padding:0}
.regf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 10px}
.regf-field{display:flex;flex-direction:column;min-width:0}
.regf-label{font-size:10.5px;color:var(--text-muted);margin-bottom:3px}
.regf-scan{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--primary)}
.regf-scan.err{color:#B71C1C}
.regf-scan-sub{font-size:10.5px;color:var(--text-muted);font-weight:400;margin-top:1px}
.regf-retry{padding:5px 12px;border-radius:8px;border:1px solid #B71C1C;background:transparent;color:#B71C1C;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}
@media (max-width:560px){.regf-grid{grid-template-columns:1fr}}
`;
