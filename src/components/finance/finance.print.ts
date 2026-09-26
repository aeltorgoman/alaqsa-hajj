// ============================================================
// إنشاء صفحات HTML والطباعة للحسابات (بدون React ولا JSX)
// ============================================================
import type { Passenger } from "../../types";
import type { PricingMap, Payment, CustomCharge, FinancialGroup, FinanceRow, CashflowByDate, PaymentReceipt } from "./finance.types";
import { amountInArabicWords } from "./amountInWords";
import type { PrintBranding } from "../../print";
import { fmtAmt, financeStatus, getPriceInfo, getPackageKey, calcTotalDue, calcTotalPaid, paidFlightService, isSpecialPackage, SERVICE_FILTERS, serviceLabel, SPECIAL_PACKAGE_LABEL, PRICING_KEYS } from "./finance.utils";
/* ⚠️ متغيّراتُ السمة (`var(--danger)` وأخواتُها) **لا تعمل في المطبوع**:
   إطارُ الطباعة مستندٌ مستقلٌّ لا يحمل أوراقَ أنماط التطبيق، فتسقط
   القيمةُ ويرث النصُّ لونَ أبيه — وقد يكون أبيضَ على أبيض. فألوانُ
   الأرقام في الطباعة قيمٌ صريحةٌ كبقيّة هذا الملفّ. */
const PRINT_DANGER  = "#C0392B";
const PRINT_SUCCESS = "#2A9D8F";
const balanceColor = (balance: number) => (balance > 0 ? PRINT_DANGER : PRINT_SUCCESS);
/* `financeStatus` تُرجِع ألوانَ السمة للشاشة — وهي المصدرُ نفسه للتسمية،
   فلا حسابَ ثانٍ هنا: التسميةُ منها، واللونُ يُترجَم للطباعة. */
const PRINT_STATUS_COLOR: Record<string, string> = {
  "مسدد": PRINT_SUCCESS, "جزئي": "#D4A017", "لم يدفع": PRINT_DANGER,
  "رصيد دائن": "#1565A8", "غير مسعّر": "#888888",
};
const printStatusColor = (label: string) => PRINT_STATUS_COLOR[label] || "#1c1c1c";

/* ═══ البنيةُ المشتركة للطباعة ═══
   لا قشرةَ موازية بعد R1 ولا `printInPage` ثانية ولا تهريبَ ثانٍ ولا
   تطبيعَ هويّةٍ ثانٍ. وهذا الملفّ صار **منتِجَ تقاريرَ ماليّة** يبني
   أجساماً ويسلّمها للبنية المشتركة.
   ⚠️ ولا حسابَ انتقل إلى هنا ولا تغيّر: `calcTotalDue` تبقى المصدرَ
   الوحيد، وسلوكُ المالية V1 (#115) كما هو حرفاً. */
import { esc, safeBranding, logoOrInitial, issuedStamp, pageRule, joinSections,
         COLOR_ADJUST_RULE_ALL, makeFinanceHTML, printInPage } from "../../print";
import type { PrintChrome } from "../../print";
export { makeFinanceHTML, printInPage };





// ============================================================
// HTML إيصال الدفعة — نصفُ A4، والبنيةُ القائمةُ تُحسَّن لا تُستبدل
// ============================================================
/* الإيصالُ يُطبَع من **صفِّ الإيصال** لا من سطرِ الدفع: الرقمُ الرسميُّ
   والإجماليُّ التاريخيُّ واسمُ الدافعِ واسمُ الموسمِ كلُّها مجمَّدةٌ فيه،
   فإعادةُ الطباعةِ تُخرج الورقةَ نفسَها حتى بعد إزالةِ الحاجِّ أو حذفِ
   الموسمِ كلِّه.

   والملغى يُطبَع بنفسِ رقمِه وعليه «ملغي» وسببُه — الرقمُ لا يُعاد. */
export function makeReceiptHTML(
  receipt: PaymentReceipt, brand: PrintBranding, allocations: { name: string; amount: number }[] = []
): string {
  const { logoUrl, companyName, tagline, primaryColor, accentColor, stampUrl, signatureUrl } = safeBranding(brand);
  const logoHtml = logoOrInitial(logoUrl, companyName);
  const receiptNo = String(receipt.receipt_number);
  const cancelled = receipt.status === "cancelled";
  const total = Number(receipt.total_amount);
  const isGroup = !!receipt.group_name;

  /* صندوقُ الختمِ/التوقيعِ يقبل صورةً موقَّعةً إن مُرِّرت، وإلا يبقى
     إطاراً فارغاً كما اليوم — فلا شيءَ يتعطّل قبل دمج #177. */
  const assetBox = (url: string, label: string) => url
    ? `<div class="stamp-box"><img src="${url}" alt="${label}" /></div>`
    : `<div class="stamp-box"><span style="color:#ddd;font-size:11px">${label}</span></div>`;

  const allocRows = isGroup && allocations.length
    ? `<table class="alloc"><thead><tr><th>الحاج</th><th>النصيب</th></tr></thead><tbody>${
        allocations.map(a => `<tr><td>${esc(a.name)}</td><td>${fmtAmt(Number(a.amount))}</td></tr>`).join("")
      }</tbody></table>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>إيصال استلام دفعة ${esc(receiptNo)}</title>
<style>
  ${pageRule("10mm", false, "A5")}
  * { box-sizing: border-box; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; margin:0; padding:0; color:#1c1c1c; background:#fff; }
  .receipt { border:2px solid ${cancelled ? PRINT_DANGER : primaryColor}; border-radius:12px; overflow:hidden; position:relative; }
  .receipt-header { background:linear-gradient(135deg,${cancelled ? PRINT_DANGER : primaryColor},${cancelled ? "#7d1f1f" : accentColor}); color:#fff; padding:14px 18px; display:flex; align-items:center; gap:12px; }
  .logo-box { width:50px; height:50px; border-radius:8px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.15); color:#fff; font-size:20px; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; }
  .receipt-title { font-size:10px; color:rgba(255,255,255,0.85); margin-bottom:2px; }
  .receipt-subtitle { font-size:16px; font-weight:700; }
  .no-badge { margin-inline-start:auto; text-align:center; background:rgba(255,255,255,0.18); border:1.5px solid rgba(255,255,255,0.55); border-radius:9px; padding:5px 12px; }
  .no-badge-label { font-size:8.5px; color:rgba(255,255,255,0.85); }
  .no-badge-value { font-size:21px; font-weight:900; line-height:1.1; letter-spacing:.5px; }
  .receipt-body { padding:16px 18px; }
  .passenger-name { font-size:19px; font-weight:800; color:${primaryColor}; text-align:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1.5px dashed #ddd; }
  .amount-box { background:${primaryColor}10; border:2px solid ${primaryColor}; border-radius:10px; padding:12px; text-align:center; margin-bottom:12px; }
  .amount-label { font-size:10px; color:#888; margin-bottom:3px; }
  .amount-value { font-size:31px; font-weight:900; color:${primaryColor}; line-height:1; }
  .amount-currency { font-size:12.5px; color:#888; margin-top:3px; }
  .amount-words { font-size:11px; color:#444; margin-top:7px; padding-top:7px; border-top:1px dashed #ccc; line-height:1.6; }
  .details-grid { display:grid; grid-template-columns:auto 1fr; gap:5px 12px; font-size:12px; margin-bottom:12px; }
  .detail-label { color:#888; white-space:nowrap; }
  .detail-value { font-weight:600; }
  .alloc { width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:12px; }
  .alloc th { background:${primaryColor}; color:#fff; padding:3px 6px; font-weight:600; }
  .alloc td { border-bottom:1px solid #eee; padding:3px 6px; }
  .cancel-note { border:1.5px solid ${PRINT_DANGER}; background:#fdeaea; color:${PRINT_DANGER}; border-radius:8px; padding:8px 10px; font-size:11px; margin-bottom:12px; font-weight:700; }
  .watermark { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; }
  .watermark span { font-size:74px; font-weight:900; color:${PRINT_DANGER}; opacity:.17; transform:rotate(-22deg); letter-spacing:8px; }
  .receipt-footer { border-top:1.5px dashed #ddd; padding-top:10px; display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  .stamp-area { text-align:center; }
  .stamp-label { font-size:9.5px; color:#aaa; margin-bottom:5px; }
  .stamp-box { border:1px dashed #ccc; border-radius:8px; height:62px; display:flex; align-items:center; justify-content:center; overflow:hidden; padding:3px; }
  .stamp-box img { max-width:100%; max-height:100%; object-fit:contain; }
  ${COLOR_ADJUST_RULE_ALL}
</style></head><body>
<div class="receipt">
  ${cancelled ? `<div class="watermark"><span>ملغي</span></div>` : ""}
  <div class="receipt-header">
    <div class="logo-box">${logoHtml}</div>
    <div>
      <div class="receipt-title">${esc(companyName)}${tagline ? " · " + esc(tagline) : ""}</div>
      <div class="receipt-subtitle">إيصال استلام دفعة${cancelled ? " — ملغي" : ""}</div>
    </div>
    <div class="no-badge">
      <div class="no-badge-label">رقم الإيصال</div>
      <div class="no-badge-value">${esc(receiptNo)}</div>
    </div>
  </div>
  <div class="receipt-body">
    <div class="passenger-name">${esc(receipt.payer_name)}${isGroup ? " — دفعة مجموعة" : ""}</div>
    ${cancelled ? `<div class="cancel-note">هذا الإيصال ملغي${receipt.cancel_reason ? ` — السبب: ${esc(receipt.cancel_reason)}` : ""}</div>` : ""}
    <div class="amount-box">
      <div class="amount-label">المبلغ المستلم</div>
      <div class="amount-value">${fmtAmt(total)}</div>
      <div class="amount-currency">ريال قطري · QAR</div>
      <div class="amount-words">${esc(amountInArabicWords(total))}</div>
    </div>
    <div class="details-grid">
      <div class="detail-label">التاريخ:</div>
      <div class="detail-value">${esc(receipt.payment_date)}</div>
      <div class="detail-label">طريقة الدفع:</div>
      <div class="detail-value">${esc(receipt.method)}</div>
      <div class="detail-label">الموسم:</div>
      <div class="detail-value">${esc(receipt.season_name)}</div>
      ${receipt.issued_by ? `<div class="detail-label">المُحصِّل:</div><div class="detail-value">${esc(receipt.issued_by)}</div>` : ""}
      ${receipt.notes ? `<div class="detail-label">ملاحظات:</div><div class="detail-value">${esc(receipt.notes)}</div>` : ""}
    </div>
    ${allocRows}
    <div class="receipt-footer">
      <div class="stamp-area">
        <div class="stamp-label">ختم الشركة</div>
        ${assetBox(stampUrl, "الختم")}
      </div>
      <div class="stamp-area">
        <div class="stamp-label">توقيع المسؤول</div>
        ${assetBox(signatureUrl, "التوقيع")}
      </div>
    </div>
  </div>
</div>
</body></html>`;
}


// ============================================================
// كشف حساب الحاج الفردي - تصميم كبير للطباعة
// ============================================================
export function makePassengerStatementHTML(
  p: Passenger, pricing: PricingMap, customCharges: CustomCharge[], payments: Payment[], brand: PrintBranding
): string {
  const { logoUrl, companyName, tagline, primaryColor, accentColor } = safeBranding(brand);
  const s = p.services;
  const priceInfo = getPriceInfo(s, pricing);
  const pkgAmt = priceInfo.amount;
  const pCustom   = customCharges.filter(c => c.passenger_id === p.id);
  const pPayments = [...payments.filter(py => py.passenger_id === p.id)].sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
  const totalDue  = calcTotalDue(p, pricing, customCharges);
  const totalPaid = calcTotalPaid(p.id, payments);
  const balance   = totalDue - totalPaid;
  const logoHtml  = logoOrInitial(logoUrl, companyName);
  const { dateStr } = issuedStamp();

  /* الدرجة التجاريّة من الخدمة المطلوبة لا من حالة الحجز — نفس مصدر `calcTotalDue` */
  const flightPaid = paidFlightService(p);

  let rows = `<tr><td class="bayan">${esc(priceInfo.label)}</td><td class="debit">${fmtAmt(pkgAmt)}</td><td class="credit">—</td></tr>`;
  if (s.hotel_view==="مطلة") rows+=`<tr class="alt"><td class="bayan">إضافة مطلة</td><td class="debit">${fmtAmt(pricing["addon_view"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (s.camp_mina==="خاص")  rows+=`<tr><td class="bayan">خيمة خاصة - منى</td><td class="debit">${fmtAmt(pricing["addon_mina"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (s.camp_arafa==="خاص") rows+=`<tr class="alt"><td class="bayan">خيمة خاصة - عرفة</td><td class="debit">${fmtAmt(pricing["addon_arafa"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (s.bus==="VIP")         rows+=`<tr><td class="bayan">باص VIP</td><td class="debit">${fmtAmt(pricing["addon_bus_vip"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (flightPaid==="درجة أولى") rows+=`<tr class="alt"><td class="bayan">طيران درجة أولى</td><td class="debit">${fmtAmt(pricing["addon_first_class"]?.amount||0)}</td><td class="credit">—</td></tr>`;
  if (flightPaid==="بدون")      rows+=`<tr><td class="bayan">خصم بدون تذكرة <span class="badge-disc">خصم</span></td><td class="debit disc">(${fmtAmt(pricing["discount_no_ticket"]?.amount||0)})</td><td class="credit">—</td></tr>`;
  pCustom.forEach((c, i) => { rows+=`<tr${i%2===0?" class='alt'":""}><td class="bayan"><span class="badge-${c.type==="إضافة"?"add":"disc"}">${c.type==="إضافة"?"بند خاص":"خصم خاص"}</span> ${esc(c.description)}${c.notes?` <span class="note">(${esc(c.notes)})</span>`:""}</td><td class="${c.type==="إضافة"?"debit":"debit disc"}">${c.type==="إضافة"?fmtAmt(c.amount):`(${fmtAmt(c.amount)})`}</td><td class="credit">—</td></tr>`; });
  pPayments.forEach((py, i) => { rows+=`<tr class="pay-row${i%2===0?" alt":""}"><td class="bayan">دفعة — ${esc(py.payment_date)} <span class="method">(${esc(py.method)})</span>${py.notes?` — <span class="note">${esc(py.notes)}</span>`:""}</td><td class="debit">—</td><td class="credit paid">${fmtAmt(py.amount)}</td></tr>`; });

  const addonsList = [s.hotel_view==="مطلة"?"مطلة":"", s.camp_mina==="خاص"?"منى خاص":"", s.camp_arafa==="خاص"?"عرفة خاص":"", s.bus==="VIP"?"VIP":"", flightPaid==="درجة أولى"?"درجة أولى":"", flightPaid==="بدون"?"بدون تذكرة":""].filter(Boolean).join(" · ");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>كشف حساب — ${esc(p.short_ar||p.name_ar)}</title>
<style>
  ${pageRule("14mm 12mm")}
  * { box-sizing: border-box; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; margin:0; padding:0; color:#1c1c1c; background:#fff; font-size:12pt; }
  .header { display:flex; align-items:center; justify-content:space-between; padding-bottom:10pt; border-bottom:2pt solid ${primaryColor}; margin-bottom:8pt; }
  .logo-box { width:22mm; height:22mm; border-radius:3mm; overflow:hidden; display:flex; align-items:center; justify-content:center; background:${primaryColor}; color:#fff; font-size:18pt; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .company-name { font-size:15pt; font-weight:800; color:${primaryColor}; }
  .tagline { font-size:9pt; color:#888; margin-top:2pt; }
  .title-bar { background:linear-gradient(135deg,${primaryColor},${accentColor}); color:#fff; text-align:center; padding:10pt; border-radius:6pt; font-size:16pt; font-weight:800; margin:10pt 0; }
  .passenger-name { text-align:center; font-size:22pt; font-weight:900; color:${primaryColor}; margin:6pt 0 3pt; }
  .passenger-sub { text-align:center; font-size:10pt; color:#666; margin-bottom:12pt; }
  .summary { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10pt; margin-bottom:14pt; }
  .sum-card { border-radius:6pt; padding:12pt; text-align:center; border:1.5pt solid; }
  .sum-label { font-size:9pt; color:#888; margin-bottom:5pt; }
  .sum-val { font-size:24pt; font-weight:900; line-height:1; }
  .sum-cur { font-size:9pt; color:#888; margin-top:3pt; }
  .card-due  { background:${primaryColor}08; border-color:${primaryColor}; }
  .card-paid { background:#2A9D8F10; border-color:#2A9D8F; }
  .card-bal  { border:2pt solid; }
  table { width:100%; border-collapse:collapse; margin-bottom:12pt; }
  th { background:${primaryColor}; color:#fff; padding:9pt 12pt; text-align:right; font-size:11pt; font-weight:700; }
  td { padding:9pt 12pt; border:0.5pt solid #e8e8e8; font-size:11pt; }
  tr.alt td { background:#f9f7f4; }
  tr.pay-row td { background:#f0faf8; }
  tr.pay-row.alt td { background:#e8f5f2; }
  .bayan { font-size:11pt; }
  .debit { text-align:center; color:#C0392B; font-weight:700; font-size:11pt; min-width:80pt; }
  .credit { text-align:center; color:#2A9D8F; font-weight:700; font-size:11pt; min-width:80pt; }
  .disc { color:#2A9D8F !important; }
  .paid { font-size:12pt; }
  .method { font-size:9pt; color:#888; }
  .note { font-size:9pt; color:#999; }
  .badge-add { display:inline-block; font-size:8pt; padding:1pt 6pt; border-radius:99pt; background:#E8951A20; color:#E8951A; margin-left:5pt; }
  .badge-disc { display:inline-block; font-size:8pt; padding:1pt 6pt; border-radius:99pt; background:#2A9D8F20; color:#2A9D8F; margin-left:5pt; }
  .total-row td { background:${primaryColor}; color:#fff; font-weight:800; font-size:12pt; padding:10pt 12pt; text-align:center; }
  .total-row td:first-child { text-align:right; }
  .footer { text-align:center; font-size:8pt; color:#bbb; margin-top:14pt; border-top:0.5pt solid #eee; padding-top:8pt; }
  ${COLOR_ADJUST_RULE_ALL}
</style></head><body>
<div class="header">
  <div style="display:flex;align-items:center;gap:14px">
    <div class="logo-box">${logoHtml}</div>
    <div><div class="company-name">${esc(companyName)}</div>${tagline?`<div class="tagline">${esc(tagline)}</div>`:""}</div>
  </div>
  <div style="text-align:left;font-size:12px;color:#999;line-height:1.8">
    <div>تاريخ الإصدار: ${dateStr}</div>
  </div>
</div>
<div class="title-bar">كشف حساب</div>
<div class="passenger-name">${esc(p.short_ar||p.name_ar)}</div>
<div class="passenger-sub">${esc(priceInfo.label)}${addonsList?" &nbsp;·&nbsp; "+esc(addonsList):""}</div>
<div class="summary">
  <div class="sum-card card-due"><div class="sum-label">المطلوب</div><div class="sum-val" style="color:${primaryColor}">${fmtAmt(totalDue)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card card-paid"><div class="sum-label">المدفوع</div><div class="sum-val" style="color:#2A9D8F">${fmtAmt(totalPaid)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card card-bal" style="background:${balance>0?"#C0392B10":"#2A9D8F10"};border-color:${balance>0?"#C0392B":"#2A9D8F"}"><div class="sum-label">المتبقي</div><div class="sum-val" style="color:${balance>0?"#C0392B":"#2A9D8F"}">${fmtAmt(balance)}</div><div class="sum-cur">ر.ق</div></div>
</div>
<table>
  <tr><th>البيان</th><th style="width:140px;text-align:center">مدين (مطلوب)</th><th style="width:140px;text-align:center">دائن (مدفوع)</th></tr>
  ${rows}
  <tr class="total-row"><td>الإجمالي</td><td>${fmtAmt(totalDue)}</td><td>${fmtAmt(totalPaid)}</td></tr>
  <tr class="total-row" style="background:${balance>0?"#C0392B":"#2A9D8F"};color:#fff"><td>${balance>0?"الرصيد المتبقي":balance<0?"رصيد دائن للحاج":"الرصيد المتبقي"}</td><td colspan="2" style="text-align:center">${fmtAmt(Math.abs(balance))} ر.ق</td></tr>
</table>
<div class="footer">${esc(companyName)}${tagline?" — "+esc(tagline):""} · كشف حساب</div>
</body></html>`;
}

// ============================================================
// كشف حساب المجموعة المالية
// ============================================================
export function makeGroupStatementHTML(
  group: FinancialGroup, gPassengers: Passenger[], pricing: PricingMap,
  customCharges: CustomCharge[], payments: Payment[], brand: PrintBranding
): string {
  const { logoUrl, companyName, tagline, primaryColor, accentColor } = safeBranding(brand);
  const logoHtml  = logoOrInitial(logoUrl, companyName);
  const { dateStr } = issuedStamp();
  const gTotDue  = gPassengers.reduce((s,p) => s+calcTotalDue(p,pricing,customCharges), 0);
  const gTotPaid = gPassengers.reduce((s,p) => s+calcTotalPaid(p.id,payments), 0);
  const gTotBal  = gTotDue - gTotPaid;

  const memberRows = gPassengers.map((p, i) => {
    const due  = calcTotalDue(p,pricing,customCharges);
    const paid = calcTotalPaid(p.id,payments);
    const bal  = due - paid;
    const pPays = [...payments.filter(py=>py.passenger_id===p.id)].sort((a,b)=>new Date(a.payment_date).getTime()-new Date(b.payment_date).getTime());
    const priceInfo = getPriceInfo(p.services, pricing);
    const payRows = pPays.map(py => `<tr style="background:#f0faf8"><td style="padding:8px 16px;border:1px solid #e8e8e8;font-size:13px;padding-right:32px">دفعة — ${esc(py.payment_date)} <span style="color:#888;font-size:12px">(${esc(py.method)})</span>${py.notes?` — ${esc(py.notes)}`:""}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#888;font-size:13px">—</td><td style="text-align:center;border:1px solid #e8e8e8;color:#2A9D8F;font-weight:700;font-size:14px">${fmtAmt(py.amount)}</td></tr>`).join("");
    return `
    <div style="margin-bottom:20px;border:1.5px solid ${primaryColor}30;border-radius:10px;overflow:hidden;">
      <div style="background:${primaryColor}12;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${primaryColor}20">
        <div style="font-size:17px;font-weight:800;color:${primaryColor}">${i+1}. ${esc(p.short_ar||p.name_ar)}</div>
        <div style="font-size:13px;color:#666">${esc(priceInfo.label||"")}</div>
        <div style="display:flex;gap:16px;font-size:13px">
          <span>مطلوب: <strong style="color:${primaryColor}">${fmtAmt(due)}</strong></span>
          <span>مدفوع: <strong style="color:#2A9D8F">${fmtAmt(paid)}</strong></span>
          <span>متبقي: <strong style="color:${balanceColor(bal)}">${fmtAmt(bal)}</strong></span>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:${primaryColor}08"><td style="padding:8px 16px;border:1px solid #e8e8e8;font-size:14px">${esc(priceInfo.label)}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#C0392B;font-weight:700;font-size:14px;width:130px">${fmtAmt(priceInfo.amount)}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#888;width:130px">—</td></tr>
        ${payRows}
        <tr style="background:${primaryColor};color:#fff"><td style="padding:10px 16px;font-weight:700">الرصيد</td><td style="text-align:center;font-weight:800">${fmtAmt(due)}</td><td style="text-align:center;font-weight:800">${fmtAmt(paid)}</td></tr>
      </table>
    </div>`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>كشف حساب مجموعة — ${esc(group.name)}</title>
<style>
  ${pageRule("14mm 12mm")}
  * { box-sizing: border-box; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; margin:0; padding:0; color:#1c1c1c; background:#fff; font-size:11pt; }
  .header { display:flex; align-items:center; justify-content:space-between; padding-bottom:10pt; border-bottom:2pt solid ${primaryColor}; margin-bottom:8pt; }
  .logo-box { width:22mm; height:22mm; border-radius:3mm; overflow:hidden; display:flex; align-items:center; justify-content:center; background:${primaryColor}; color:#fff; font-size:16pt; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .title-bar { background:linear-gradient(135deg,${primaryColor},${accentColor}); color:#fff; text-align:center; padding:9pt; border-radius:5pt; font-size:15pt; font-weight:800; margin:10pt 0; }
  .summary { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:8pt; margin-bottom:14pt; }
  .sum-card { border-radius:5pt; padding:10pt; text-align:center; border:1.5pt solid; }
  .sum-label { font-size:8pt; color:#888; margin-bottom:4pt; }
  .sum-val { font-size:18pt; font-weight:900; line-height:1; }
  .sum-cur { font-size:8pt; color:#888; margin-top:3pt; }
  .footer { text-align:center; font-size:8pt; color:#bbb; margin-top:14pt; border-top:0.5pt solid #eee; padding-top:8pt; }
  ${COLOR_ADJUST_RULE_ALL}
</style></head><body>
<div class="header">
  <div style="display:flex;align-items:center;gap:14px">
    <div class="logo-box">${logoHtml}</div>
    <div><div style="font-size:20px;font-weight:800;color:${primaryColor}">${esc(companyName)}</div>${tagline?`<div style="font-size:12px;color:#888;margin-top:3px">${esc(tagline)}</div>`:""}</div>
  </div>
  <div style="text-align:left;font-size:12px;color:#999">تاريخ الإصدار: ${dateStr}</div>
</div>
<div class="title-bar">كشف حساب مجموعة</div>
<div style="text-align:center;font-size:24px;font-weight:900;color:${primaryColor};margin:6px 0 4px">${esc(group.name)}</div>
<div style="text-align:center;font-size:13px;color:#888;margin-bottom:14px">${gPassengers.length} أعضاء</div>
<div class="summary">
  <div class="sum-card" style="background:${primaryColor}08;border-color:${primaryColor}"><div class="sum-label">إجمالي المطلوب</div><div class="sum-val" style="color:${primaryColor}">${fmtAmt(gTotDue)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card" style="background:#2A9D8F10;border-color:#2A9D8F"><div class="sum-label">إجمالي المدفوع</div><div class="sum-val" style="color:#2A9D8F">${fmtAmt(gTotPaid)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card" style="background:${gTotBal>0?"#C0392B10":"#2A9D8F10"};border-color:${balanceColor(gTotBal)}"><div class="sum-label">إجمالي المتبقي</div><div class="sum-val" style="color:${balanceColor(gTotBal)}">${fmtAmt(gTotBal)}</div><div class="sum-cur">ر.ق</div></div>
  <div class="sum-card" style="background:#E8951A10;border-color:#E8951A"><div class="sum-label">عدد الأعضاء</div><div class="sum-val" style="color:#E8951A">${gPassengers.length}</div><div class="sum-cur">حاج</div></div>
</div>
${memberRows}
<div class="footer">${esc(companyName)}${tagline?" — "+esc(tagline):""} · كشف حساب مجموعة — ${esc(group.name)}</div>
</body></html>`;
}

// ============================================================
// جداول وتقارير الحسابات
// ============================================================
export function printTable(headers: string[], rows: string[][], primaryColor: string, totals?: string[]): string {
  const ths = headers.map(h=>`<th>${h}</th>`).join("");
  const trs = rows.map((r,i)=>`<tr style="${i%2===1?"background:rgba(0,0,0,0.02)":""}">${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("");
  const tot = totals ? `<tr class="tot-row" style="background:${primaryColor};color:#fff;font-weight:700">${totals.map(c=>`<td>${c}</td>`).join("")}</tr>` : "";
  return `<table><tr>${ths}</tr>${trs}${tot}</table>`;
}


export function printFullReport(data: FinanceRow[], pricing: PricingMap, brand: PrintBranding, title = "تقرير الحجاج المالي الكامل", chrome: PrintChrome = {}) {
  const { primaryColor } = safeBranding(brand);
  const tD=data.reduce((s,r)=>s+r.due,0), tP=data.reduce((s,r)=>s+r.paid,0), tB=tD-tP;
  const PER_PAGE = 30;
  const header = `<tr style="background:${primaryColor};color:#fff">
      <th style="width:20pt;text-align:center;font-size:9pt;padding:5pt 4pt">م</th>
      <th style="font-size:9pt;padding:5pt 6pt">الاسم</th>
      <th style="width:50pt;font-size:9pt;padding:5pt 4pt">الباقة</th>
      <th style="width:60pt;text-align:center;font-size:9pt;padding:5pt 4pt">المطلوب</th>
      <th style="width:60pt;text-align:center;font-size:9pt;padding:5pt 4pt">المدفوع</th>
      <th style="width:60pt;text-align:center;font-size:9pt;padding:5pt 4pt">المتبقي</th>
      <th style="width:40pt;text-align:center;font-size:9pt;padding:5pt 4pt">الحالة</th>
    </tr>`;
  // A4 portrait صافي الارتفاع = 297 - 20mm margins - ~35mm header = ~242mm
  // نقسم على 30 صف + صف الإجمالي = كل صف ~7.5mm = 21pt
  const ROW_H = "21pt";
  const pages = [];
  for (let i = 0; i < data.length; i += PER_PAGE) {
    const chunk = data.slice(i, i + PER_PAGE);
    const isLast = i + PER_PAGE >= data.length;
    const rows = chunk.map((r, j) => {
      const st = financeStatus(r.due, r.paid);
      const idx = i + j;
      return `<tr style="${idx%2===1?"background:#f5f5f5":""}">
        <td style="text-align:center;font-size:10pt;padding:0 4pt;height:${ROW_H};color:#888">${idx+1}</td>
        <td style="font-size:11pt;padding:0 6pt;height:${ROW_H}">${esc(r.p.short_ar||r.p.name_ar)}</td>
        <td style="font-size:9pt;padding:0 4pt;height:${ROW_H};color:#555">${esc(getPriceInfo(r.p.services, pricing).label.replace("باقة ",""))}</td>
        <td style="text-align:center;font-size:11pt;padding:0 4pt;height:${ROW_H};color:${primaryColor};font-weight:700">${fmtAmt(r.due)}</td>
        <td style="text-align:center;font-size:11pt;padding:0 4pt;height:${ROW_H};color:#2A9D8F;font-weight:700">${fmtAmt(r.paid)}</td>
        <td style="text-align:center;font-size:11pt;padding:0 4pt;height:${ROW_H};color:${balanceColor(r.balance)};font-weight:700">${fmtAmt(r.balance)}</td>
        <td style="text-align:center;font-size:10pt;padding:0 4pt;height:${ROW_H};color:${printStatusColor(st.label)};font-weight:700">${st.label}</td>
      </tr>`;
    }).join("");
    const totRow = isLast ? `<tr class="tot-row" style="background:${primaryColor};color:#fff;font-weight:700">
      <td colspan="3" style="text-align:right;padding:6pt 6pt;font-size:11pt">الإجمالي</td>
      <td style="text-align:center;padding:6pt;font-size:11pt">${fmtAmt(tD)}</td>
      <td style="text-align:center;padding:6pt;font-size:11pt">${fmtAmt(tP)}</td>
      <td style="text-align:center;padding:6pt;font-size:11pt">${fmtAmt(tB)}</td>
      <td></td>
    </tr>` : "";
    pages.push(`<div style="${!isLast?"page-break-after:always":""}"><table style="table-layout:fixed">${header}${rows}${totRow}</table></div>`);
  }
  const body = pages.join("");
  printInPage(makeFinanceHTML(title, body, brand, chrome));
}


/* صفٌّ واحدٌ لكلِّ **إيصال** لا لكلِّ سطرِ توزيع: دفعةُ المجموعةِ حدثٌ
   واحدٌ فتُطبَع سطراً واحداً. والملغى يبقى ظاهراً موسوماً مشطوباً ولا
   يدخل الإجمالي. */
export type PaymentReportRow = {
  key: string; receiptNo: string; name: string; date: string;
  method: string; amount: number; notes: string; cancelled: boolean;
};

export function printPaymentsReport(rows: PaymentReportRow[], brand: PrintBranding, from = "", to = "", chrome: PrintChrome = {}) {
  const { primaryColor } = safeBranding(brand);
  const active = rows.filter(r => !r.cancelled);
  const cancelledCount = rows.length - active.length;
  const periodLine = `<div style="margin-bottom:10pt;font-size:11pt;color:#555">الفترة: من <b>${esc(from || "البداية")}</b> إلى <b>${esc(to || "اليوم")}</b> · عدد الإيصالات: <b>${rows.length}</b>${cancelledCount ? ` · منها ملغي: <b>${cancelledCount}</b>` : ""}</div>`;
  const sorted = [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = active.reduce((s, r) => s + Number(r.amount), 0);
  const PER_PAGE = 30;
  const header = `<tr style="background:${primaryColor};color:#fff">
    <th style="width:20pt;text-align:center;font-size:9pt;padding:5pt 4pt">م</th>
    <th style="width:42pt;text-align:center;font-size:9pt;padding:5pt 4pt">الإيصال</th>
    <th style="font-size:9pt;padding:5pt 6pt">الحاج</th>
    <th style="width:60pt;text-align:center;font-size:9pt;padding:5pt 4pt">التاريخ</th>
    <th style="width:52pt;text-align:center;font-size:9pt;padding:5pt 4pt">طريقة الدفع</th>
    <th style="width:62pt;text-align:center;font-size:9pt;padding:5pt 4pt">المبلغ</th>
    <th style="font-size:9pt;padding:5pt 4pt">ملاحظات</th>
  </tr>`;
  const ROW_H = "21pt";
  const pages = [];
  for (let i = 0; i < sorted.length; i += PER_PAGE) {
    const chunk = sorted.slice(i, i + PER_PAGE);
    const isLast = i + PER_PAGE >= sorted.length;
    const rowsHtml = chunk.map((r, j) => {
      const idx = i + j;
      const strike = r.cancelled ? "text-decoration:line-through;color:#999" : "";
      return `<tr style="${idx % 2 === 1 ? "background:#f5f5f5" : ""}">
        <td style="height:${ROW_H};text-align:center;font-size:9pt;color:#777">${idx + 1}</td>
        <td style="height:${ROW_H};text-align:center;font-size:9pt;font-weight:700">${esc(r.receiptNo)}</td>
        <td style="height:${ROW_H};font-size:9.5pt;padding:0 6pt;${strike}">${esc(r.name)}${r.cancelled ? ` <span style="color:${PRINT_DANGER};font-weight:700;font-size:8pt">(ملغي)</span>` : ""}</td>
        <td style="height:${ROW_H};text-align:center;font-size:9pt">${esc(r.date)}</td>
        <td style="height:${ROW_H};text-align:center;font-size:9pt">${esc(r.method)}</td>
        <td style="height:${ROW_H};text-align:center;font-size:9.5pt;font-weight:700;${r.cancelled ? strike : `color:${PRINT_SUCCESS}`}">${fmtAmt(Number(r.amount))}</td>
        <td style="height:${ROW_H};font-size:8.5pt;padding:0 4pt;color:#666">${esc(r.notes || "—")}</td>
      </tr>`;
    }).join("");
    const totalRow = isLast
      ? `<tr style="background:${primaryColor};color:#fff;font-weight:700">
           <td colspan="5" style="height:${ROW_H};padding:0 6pt;font-size:10pt">الإجمالي (بلا الملغى)</td>
           <td style="height:${ROW_H};text-align:center;font-size:10pt">${fmtAmt(total)}</td>
           <td style="height:${ROW_H}"></td>
         </tr>`
      : "";
    pages.push(`${i === 0 ? periodLine : ""}<table style="width:100%;border-collapse:collapse;table-layout:fixed">${header}${rowsHtml}${totalRow}</table>`);
  }
  printInPage(makeFinanceHTML("تقرير الإيصالات والدفعات", joinSections(pages), brand, chrome));
}

export function printPackagesReport(passengers: Passenger[], pricing: PricingMap, brand: PrintBranding, chrome: PrintChrome = {}) {
  const { primaryColor } = safeBranding(brand);
  const rows=PRICING_KEYS.filter(k=>k.type==="package").map(pk=>{const count=passengers.filter(p=>!isSpecialPackage(p)&&getPackageKey(p.services.hotel_type)===pk.key).length;const price=pricing[pk.key]?.amount||0;return[esc(pk.label),String(count),fmtAmt(price),`<strong>${fmtAmt(count*price)}</strong>`];});
  const specialPassengers = passengers.filter(isSpecialPackage);
  if (specialPassengers.length>0) {
    const specialTotal = specialPassengers.reduce((s,p)=>s+(Number(p.services.custom_price)||0),0);
    rows.push([SPECIAL_PACKAGE_LABEL,String(specialPassengers.length),"—",`<strong>${fmtAmt(specialTotal)}</strong>`]);
  }
  /* الإجماليُّ يُجمَع من الصفوف المعروضة نفسها — لا مسارَ حسابٍ ثانٍ،
     ولا رقمَ في الورقة لا يُرى من أين جاء. */
  const pkgCount = rows.reduce((n,r)=>n+Number(r[1]),0);
  const pkgTotal = PRICING_KEYS.filter(k=>k.type==="package")
      .reduce((sum,pk)=>sum+passengers.filter(p=>!isSpecialPackage(p)&&getPackageKey(p.services.hotel_type)===pk.key).length*(pricing[pk.key]?.amount||0),0)
    + specialPassengers.reduce((sum,p)=>sum+(Number(p.services.custom_price)||0),0);
  printInPage(makeFinanceHTML("تقرير الباقات", printTable(["الباقة","عدد الحجاج","السعر الواحد","الإجمالي المستحق"], rows, primaryColor,
    ["الإجمالي", String(pkgCount), "—", fmtAmt(pkgTotal)]), brand, chrome));
}

export function printAddonsReport(passengers: Passenger[], pricing: PricingMap, brand: PrintBranding, chrome: PrintChrome = {}) {
  const { primaryColor } = safeBranding(brand);
  /* المصدر المشترك نفسه الذي يغذّي فلترَ الخدمات والشاشة — لا قائمةٌ ثالثة */
  const checks=SERVICE_FILTERS;
  const amounts=checks.map(a=>{const count=passengers.filter(a.check).length;const price=pricing[a.key]?.amount||0;const isDis=a.key==="discount_no_ticket";return{a,count,price,isDis,sum:count*price};});
  const rows=amounts.map(({a,count,price,isDis,sum})=>[esc(serviceLabel(a.key, pricing)),String(count),fmtAmt(price),isDis?`(${fmtAmt(sum)})`:fmtAmt(sum)]);
  /* صافي الإضافات: الإضافاتُ تُجمَع والخصمُ يُطرَح — كما في `calcTotalDue` */
  const addonNet=amounts.reduce((n,x)=>n+(x.isDis?-x.sum:x.sum),0);
  const addonCount=amounts.reduce((n,x)=>n+x.count,0);
  printInPage(makeFinanceHTML("ملخص الإضافات", printTable(["الإضافة / الخصم","عدد الحجاج","السعر الواحد","الإجمالي"], rows, primaryColor,
    ["الصافي", String(addonCount), "—", fmtAmt(addonNet)]), brand, chrome));
}
export function printCashflowReport(params: { dates: string[]; byDate: CashflowByDate; total: number; from: string; to: string; brand: PrintBranding; chrome?: PrintChrome }) {
  const { dates: cfDates, byDate: cfByDate, total: cfTotal, from: cashflowFrom, to: cashflowTo, brand } = params;
  const { primaryColor } = safeBranding(brand);
  const fromLabel = esc(cashflowFrom || "البداية");
  const toLabel   = esc(cashflowTo   || "اليوم");
  const rows = cfDates.map(d => {
    const row = cfByDate[d];
    const methodStr = Object.entries(row.methods).map(([m, v]) => `${esc(m)}: ${fmtAmt(v)}`).join(" | ");
    return `<tr><td>${esc(d)}</td><td style="text-align:center">${row.count}</td><td style="text-align:center;color:#2A9D8F;font-weight:700">${fmtAmt(row.total)}</td><td style="font-size:10pt;color:#555">${methodStr}</td></tr>`;
  }).join("");
  const totRow = `<tr class="tot-row" style="background:${primaryColor};color:#fff;font-weight:700"><td colspan="2">الإجمالي</td><td style="text-align:center">${fmtAmt(cfTotal)}</td><td></td></tr>`;
  const body = `<div style="margin-bottom:12pt;font-size:11pt;color:#555">الفترة: من <b>${fromLabel}</b> إلى <b>${toLabel}</b> · إجمالي التحصيل: <b style="color:${primaryColor}">${fmtAmt(cfTotal)} ر.ق</b></div><table><thead><tr><th>التاريخ</th><th style="text-align:center">عدد الدفعات</th><th style="text-align:center">الإجمالي</th><th>طرق الدفع</th></tr></thead><tbody>${rows}${totRow}</tbody></table>`;
  printInPage(makeFinanceHTML("ملخص التحصيل اليومي", body, brand, params.chrome ?? {}));
}
