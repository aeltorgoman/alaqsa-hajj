import { useMemo, useState } from "react";
import { useCompanyFinancial } from "../../company/CompanyContext";
import { companyService } from "../../company/companyService";
import { isSaved, saveErrorText } from "../../company/saveResult";

/* بطاقةُ «البنك والسداد» — مصدرٌ واحدٌ لسطحَين:
   • الحسابات (يفتحها `manage_payments`) — تحريرٌ لمن يملك `manage_users` أيضاً.
   • الإعدادات ← بيانات الحملة (تفتحها `manage_users`) — فمالكُ
     `manage_users` وحدَه يبلغ بياناتِ البنك دون أن يُفتَح له المال.
   الكتابةُ على `company_config` تشترط `manage_users` في RLS كما كانت. */
const inputStyle = { width:"100%", padding:"8px 12px", borderRadius:8, border:"1px solid var(--border)", background:"var(--bg-input)", fontFamily:"var(--font-body)", fontSize:13, boxSizing:"border-box" as const };
const cardBox = { background:"var(--bg-card)", borderRadius:12, padding:16, marginBottom:16, boxShadow:"var(--shadow-sm)" };
const cardTitle = { fontWeight:700, color:"var(--text)", marginBottom:12, fontSize:14, borderBottom:"1px solid var(--border)", paddingBottom:8 };
const noteBox = (ok: boolean) => ({
  marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, lineHeight: 1.7,
  background: ok ? "var(--success-bg)" : "var(--danger-bg)",
  color: ok ? "var(--success)" : "var(--danger)",
  border: `1px solid ${ok ? "var(--success)" : "var(--danger)"}`,
});

export function CompanyBankCard({ canEdit }: { canEdit: boolean }) {
  const companyFinancial = useCompanyFinancial();
  /* ═══ نموذجُ البنك يتبع السياقَ ولا يُرآيه ═══
     ⚠️ كان يُهيَّأ مرّةً عند التركيب، على افتراضِ أنّ السياقَ لا يتغيّر
     في الجلسة. وقد ظهر أنّه كان يُبنى **قبل الدخول** من الملفِّ العلنيّ
     بلا أعمدةِ البنك — فصار يُعاد بعد الدخول، وما هُيِّئ قبل ذلك يبقى
     فارغاً لو ثُبِّت. فالعرضُ **مُشتقٌّ** من السياقِ، والتحريرُ مُخزَّنٌ
     مع بصمةِ المصدرِ الذي حُرِّر عليه: إن تغيّر المصدرُ ظهرت قيمُه هو. */
  const bankSource = useMemo(() => ({
    bank_name: companyFinancial.bankName,
    bank_account_name: companyFinancial.accountName,
    bank_account_number: companyFinancial.accountNumber,
    bank_iban: companyFinancial.iban,
    bank_swift: companyFinancial.swift,
    commercial_registration: companyFinancial.commercialRegistration,
  }), [companyFinancial]);
  const bankSourceKey = JSON.stringify(bankSource);
  const [bankEdit, setBankEdit] = useState<{ sourceKey: string; values: typeof bankSource } | null>(null);
  const bankForm = bankEdit?.sourceKey === bankSourceKey ? bankEdit.values : bankSource;
  const setBankField = (key: keyof typeof bankSource, value: string) =>
    setBankEdit({ sourceKey: bankSourceKey, values: { ...bankForm, [key]: value } });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankMsg, setBankMsg] = useState<{ text: string; ok: boolean } | null>(null);


  /* حفظُ البنك: **نفسُ** أعمدةِ `company_config` التي كانت تُكتَب من
     صفحة الإعدادات، وحدَها لا غير — لا عمودَ هويّةٍ ولا لونَ يُرسَل
     من هنا، فلا يُصادِر هذا السطحُ حقلاً ليس له. */
  async function saveBank() {
    if (!canEdit) { setBankMsg({ text: "لا تملك صلاحية تعديل بيانات الحملة.", ok: false }); return; }
    /* ⚠️ لا يُرسَل إلا **ما غيّره المستخدم**. لو كان المصدرُ ملفّاً
       ناقصاً — كالعلنيِّ قبل اكتمالِ إعادةِ القراءةِ بعد الدخول — لكان
       إرسالُ النموذجِ كاملاً يكتب الفراغَ فوق بياناتِ البنكِ الحقيقيّة.
       والحقلُ الذي لم يُلمَس لا يُكتَب أبداً، فلا يُمحى بحال. */
    const changed = (Object.keys(bankSource) as (keyof typeof bankSource)[])
      .filter(k => bankForm[k] !== bankSource[k]);
    if (changed.length === 0) { setBankMsg({ text: "لا تغييرَ للحفظ.", ok: true }); return; }
    const patch = Object.fromEntries(changed.map(k => [k, bankForm[k] || null]));
    setBankSaving(true);
    setBankMsg(null);
    const res = await companyService.updateConfig(patch);
    setBankSaving(false);
    if (!isSaved(res)) { setBankMsg({ text: saveErrorText(res), ok: false }); return; }
    /* سياقُ الشركةِ يُبنى عند الإقلاع، وتحديثُه يجري بإعادةِ التحميل
       كما تفعل صفحةُ الإعدادات — لا مالكَ حالةٍ ثانياً يُخترَع هنا. */
    setBankMsg({ text: "تم الحفظ — سيتم تحديث الصفحة...", ok: true });
    setTimeout(() => window.location.reload(), 1200);
  }

  return (
          <div style={cardBox}>
      <div style={cardTitle}>بيانات البنك والسداد</div>
      <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:14, lineHeight:1.8 }}>
        بياناتُ التحويلِ والسجلِّ التجاريّ. وهي بياناتُ حملةٍ لا موسم — تُحفَظ مرّةً وتخدم المواسمَ كلَّها.
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10 }}>
        {([
          { key:"bank_name",               label:"اسم البنك",          ltr:false },
          { key:"bank_account_name",       label:"اسم الحساب",         ltr:false },
          { key:"bank_account_number",     label:"رقم الحساب",         ltr:true  },
          { key:"bank_iban",               label:"IBAN",               ltr:true  },
          { key:"bank_swift",              label:"SWIFT",              ltr:true  },
          /* رقمُ السجلِّ التجاريّ يبقى مع بيانات البنك — قرارُ
             منتَجٍ مقصود: استعمالُه هنا لدعمِ التحويلِ والسداد. */
          { key:"commercial_registration", label:"رقم السجل التجاري",  ltr:true  },
        ] as const).map(f => (
          <div key={f.key}>
            <div style={{ fontSize:11, color:"var(--text-muted)", marginBottom:4, fontWeight:600 }}>{f.label}</div>
            <input
              style={{ ...inputStyle, background: canEdit ? "var(--bg-input)" : "var(--bg-2)", cursor: canEdit ? "text" : "not-allowed" }}
              dir={f.ltr ? "ltr" : undefined}
              value={bankForm[f.key]}
              readOnly={!canEdit}
              disabled={!canEdit}
              onChange={e => setBankField(f.key, e.target.value)} />
          </div>
        ))}
      </div>

      {canEdit ? (
        <button onClick={saveBank} disabled={bankSaving} style={{ width:"100%", marginTop:16, padding:12, background:"var(--primary)", color:"#fff", border:"none", borderRadius:10, fontFamily:"var(--font-body)", fontSize:14, cursor:bankSaving?"not-allowed":"pointer", fontWeight:600, opacity:bankSaving?0.6:1 }}>
          {bankSaving ? "جارٍ الحفظ..." : "حفظ بيانات البنك"}
        </button>
      ) : (
        /* لا زرَّ حفظٍ لمن لا يملك الصلاحية — والرسالةُ تقول السببَ
           صراحةً بدل زرٍّ يُضغَط فيُرفَض من الخادم. */
        <div style={{ marginTop:16, padding:"10px 13px", borderRadius:9, background:"var(--bg-2)", border:"1px solid var(--border)", fontSize:11.5, color:"var(--text-muted)", lineHeight:1.9 }}>
          هذه بياناتُ حملةٍ، وتعديلُها يحتاج صلاحيةَ «إدارة المستخدمين والإعدادات». القيمُ معروضةٌ للاطّلاع — ويحرّرها صاحبُ الصلاحية من «الإعدادات ← بيانات الحملة» أو من هنا.
        </div>
      )}
      {bankMsg && <div style={noteBox(bankMsg.ok)}>{bankMsg.text}</div>}
    </div>
  );
}
