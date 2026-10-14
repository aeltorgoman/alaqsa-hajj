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

export function Field({ label, children, wide, review }: { label: string; children: ReactNode; wide?: boolean; review?: ReactNode }) {
  return (
    <div className={"regf-field" + (review ? " regf-review" : "")} style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <label className="regf-field-in">
        <span className="regf-label">{label}</span>
        {children}
      </label>
      {review}
    </div>
  );
}

/* ── مراجعة الاختلاف (التعديل فقط) ──
   قراءةُ المستند البديل **اقتراحٌ** لا كتابة: الحقلُ يبقى على قيمته
   المحفوظة حتى يقبل المستخدم القيمة المقترحة صراحةً أو يُبقي الحالية.
   تمييزٌ ذهبيّ خفيف — والأحمر للأخطاء وحدها. */
/* وإن اقترح المستندان قيمتين مختلفتين للحقل نفسه (رقم البطاقة من الجواز
   ومن البطاقة) تظهران معاً بمصدرَيهما — لا تحلّ إحداهما محلّ الأخرى صامتةً،
   والاختيار للمستخدم. */
export type FieldProposal = { options: { source: string; value: string }[] };

function ReviewBox({ label, proposal, current, onAccept, onKeep }: { label: string; proposal: FieldProposal; current: string; onAccept: (value: string) => void; onKeep: () => void }) {
  const single = proposal.options.length === 1;
  return (
    <div className="regf-prop" role="group" aria-label={`قيمة مقترحة لـ ${label}`}>
      {single
        ? <div className="regf-prop-row"><span className="regf-prop-k">المقترحة</span><b className="regf-prop-v">{proposal.options[0].value}</b></div>
        : <>
            <div className="regf-prop-note">المستندان يقترحان قيمتين مختلفتين — اختر إحداهما أو أبقِ الحالية</div>
            {proposal.options.map(o => (
              <div key={o.source} className="regf-prop-row"><span className="regf-prop-k">{o.source}</span><b className="regf-prop-v">{o.value}</b></div>
            ))}
          </>}
      <div className="regf-prop-row"><span className="regf-prop-k">الحالية</span><span className="regf-prop-v">{current || "— فارغة —"}</span></div>
      <div className="regf-prop-actions">
        {single
          ? <button type="button" className="regf-prop-btn ok" onClick={() => onAccept(proposal.options[0].value)}>قبول المقترحة</button>
          : proposal.options.map(o => (
              <button key={o.source} type="button" className="regf-prop-btn ok" onClick={() => onAccept(o.value)}>قبول قيمة {o.source}</button>
            ))}
        <button type="button" className="regf-prop-btn" onClick={onKeep}>إبقاء الحالية</button>
      </div>
    </div>
  );
}

/** الحقول المشتركة بين الحاجّ والإداري — بأسمائها ومواضعها في القاعدة كما هي. */
export function IdentityFields<F extends IdentityForm>({ form, onChange, phoneLabel = "رقم الهاتف", labels, proposals, onResolve }: {
  form: F;
  onChange: (key: keyof IdentityForm, value: string) => void;
  phoneLabel?: string;
  /** تسمياتٌ تخصّ نافذةً بعينها (تبقى تسميات التعديل كما كانت) */
  labels?: Partial<Record<keyof IdentityForm, string>>;
  /** قيمٌ مقترحة من مستندٍ بديل — لا تُكتب في النموذج إلا بالقبول */
  proposals?: Partial<Record<keyof IdentityForm, FieldProposal>>;
  /** `value` = القيمة المقبولة؛ `null` = إبقاء الحالية */
  onResolve?: (key: keyof IdentityForm, value: string | null) => void;
}) {
  const review = (key: keyof IdentityForm, label: string) => {
    const p = proposals?.[key];
    return p && onResolve
      ? <ReviewBox label={label} proposal={p} current={form[key] ?? ""} onAccept={v => onResolve(key, v)} onKeep={() => onResolve(key, null)} />
      : undefined;
  };
  const text = ([fallback, key]: [string, TextKey]) => {
    const label = labels?.[key] ?? fallback;
    return (
      <Field key={key} label={label} review={review(key, label)}>
        <input style={inp} value={form[key] ?? ""} onChange={e => onChange(key, e.target.value)} />
      </Field>
    );
  };
  return (
    <>
      <FieldSection title="البيانات الشخصية">
        <div className="regf-grid">
          {PERSONAL.map(text)}
          <Field label="الجنس" review={review("gender", "الجنس")}>
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
.regf-field-in{display:flex;flex-direction:column;min-width:0}
.regf-review{background:rgba(212,160,23,.07);border:1px solid rgba(201,168,76,.55);border-radius:10px;padding:6px 8px}
.regf-prop{margin-top:6px;font-size:11px}
.regf-prop-row{display:flex;gap:6px;align-items:baseline;line-height:1.6}
.regf-prop-k{color:var(--text-muted);min-width:46px;font-size:10.5px;white-space:nowrap}
.regf-prop-v{color:var(--ink);word-break:break-word}
.regf-prop-actions{display:flex;gap:6px;margin-top:5px;flex-wrap:wrap}
.regf-prop-note{font-size:10.5px;color:#7a5a0f;font-weight:700;margin-bottom:2px}
.regf-prop-btn{flex:1;padding:4px 6px;border-radius:7px;border:1px solid var(--line);background:var(--paper,#fff);color:var(--ink);font-family:inherit;font-size:11px;font-weight:700;cursor:pointer}
.regf-prop-btn.ok{border-color:#B8902F;color:#7a5a0f;background:rgba(212,160,23,.12)}
.regf-prop-btn:focus-visible{outline:2px solid var(--primary);outline-offset:1px}
.regf-label{font-size:10.5px;color:var(--text-muted);margin-bottom:3px}
.regf-scan{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--primary)}
.regf-scan.err{color:#B71C1C}
.regf-scan-sub{font-size:10.5px;color:var(--text-muted);font-weight:400;margin-top:1px}
.regf-retry{padding:5px 12px;border-radius:8px;border:1px solid #B71C1C;background:transparent;color:#B71C1C;font-family:inherit;font-size:11.5px;font-weight:700;cursor:pointer;white-space:nowrap}
@media (max-width:560px){.regf-grid{grid-template-columns:1fr}}
`;
