// ============================================================
// بياناتُ البنك والسداد على الورق
// ============================================================
/* المصدرُ واحد: الحقولُ الستّة في `company_config` كما يعرضها
   `useCompanyFinancial()` — ومالكُها «الحسابات ← إعدادات الحسابات» وحدها.
   ولا نسخةَ هنا: يُمرَّر ما في المصدر لحظةَ الطباعة، ويُرسَم المملوءُ منه.

   والمعرّفاتُ (رقمُ الحساب وIBAN وSWIFT والسجلّ التجاريّ) تُعزَل اتّجاهاً
   من اليسار إلى اليمين داخل السطر العربيّ، فلا تنقلب أرقامُها ولا حروفُها. */
import { escapeCompanyHtml } from "./print.brand";

export type PrintBankLine = { label: string; value: string; ltr: boolean };

/** ما يحتاجه السطرُ من مصدر البنك — مطابقٌ لـ`CompanyFinancial`. */
export type BankSource = {
  bankName: string; accountName: string; accountNumber: string;
  iban: string; swift: string; commercialRegistration: string;
};

/** الحقولُ المملوءةُ وحدها، بترتيبها في الإعدادات. والفارغُ لا سطرَ له. */
export function bankLinesFrom(src: BankSource | null | undefined): PrintBankLine[] {
  if (!src) return [];
  const rows: PrintBankLine[] = [
    { label: "اسم البنك",          value: src.bankName,               ltr: false },
    { label: "اسم صاحب الحساب",    value: src.accountName,            ltr: false },
    { label: "رقم الحساب",         value: src.accountNumber,          ltr: true  },
    { label: "IBAN",               value: src.iban,                   ltr: true  },
    { label: "SWIFT",              value: src.swift,                  ltr: true  },
    { label: "رقم السجل التجاري",  value: src.commercialRegistration, ltr: true  },
  ];
  return rows.map(r => ({ ...r, value: (r.value ?? "").trim() })).filter(r => r.value !== "");
}

/** قسمٌ مضغوطٌ بعنوانٍ صغير وشبكةٍ من سطرين — أو لا شيءَ إن لم يُملأ حقل. */
export function bankBlockHTML(lines: PrintBankLine[] | null | undefined, primaryColor: string): string {
  if (!lines || lines.length === 0) return "";
  const cells = lines.map(l =>
    `<div class="bank-cell"><span class="bank-label">${escapeCompanyHtml(l.label)}</span>` +
    `<span class="bank-value">${l.ltr ? `<bdi dir="ltr">${escapeCompanyHtml(l.value)}</bdi>` : escapeCompanyHtml(l.value)}</span></div>`).join("");
  return `<div class="bank-block">
  <div class="bank-title">بيانات البنك والسداد</div>
  <div class="bank-grid">${cells}</div>
</div>
<style>
  .bank-block { break-inside: avoid; page-break-inside: avoid; margin: 4pt 0 10pt; padding: 8pt 12pt;
                border: 0.75pt solid ${primaryColor}55; border-inline-start: 3pt solid ${primaryColor}; border-radius: 5pt; }
  .bank-title { font-size: 10pt; font-weight: 800; color: ${primaryColor}; margin-bottom: 5pt; }
  .bank-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 18pt; }
  .bank-cell { display: flex; gap: 6pt; align-items: baseline; font-size: 10pt; min-width: 0; }
  .bank-label { color: #777; white-space: nowrap; }
  .bank-value { font-weight: 700; color: #1c1c1c; overflow-wrap: anywhere; }
  .bank-value bdi { unicode-bidi: isolate; letter-spacing: .3pt; }
</style>`;
}
