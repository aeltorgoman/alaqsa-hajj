// ============================================================
// إنشاء صفحات HTML والطباعة للحسابات (بدون React ولا JSX)
// ============================================================
import type { Passenger } from "../../types";
import type { PricingMap, HotelPackagePrices, FinanceHotel, Payment, CustomCharge, FinancialGroup, FinanceRow, CashflowByDate, PaymentReceipt } from "./finance.types";
import { amountInArabicWords } from "./amountInWords";
import type { PrintBranding, PrintSeals, SealImage } from "../../print";
import { hasSeals, sealPlanHTML, sealGroupPlanHTML, sealPreloadHTML, sealSizeMm, bankBlockHTML,
         A5_SEAL_SCALE, STAMP_BOX_MM, SIGNATURE_BOX_MM } from "../../print";
import { fmtAmt, financeStatus, getPriceInfo, viewSurcharge, addonReportRows, packageLabel, requestedHotelName, packageReportRows, calcTotalDue, calcTotalPaid, paidFlightService } from "./finance.utils";
/* ⚠️ متغيّراتُ السمة (`var(--danger)` وأخواتُها) **لا تعمل في المطبوع**:
   إطارُ الطباعة مستندٌ مستقلٌّ لا يحمل أوراقَ أنماط التطبيق، فتسقط
   القيمةُ ويرث النصُّ لونَ أبيه — وقد يكون أبيضَ على أبيض. فألوانُ
   الأرقام في الطباعة قيمٌ صريحةٌ كبقيّة هذا الملفّ. */
const PRINT_DANGER  = "#C0392B";
const PRINT_SUCCESS = "#2A9D8F";
const balanceColor = (balance: number) => (balance > 0 ? PRINT_DANGER : PRINT_SUCCESS);
/* صفرُ الباقة الناتجُ عن نقص الإعداد يُقال في الورقة كما يُقال على الشاشة */
const zeroReason = (pi: { noHotel?: boolean; missingPrice?: boolean }) =>
  pi.noHotel ? ` <span style="color:${PRINT_DANGER}">(لا فندق مطلوب — السعر صفر)</span>`
  : pi.missingPrice ? ` <span style="color:${PRINT_DANGER}">(لا سعر لهذه الباقة في الفندق — صفر)</span>` : "";
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
import { normalizeCompanyAssetUrl } from "../../company/safety";

/** صورةُ data مشفّرةٌ base64 — كما يُخرجها قصُّ حشو الختم والتوقيع. */
const SEAL_DATA_URL = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;
export { makeFinanceHTML, printInPage };





// ============================================================
// HTML إيصال الدفعة — ٢١٠ × ١٧٠مم أعلى ورقة A4 طوليّة
// ============================================================
/* الإيصالُ يُطبَع من **صفِّ الإيصال** لا من سطرِ الدفع: الرقمُ الرسميُّ
   والإجماليُّ التاريخيُّ واسمُ الدافعِ واسمُ الموسمِ والتفاصيلُ كلُّها مجمَّدةٌ
   فيه، فإعادةُ الطباعةِ تُخرج الورقةَ نفسَها حتى بعد إزالةِ الحاجِّ أو حذفِ
   الموسمِ كلِّه. والملغى يُطبَع بنفسِ رقمِه وعليه «ملغي» وسببُه.

   ── الترتيب (من أعلى إلى أسفل، قسمٌ تحت قسم) ──
   ١ الرأس: الشعارُ واسمُ الحملة، «إيصال استلام مبلغ»، رقمُ الإيصال والتاريخُ والموسم
   ٢ الحاجّ: «استلمنا من /»
   ٣ المبلغُ المستلم: الرقمُ والمبلغُ كتابةً معاً (حتى سطرين)
   ٤ طريقةُ الدفع
   ٥ «تفاصيل الدفعة» بعرض الإيصال كلِّه — تحت المبلغ وطريقة الدفع لا بجانبهما
   ( توزيعُ دفعة المجموعة: حتى ٤ حجّاجٍ داخل الإيصال، وأكثرُ في ورقةٍ مرفقة )
   ٦ الختمُ (يميناً) والتوقيعُ (يساراً) في منطقةٍ محجوزةٍ أسفلَ الإيصال

   ── المقاس ──
   الورقةُ A4 طوليّة بلا هامش، والإيصالُ صندوقٌ ٢١٠ × ١٧٠مم في أعلاها. لا `@page`
   مخصَّص بمقاس الإيصال: الطابعةُ ذاتُ ورق A4 تُكبِّر الصفحةَ الصغيرة أو تُوسِّطها حسب
   برنامجها. والإيصالُ لا يطول لدفعة مجموعةٍ كبيرة: أكثرُ من ٤ حجّاجٍ يُنقل توزيعُهم
   كاملاً إلى ورقةٍ مرفقة (`@page receipt-alloc` بهامشٍ، والجدولُ يمتدّ أوراقاً
   ورأسُه يتكرّر). وإن جاوزت تفاصيلُ استثنائيّةٌ مكانَها طال الصندوقُ ولا يُقصّ
   شيءٌ — فإن جاوز الورقةَ تولّى `sealPlanHTML` الختمَ والتوقيعَ كما كان.

   ── الختمُ والتوقيع ──
   بمقاسهما كما كانا تماماً (`sealSizeMm(…, STAMP_BOX_MM / SIGNATURE_BOX_MM,
   A5_SEAL_SCALE)`)، بالترتيب نفسه (الختمُ يميناً والتوقيعُ يساراً)، ومصدرُهما كما
   كان. ولهما منطقةٌ محجوزةٌ بارتفاع أكبرِ صندوقَيهما، فلا يُصغَّران، وما فوقها هو
   الذي يتكيّف. ومع الورقة المرفقة يبقيان في خانتيهما في الإيصال (لا شريطَ هامش).

   «تفاصيلُ الدفعة» هي حقلُ `notes` في نموذج تسجيل الدفعة (`issue_payment_receipt`
   تجمّده في `payment_receipts.notes`) — بلا عمودٍ جديد. والمحصِّل لا يُطبَع (يبقى في
   القاعدة وسجلّ التدقيق). */
/** الذهبيّ الزخرفيّ — خطوطٌ ونجومٌ فقط؛ اللونُ الرئيسيّ من إعدادات الحملة. */
const RECEIPT_GOLD = "#B08D3C";
/** Full-size seal assets for the more legible receipt layout. */
const RECEIPT_SEAL_SCALE = 1;
/** أكثرُ عددٍ من الحجّاج يُطبع توزيعُه داخل الإيصال؛ وما زاد ففي الورقة المرفقة. */
export const RECEIPT_INLINE_ALLOC_MAX = 4;
/** مبلغُ الإيصال: الصحيحُ بلا كسور (10,000)، والكسرُ بقيمته الماليّة (125,750.50).
 *  محلّيٌّ للإيصال عمداً — `fmtAmt` المشتركة لا تُمسّ. */
export function receiptAmount(n: number): string {
  const v = Math.round(Number(n) * 100) / 100;
  const d = Number.isInteger(v) ? 0 : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
/** نجمةٌ ثمانيّة (مربّعان متراكبان) — زخرفةٌ إسلاميّةٌ خفيفة في زوايا الإطار. */
const STAR8 = (size: number, color: string) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="1.3">` +
  `<rect x="5" y="5" width="14" height="14"/><rect x="5" y="5" width="14" height="14" transform="rotate(45 12 12)"/>` +
  `<circle cx="12" cy="12" r="2.2" fill="${color}" stroke="none"/></g></svg>`;

export function makeReceiptHTML(
  receipt: PaymentReceipt, brand: PrintBranding, allocations: { name: string; amount: number }[] = [],
  options: { seals?: PrintSeals | null } = {},
): string {
  const { logoUrl, companyName, tagline, primaryColor, stampUrl, signatureUrl } = safeBranding(brand);
  const logoHtml = logoOrInitial(logoUrl, companyName);
  const receiptNo = String(receipt.receipt_number);
  const cancelled = receipt.status === "cancelled";
  const total = Number(receipt.total_amount);
  const isGroup = !!receipt.group_name;
  const ink = cancelled ? PRINT_DANGER : primaryColor;

  /* صندوقُ الختمِ/التوقيعِ — كما كان حرفاً: صورةٌ إن مُرِّرت، وإلا إطارٌ فارغٌ
     للختمِ والتوقيعِ باليد. والصورةُ الإلكترونيّةُ بمقاسِها الواقعيّ بالمليمتر
     (مقاسُ التقارير بنسبةِ A5: `A5_SEAL_SCALE`). */
  const assetBox = (url: string, label: string, img?: SealImage, box?: { w: number; h: number }) => {
    if (!url) return `<div class="stamp-box"><span style="color:#ccc;font-size:10px">${label}</span></div>`;
    const mm = img && box && img.url === url ? sealSizeMm(img, box, RECEIPT_SEAL_SCALE) : null;
    return mm
      ? `<div class="stamp-box has-img sized"><img src="${url}" alt="${label}" style="width:${mm.w}mm" /></div>`
      : `<div class="stamp-box has-img"><img src="${url}" alt="${label}" /></div>`;
  };

  const seals = hasSeals(options.seals) ? options.seals : null;
  /* ⚠️ صورتا الختم والتوقيع بعد قصّ حشوهما روابطُ `data:image/png`
     (`company/sealTrim.ts`)، و`safeBranding` لا يقبل إلا http(s) — فمصدرُ
     الصورة المطلوبة من `seals` نفسها: رابطٌ آمنٌ أو صورةُ data مشفّرةٌ base64 لا غير. */
  const sealSrc = (img: SealImage | undefined, fallback: string) => {
    const u = img?.url ?? "";
    return SEAL_DATA_URL.test(u) || normalizeCompanyAssetUrl(u) ? u : fallback;
  };
  const stampSrc = sealSrc(seals?.stamp, stampUrl), signatureSrc = sealSrc(seals?.signature, signatureUrl);
  /* المنطقةُ المحجوزة: ارتفاعُ أكبرِ الصندوقين بمقاس الإيصال — الختمُ ٤٠ × ٠٫٧٥ = ٣٠مم */
  const sealAreaMm = Math.max(STAMP_BOX_MM.h, SIGNATURE_BOX_MM.h) * RECEIPT_SEAL_SCALE;

  const groupAlloc = isGroup ? allocations : [];
  const appendix = groupAlloc.length > RECEIPT_INLINE_ALLOC_MAX;
  /* الإيصالُ ورقةٌ واحدة؛ والمخطِّطُ يعدّ أوراقَ المستند كلِّه — فمع الورقة المرفقة
     لا مخطِّط (كان سيظنّ الإيصالَ طويلاً فينقل الصورتين إلى شريط الهامش ويصغّرهما):
     الصورتان في خانتيهما، تُحمَّلان مسبقاً، ويُعلَن القرارُ لتنتظره الطباعة. */
  const sealPlan = !seals ? ""
    : appendix ? `${sealPreloadHTML(seals)}<script>document.documentElement.setAttribute("data-seal-plan","boxes:appendix");</script>`
    : sealPlanHTML(seals, { size: "A4", margin: "0", scale: RECEIPT_SEAL_SCALE,
        boxes: { img: ".stamp-box.sized img", multipageClass: "receipt-multipage" } });

  const allocInline = groupAlloc.length && !appendix
    ? `<div class="sec alloc"><div class="sec-k">توزيع المبلغ على الحجاج (${groupAlloc.length})</div><div class="alloc-grid">${
        groupAlloc.map(a => `<div class="alloc-i"><span class="n">${esc(a.name)}</span><b>${receiptAmount(Number(a.amount))}</b></div>`).join("")
      }</div></div>`
    : appendix
      ? `<div class="sec alloc alloc-ref"><span class="sec-k">توزيع المبلغ على الحجاج (${groupAlloc.length})</span><span class="ref">مرفقٌ بالورقة التالية — ملحق الإيصال رقم ${esc(receiptNo)}</span></div>`
      : "";
  const allocPage = appendix
    ? `<section class="alloc-page">
  <div class="ap-head">
    <div><div class="ap-title">ملحق إيصال استلام مبلغ رقم ${esc(receiptNo)} — توزيع المبلغ على الحجاج</div>
      <div class="ap-sub">${esc(companyName)} · ${esc(receipt.season_name)} · <span class="num">${esc(receipt.payment_date)}</span></div></div>
    <div class="ap-sum"><span>استلمنا من / <b>${esc(receipt.payer_name)}</b></span><span>الإجمالي: <b class="num">${receiptAmount(total)}</b> ريال قطري</span></div>
  </div>
  <table class="ap-table"><thead><tr><th class="c">م</th><th>الحاج</th><th class="c">النصيب (ر.ق)</th></tr></thead><tbody>${
    groupAlloc.map((a, i) => `<tr><td class="c">${i + 1}</td><td>${esc(a.name)}</td><td class="c num">${receiptAmount(Number(a.amount))}</td></tr>`).join("")
  }</tbody><tfoot><tr><td></td><td>الإجمالي (${groupAlloc.length} حاجّاً)</td><td class="c num">${receiptAmount(total)}</td></tr></tfoot></table>
</section>`
    : "";
  const details = (receipt.notes ?? "").trim();

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>إيصال استلام مبلغ ${esc(receiptNo)}</title>
<style>
  ${pageRule("0", false, "A4")}
  @page receipt-alloc { size: A4 portrait; margin: 12mm 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; background:#fff; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; color:#1f1f1f; }
  /* ٢١٠ × ١٧٠مم بالضبط — ولا يطول إلا لتفاصيل استثنائيّة لا تسعها (لا قصّ) */
  .sheet { width:210mm; min-height:180mm; padding:4mm 5mm; position:relative; display:flex; flex-direction:column; break-inside:auto; }
  .receipt { position:relative; flex:1; border:0.5mm solid ${ink}; border-radius:2.5mm; padding:1.8mm;
             background:#fff; display:flex; flex-direction:column; }
  /* الفراغُ الزائد يتوزّع بين الأقسام بالتساوي — لا كتلةً واحدةً فوق الختم */
  .frame { flex:1; border:0.25mm solid ${RECEIPT_GOLD}; border-radius:1.6mm; padding:3mm 4mm 2.8mm; display:flex; flex-direction:column; justify-content:space-between; gap:1.7mm; position:relative; }
  .corner { position:absolute; line-height:0; opacity:.55; }
  .corner.tr { top:1mm; right:1mm; } .corner.tl { top:1mm; left:1mm; }
  .corner.br { bottom:1mm; right:1mm; } .corner.bl { bottom:1mm; left:1mm; }

  .head { display:grid; grid-template-columns:1.2fr auto 1.2fr; align-items:center; gap:2mm; padding-bottom:2.2mm; border-bottom:0.35mm solid ${RECEIPT_GOLD}; }
  .brand { display:flex; align-items:center; gap:2.6mm; min-width:0; }
  .logo-box { width:23mm; height:23mm; border-radius:2mm; overflow:hidden; display:flex; align-items:center; justify-content:center;
              background:${ink}; color:#fff; font-size:18px; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .company { font-size:19px; font-weight:800; color:${ink}; line-height:1.25; }
  .tagline { font-size:12px; color:#7a7a7a; margin-top:0.6mm; }
  .title { text-align:center; }
  .title h1 { margin:0; padding:2mm 4mm; font-size:25px; font-weight:900; color:#fff; background:${ink}; border:0.55mm solid ${RECEIPT_GOLD}; border-radius:3mm; letter-spacing:.2px; white-space:nowrap; }
  .title .rule { display:flex; align-items:center; justify-content:center; gap:1.6mm; margin-top:1mm; }
  .title .rule i { display:block; width:14mm; height:0.3mm; background:${RECEIPT_GOLD}; }
  .meta { justify-self:end; display:grid; grid-template-columns:auto auto; gap:0.8mm 2.8mm; font-size:12.5px; align-items:baseline; }
  .meta .k { color:#8a7a5a; text-align:start; white-space:nowrap; }
  .meta .v { font-weight:700; color:#1f1f1f; white-space:nowrap; direction:ltr; text-align:end; unicode-bidi:isolate; }
  .meta .v.no { font-size:20px; font-weight:900; color:${ink}; }
  .meta .v.season { direction:rtl; text-align:start; }

  .sec-k { font-size:11px; font-weight:800; color:#8a7a5a; white-space:nowrap; }
  .payer { display:flex; align-items:baseline; gap:2.5mm; padding-bottom:1.6mm; border-bottom:0.25mm dashed #d9cdb3; }
  .payer .sec-k { font-size:15px; font-weight:400; }
  .payer .v { font-size:22px; font-weight:800; color:#1f1f1f; line-height:1.35; overflow-wrap:anywhere; }
  .payer .tag { font-size:11px; font-weight:700; color:${ink}; white-space:nowrap; }

  .amount { border:0.4mm solid ${ink}; border-radius:2mm; background:#fff; padding:2.6mm 4mm; }
  .amount .num { display:flex; align-items:baseline; gap:3mm; }
  .amount .num .sec-k { font-size:15px; }
  .amount .num b { font-size:34px; font-weight:900; color:${ink}; direction:ltr; unicode-bidi:isolate; line-height:1.15; }
  .amount .num .cur { font-size:12px; font-weight:700; color:#6b6b6b; }
  .amount .words { margin-top:1.6mm; padding-top:1.6mm; border-top:0.25mm dashed #d9cdb3; font-size:17px; font-weight:700; color:#333;
                   line-height:1.5; overflow-wrap:anywhere; }
  .amount .words .sec-k { display:inline; margin-inline-end:1.8mm; font-size:13px; }

  .method { display:flex; align-items:center; gap:2.4mm; }
  .method .sec-k { font-size:14px; }
  .method .v { font-size:14px; font-weight:800; color:${ink}; border:0.25mm solid ${RECEIPT_GOLD}; border-radius:5mm; padding:0.6mm 3.6mm; background:#fff; }

  .details { border:0.25mm solid #e3d7bd; border-radius:2mm; background:#fff; padding:2mm 3.5mm 2.2mm; }
  .details .sec-k { color:${ink}; margin-bottom:0.6mm; font-size:14px; }
  /* ثلاثةُ أسطرٍ محجوزة (والإيصال يطول إن زاد النصُّ عن مكانه استثناءً — لا قصّ) */
  .details .v { font-size:13px; color:#333; line-height:1.5; min-height:calc(13px * 1.5 * 2); white-space:pre-line; overflow-wrap:anywhere;
                unicode-bidi:plaintext; text-align:start; }
  .details .v.empty { color:#b5b5b5; }

  .alloc .sec-k { color:${ink}; margin-bottom:0.8mm; }
  .alloc-grid { display:grid; grid-template-columns:1fr 1fr; gap:0.6mm 6mm; font-size:11px; }
  .alloc-i { display:flex; justify-content:space-between; gap:2mm; border-bottom:0.25mm solid #eee5d2; padding:0.3mm 0; min-width:0; }
  .alloc-i .n { overflow-wrap:anywhere; min-width:0; }
  .alloc-i b { direction:ltr; unicode-bidi:isolate; white-space:nowrap; font-weight:800; }
  .alloc-ref { display:flex; align-items:baseline; gap:2.4mm; font-size:11px; }
  .alloc-ref .sec-k { margin:0; }
  .alloc-ref .ref { color:#555; font-weight:700; }

  .cancel-note { border:0.35mm solid ${PRINT_DANGER}; background:#fdeaea; color:${PRINT_DANGER}; border-radius:1.6mm; padding:1.2mm 2.6mm; font-size:10.5px; font-weight:700; }
  .watermark { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:3; }
  .watermark span { font-size:68px; font-weight:900; color:${PRINT_DANGER}; opacity:.16; transform:rotate(-18deg); letter-spacing:8px; }

  /* المنطقةُ المحجوزة للختم والتوقيع — بارتفاع أكبرِ صندوقيهما، لا تُضغط */
  .receipt-footer { display:grid; grid-template-columns:1fr 1fr; gap:10mm; padding-top:1.4mm; border-top:0.25mm dashed #d9cdb3; break-inside:avoid; }
  .stamp-area { text-align:center; display:flex; flex-direction:column; align-items:center; }
  .stamp-label { font-size:14px; color:#8a7a5a; margin-bottom:0.8mm; }
  .stamp-box { width:100%; min-height:${sealAreaMm}mm; border:0.25mm dashed #d0c4a8; border-radius:2mm; display:flex; align-items:center; justify-content:center; overflow:hidden; padding:0.8mm; }
  .stamp-box img { max-width:100%; max-height:${sealAreaMm}mm; object-fit:contain; }
  .stamp-box.has-img { border-color:transparent; padding:0; }
  .stamp-box.sized { overflow:visible; }
  .stamp-box.sized img { max-width:100%; height:auto; max-height:none; }
  .receipt-multipage .stamp-area.e-sealed { display:none; }

  /* الورقةُ المرفقة: توزيعُ دفعة مجموعةٍ تزيد على ${RECEIPT_INLINE_ALLOC_MAX} حجّاج — كاملاً، بلا قصّ */
  .alloc-page { page:receipt-alloc; break-before:page; width:210mm; padding:0 12mm; }
  .ap-head { border:0.4mm solid ${primaryColor}; border-radius:2mm; padding:2.4mm 4mm; margin-bottom:3mm; background:#FFFDF8; }
  .ap-title { font-size:13px; font-weight:800; color:${primaryColor}; }
  .ap-sub { font-size:10px; color:#8a7a5a; margin-top:0.6mm; }
  .ap-sum { display:flex; justify-content:space-between; gap:4mm; margin-top:1.6mm; padding-top:1.4mm; border-top:0.25mm dashed #d9cdb3; font-size:11px; }
  .ap-table { width:100%; border-collapse:collapse; font-size:10.5px; }
  .ap-table thead { display:table-header-group; }
  .ap-table th { background:${primaryColor}; color:#fff; padding:1.2mm 2.4mm; font-weight:700; text-align:start; }
  .ap-table td { border-bottom:0.25mm solid #e6e0d2; padding:1mm 2.4mm; }
  .ap-table tr { break-inside:avoid; }
  .ap-table .c { text-align:center; }
  .ap-table tfoot td { font-weight:800; border-top:0.4mm solid ${primaryColor}; border-bottom:none; }
  .num { direction:ltr; unicode-bidi:isolate; }
  ${COLOR_ADJUST_RULE_ALL}
</style></head><body>
<div class="sheet"><div class="receipt">
  ${cancelled ? `<div class="watermark"><span>ملغي</span></div>` : ""}
  <div class="frame">
    <span class="corner tr">${STAR8(11, RECEIPT_GOLD)}</span><span class="corner tl">${STAR8(11, RECEIPT_GOLD)}</span>
    <span class="corner br">${STAR8(11, RECEIPT_GOLD)}</span><span class="corner bl">${STAR8(11, RECEIPT_GOLD)}</span>
    <div class="head">
      <div class="brand">
        <div class="logo-box">${logoHtml}</div>
        <div><div class="company">${esc(companyName)}</div>${tagline ? `<div class="tagline">${esc(tagline)}</div>` : ""}</div>
      </div>
      <div class="title">
        <h1>إيصال استلام مبلغ${cancelled ? " — ملغي" : ""}</h1>
        <div class="rule"><i></i>${STAR8(9, RECEIPT_GOLD)}<i></i></div>
      </div>
      <div class="meta">
        <span class="k">رقم الإيصال</span><span class="v no">${esc(receiptNo)}</span>
        <span class="k">التاريخ</span><span class="v">${esc(receipt.payment_date)}</span>
        <span class="k">الموسم</span><span class="v season">${esc(receipt.season_name)}</span>
      </div>
    </div>
    <div class="sec payer"><span class="sec-k">استلمنا من /</span><span class="v">${esc(receipt.payer_name)}</span>${isGroup ? `<span class="tag">— دفعة مجموعة</span>` : ""}</div>
    ${cancelled ? `<div class="cancel-note">هذا الإيصال ملغي${receipt.cancel_reason ? ` — السبب: ${esc(receipt.cancel_reason)}` : ""}</div>` : ""}
    <div class="sec amount">
      <div class="num"><span class="sec-k">المبلغ المستلم</span><b>${receiptAmount(total)}</b><span class="cur">ريال قطري · QAR</span></div>
      <div class="words"><span class="sec-k">المبلغ كتابةً:</span>${esc(amountInArabicWords(total))}</div>
    </div>
    <div class="sec method"><span class="sec-k">طريقة الدفع:</span><span class="v">${esc(receipt.method)}</span></div>
    <div class="sec details"><div class="sec-k">تفاصيل الدفعة</div>${details
      ? `<div class="v" dir="auto">${esc(details)}</div>` : `<div class="v empty">—</div>`}</div>
    ${allocInline}
    <div class="receipt-footer">
      <div class="stamp-area${seals?.stamp && stampSrc ? " e-sealed" : ""}">
        <div class="stamp-label">ختم الشركة</div>
        ${assetBox(stampSrc, "الختم", seals?.stamp, STAMP_BOX_MM)}
      </div>
      <div class="stamp-area${seals?.signature && signatureSrc ? " e-sealed" : ""}">
        <div class="stamp-label">توقيع المسؤول</div>
        ${assetBox(signatureSrc, "التوقيع", seals?.signature, SIGNATURE_BOX_MM)}
      </div>
    </div>
  </div>
</div></div>${allocPage}${sealPlan}
</body></html>`;
}


// ============================================================
// كشف حساب الحاج الفردي - تصميم كبير للطباعة
// ============================================================
export function makePassengerStatementHTML(
  p: Passenger, pricing: PricingMap, hotelPrices: HotelPackagePrices, hotels: FinanceHotel[], customCharges: CustomCharge[], payments: Payment[], brand: PrintBranding,
  /* خياراتُ «كشف الحساب» (`PRINT_SPECS.statement`) — كلُّها مطفأةٌ افتراضاً،
     والمطفأُ لا يُحقَن منه شيء: الكشفُ كما كان بالحرف. */
  chrome: PrintChrome = {},
): string {
  const { logoUrl, companyName, tagline, primaryColor, accentColor } = safeBranding(brand);
  const s = p.services;
  const priceInfo = getPriceInfo(p, pricing, hotelPrices);
  /* الفندقُ المطلوب أساسُ سعر الباقة — يُكتب بجانبها (إلا «خاص» فسعرُه يدويّ) */
  const reqHotel = s.hotel_type === "خاص" ? null : requestedHotelName(p, hotels);
  const pkgLine = `${esc(priceInfo.label)}${reqHotel ? ` — ${esc(reqHotel)}` : ""}${zeroReason(priceInfo)}`;
  const pkgAmt = priceInfo.amount;
  const pCustom   = customCharges.filter(c => c.passenger_id === p.id);
  const pPayments = [...payments.filter(py => py.passenger_id === p.id)].sort((a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
  const sealsOn = hasSeals(chrome.seals);
  const bankHTML = bankBlockHTML(chrome.bank, primaryColor);
  const totalDue  = calcTotalDue(p, pricing, hotelPrices, customCharges);
  const totalPaid = calcTotalPaid(p.id, payments);
  const balance   = totalDue - totalPaid;
  const logoHtml  = logoOrInitial(logoUrl, companyName);
  const { dateStr } = issuedStamp();

  /* الدرجة التجاريّة من الخدمة المطلوبة لا من حالة الحجز — نفس مصدر `calcTotalDue` */
  const flightPaid = paidFlightService(p);

  let rows = `<tr><td class="bayan">${pkgLine}</td><td class="debit">${fmtAmt(pkgAmt)}</td><td class="credit">—</td></tr>`;
  if (s.hotel_view==="مطلة") rows+=`<tr class="alt"><td class="bayan">إضافة مطلة</td><td class="debit">${fmtAmt(viewSurcharge(p, hotelPrices))}</td><td class="credit">—</td></tr>`;
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
${bankHTML}<div class="footer">${esc(companyName)}${tagline?" — "+esc(tagline):""} · كشف حساب</div>${sealsOn ? sealGroupPlanHTML(chrome.seals, { margin: "14mm 12mm" }) : ""}
</body></html>`;
}

// ============================================================
// كشف حساب المجموعة المالية
// ============================================================
export function makeGroupStatementHTML(
  group: FinancialGroup, gPassengers: Passenger[], pricing: PricingMap, hotelPrices: HotelPackagePrices, hotels: FinanceHotel[],
  customCharges: CustomCharge[], payments: Payment[], brand: PrintBranding
): string {
  const { logoUrl, companyName, tagline, primaryColor, accentColor } = safeBranding(brand);
  const logoHtml  = logoOrInitial(logoUrl, companyName);
  const { dateStr } = issuedStamp();
  const gTotDue  = gPassengers.reduce((s,p) => s+calcTotalDue(p,pricing,hotelPrices,customCharges), 0);
  const gTotPaid = gPassengers.reduce((s,p) => s+calcTotalPaid(p.id,payments), 0);
  const gTotBal  = gTotDue - gTotPaid;

  const memberRows = gPassengers.map((p, i) => {
    const due  = calcTotalDue(p,pricing,hotelPrices,customCharges);
    const paid = calcTotalPaid(p.id,payments);
    const bal  = due - paid;
    const pPays = [...payments.filter(py=>py.passenger_id===p.id)].sort((a,b)=>new Date(a.payment_date).getTime()-new Date(b.payment_date).getTime());
    const priceInfo = getPriceInfo(p, pricing, hotelPrices);
    const reqHotel = p.services.hotel_type === "خاص" ? null : requestedHotelName(p, hotels);
    const pkgLine = `${esc(priceInfo.label)}${reqHotel ? ` — ${esc(reqHotel)}` : ""}${zeroReason(priceInfo)}`;
    const payRows = pPays.map(py => `<tr style="background:#f0faf8"><td style="padding:8px 16px;border:1px solid #e8e8e8;font-size:13px;padding-right:32px">دفعة — ${esc(py.payment_date)} <span style="color:#888;font-size:12px">(${esc(py.method)})</span>${py.notes?` — ${esc(py.notes)}`:""}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#888;font-size:13px">—</td><td style="text-align:center;border:1px solid #e8e8e8;color:#2A9D8F;font-weight:700;font-size:14px">${fmtAmt(py.amount)}</td></tr>`).join("");
    return `
    <div style="margin-bottom:20px;border:1.5px solid ${primaryColor}30;border-radius:10px;overflow:hidden;">
      <div style="background:${primaryColor}12;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid ${primaryColor}20">
        <div style="font-size:17px;font-weight:800;color:${primaryColor}">${i+1}. ${esc(p.short_ar||p.name_ar)}</div>
        <div style="font-size:13px;color:#666">${pkgLine}</div>
        <div style="display:flex;gap:16px;font-size:13px">
          <span>مطلوب: <strong style="color:${primaryColor}">${fmtAmt(due)}</strong></span>
          <span>مدفوع: <strong style="color:#2A9D8F">${fmtAmt(paid)}</strong></span>
          <span>متبقي: <strong style="color:${balanceColor(bal)}">${fmtAmt(bal)}</strong></span>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:${primaryColor}08"><td style="padding:8px 16px;border:1px solid #e8e8e8;font-size:14px">${pkgLine}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#C0392B;font-weight:700;font-size:14px;width:130px">${fmtAmt(priceInfo.amount)}</td><td style="text-align:center;border:1px solid #e8e8e8;color:#888;width:130px">—</td></tr>
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
        <td style="font-size:9pt;padding:0 4pt;height:${ROW_H};color:#555">${esc(packageLabel(r.p, pricing).replace("باقة ",""))}</td>
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

export function printPackagesReport(passengers: Passenger[], pricing: PricingMap, hotelPrices: HotelPackagePrices, hotels: FinanceHotel[], brand: PrintBranding, chrome: PrintChrome = {}) {
  const { primaryColor } = safeBranding(brand);
  /* الصفوفُ من `packageReportRows` — المصدرُ نفسُه للشاشة: صفٌّ لكلّ باقةٍ
     في كلّ فندقٍ مطلوب. والإجماليُّ يُجمَع من الصفوف المعروضة نفسها. */
  const data = packageReportRows(passengers, pricing, hotelPrices, hotels);
  const rows = data.map(r => [esc(r.label), String(r.count), r.price == null ? "—" : fmtAmt(r.price), `<strong>${fmtAmt(r.total)}</strong>`]);
  const pkgCount = data.reduce((n, r) => n + r.count, 0);
  const pkgTotal = data.reduce((n, r) => n + r.total, 0);
  printInPage(makeFinanceHTML("تقرير الباقات", printTable(["الباقة · الفندق المطلوب","عدد الحجاج","السعر الواحد","الإجمالي المستحق"], rows, primaryColor,
    ["الإجمالي", String(pkgCount), "—", fmtAmt(pkgTotal)]), brand, chrome));
}

export function printAddonsReport(passengers: Passenger[], pricing: PricingMap, hotelPrices: HotelPackagePrices, hotels: FinanceHotel[], brand: PrintBranding, chrome: PrintChrome = {}) {
  const { primaryColor } = safeBranding(brand);
  /* `addonReportRows` — المصدرُ نفسُه للشاشة: الإطلالةُ صفٌّ لكلّ فندقٍ مطلوب برسمه */
  const data = addonReportRows(passengers, pricing, hotelPrices, hotels);
  const rows = data.map(r => [esc(r.label), String(r.count), fmtAmt(r.price), r.isDiscount ? `(${fmtAmt(r.total)})` : fmtAmt(r.total)]);
  /* صافي الإضافات: الإضافاتُ تُجمَع والخصمُ يُطرَح — كما في `calcTotalDue` */
  const addonNet = data.reduce((n, r) => n + (r.isDiscount ? -r.total : r.total), 0);
  const addonCount = data.reduce((n, r) => n + r.count, 0);
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
