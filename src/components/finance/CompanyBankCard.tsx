import { useMemo, useState } from "react";
import { useCompanyFinancial } from "../../company/CompanyContext";
import { companyService } from "../../company/companyService";
import { isSaved, saveErrorText } from "../../company/saveResult";

/* بطاقةُ «البنك والسداد» — سطحٌ واحدٌ لا سطحان: «الحسابات ← إعدادات
   الحسابات» وحدها. وكانت تُعرَض كذلك في «الإعدادات ← بيانات الحملة»،
   فأُزيلت من هناك ليبقى للبنك مالكٌ واحدٌ في الواجهة.

   والكتابةُ عبر `update_company_bank_settings` (الترحيلة 20261022090000):
   الحقولُ الستّة وحدها، لـ`manage_payments` أو `manage_users`. وسياسةُ
   `company_config` لم تُوسَّع — فموظّفُ المال لا يبلغ عموداً آخر. */
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


  /* حفظُ البنك: الحقولُ الستّة وحدها عبر بابِها الضيّق — لا عمودَ هويّةٍ
     ولا لونَ يُرسَل من هنا، والدالّةُ ترفض أيَّ مفتاحٍ سواها. */
  async function saveBank() {
    if (!canEdit) { setBankMsg({ text: "لا تملك صلاحية تعديل بيانات البنك والسداد.", ok: false }); return; }
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
    const res = await companyService.updateBankSettings(patch);
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
          تعديلُ بيانات البنك والسداد يحتاج صلاحيةَ «إدارة المدفوعات». القيمُ معروضةٌ للاطّلاع.
        </div>
      )}
      {bankMsg && <div style={noteBox(bankMsg.ok)}>{bankMsg.text}</div>}
    </div>
  );
}
