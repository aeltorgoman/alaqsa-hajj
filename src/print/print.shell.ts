// ============================================================
// قشرةُ المستند — `<!DOCTYPE>` و`@page` والترويسةُ والتذييل
// ============================================================
/* القشرةُ الوحيدة لكلّ مطبوعٍ في النظام. و`makeHTML` هي القائمةُ نفسها
   منقولةً بحرفها — لا محرّكَ جديد ولا شكلَ جديد — و`makeFinanceHTML`
   انتقلت إليها من قشرتها الموازية بأنماطها كما هي.
   ⚠️ R1 ينقل المعماريّة ولا يُعيد تصميم مطبوعٍ قائم: النمطان معلَنان
   في `print.theme.ts`، وتوحيدُهما بصرياً قرارُ مرحلةٍ تالية. */
import type { PrintBranding } from "./print.brand";
import { escapeCompanyHtml, normalizeCompanyAssetUrl, normalizeCompanyColor, safeBranding, logoOrInitial, issuedStamp } from "./print.brand";
import { pageRule, PAGE_MARGIN_REPORT, PAGE_MARGIN_FINANCE, FONT_LINK, COLOR_ADJUST_RULE, COLOR_ADJUST_RULE_ALL, patternDataURL } from "./print.theme";

/* ═══ نمطُ التقرير العامّ ═══ */
export function makeHTML(
  title: string,
  body: string,
  branding: PrintBranding,
  options: { landscape?: boolean; noHeader?: boolean; patternOpacity?: number } = {}
) {
  const companyName = escapeCompanyHtml(branding.companyName);
  const tagline = escapeCompanyHtml(branding.tagline);
  const footerText = escapeCompanyHtml(branding.footerText);
  const primaryColor = normalizeCompanyColor(branding.primaryColor, "#1D9E75");
  const accentColor = normalizeCompanyColor(branding.accentColor, "#085041");
  const logoUrl = normalizeCompanyAssetUrl(branding.logoUrl);
  const headerUrl = normalizeCompanyAssetUrl(branding.headerUrl);
  const safeTitle = escapeCompanyHtml(title);
  const { landscape = false, noHeader = false, patternOpacity = 0.08 } = options;
  const initial = (companyName || "ح").trim().charAt(0);
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="logo" />`
    : `<span>${initial}</span>`;
  const now = new Date();
  const dateStr = now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  // نقشة إسلامية (Girih) متشابكة بخطوط ذهبية أوضح (حوالي 5 نقشات في الصف)
  // النقشة وإعدادُ الصفحة من `print.theme.ts` — مقياسٌ معلَنٌ لا نصٌّ مبعثر
  const patternURL = patternDataURL(patternOpacity);
  const headerHTML = noHeader ? "" : `${headerUrl ? `<img src="${headerUrl}" alt="" style="display:block;width:100%;max-height:28mm;object-fit:contain;margin-bottom:4mm" />` : ""}<div class="doc-header">
  <div class="brand">
    <div class="logo-box">${logoHtml}</div>
    <div>
      <div class="company-name">${companyName}</div>
      ${tagline ? `<div class="tagline">${tagline}</div>` : ""}
    </div>
  </div>
  <div class="meta">
    <div>تاريخ الإصدار: ${dateStr}</div>
    <div>الساعة: ${timeStr}</div>
  </div>
</div>
  <div class="doc-title-bar">${safeTitle}</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${safeTitle}</title>
${FONT_LINK}
<style>
  ${pageRule(PAGE_MARGIN_REPORT, landscape)}
  * { box-sizing: border-box; }
  html { background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  body { font-family: 'Tajawal', 'Arial', sans-serif; direction: rtl; margin: 0; padding: 0; font-size: 9pt; color: #1c1c1c; background-color: #ffffff; background-image: url("${patternURL}"); background-repeat: repeat; background-size: 140px 140px; }
  .doc-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 8px; border-bottom: 2pt solid ${primaryColor}; margin-bottom: 4px; }
  .doc-header .brand { display: flex; align-items: center; gap: 10px; }
  .doc-header .logo-box { width: 22mm; height: 22mm; border-radius: 4mm; overflow: hidden; display: flex; align-items: center; justify-content: center; background: ${primaryColor}; color: #fff; font-size: 16pt; font-weight: 700; flex-shrink: 0; }
  .doc-header .logo-box img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
  .doc-header .company-name { font-size: 13pt; font-weight: 700; color: ${primaryColor}; }
  .doc-header .tagline { font-size: 8pt; color: #888; margin-top: 2px; }
  .doc-header .meta { text-align: left; font-size: 7pt; color: #999; line-height: 1.7; }
  .doc-title-bar { background: linear-gradient(135deg, ${primaryColor}, ${accentColor}); color: #fff; text-align: center; padding: 5pt 0; border-radius: 8pt; font-size: 14pt; font-weight: 700; margin: 8pt 0 10pt; }
  .camp-header { display: flex; align-items: center; justify-content: space-between; gap: 10pt; margin-bottom: 10pt; }
  .camp-header .camp-logo { width: 30mm; height: 30mm; border-radius: 50%; border: 3pt solid ${primaryColor}; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #fff; flex-shrink: 0; }
  .camp-header .camp-logo img { width: 100%; height: 100%; object-fit: cover; }
  .camp-header .camp-logo span { font-size: 18pt; font-weight: 800; color: ${primaryColor}; }
  .camp-header .camp-title-box { flex: 1; text-align: center; }
  .camp-header .camp-title { display: inline-block; background: ${primaryColor}; color: #fff; padding: 6pt 20pt; border-radius: 5pt; font-size: 18pt; font-weight: 700; font-family: 'El Messiri', 'Tajawal', sans-serif; }
  .camp-header .camp-subtitle { font-size: 13pt; font-weight: 600; color: #a8852f; margin-top: 6pt; font-family: 'El Messiri', 'Tajawal', sans-serif; }
  .camp-table th { background: ${primaryColor}; color: #fff; }
  table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 8pt; border-radius: 6pt; overflow: hidden; }
  th { background: ${primaryColor}; color: #fff; padding: 5pt 7pt; text-align: right; font-size: 9pt; font-weight: 600; }
  td { border: 0.5pt solid rgba(0,0,0,0.12); padding: 5pt 7pt; text-align: right; background: transparent; font-size: 9pt; white-space: nowrap; }
  tr:nth-child(even) td { background: rgba(212,160,23,0.05); }
  .section-title { font-size: 10pt; font-weight: 700; color: ${primaryColor}; margin: 8pt 0 4pt; text-align: center; padding: 4pt; background: ${primaryColor}14; border-radius: 3pt; }
  .wide-table th, .wide-table td { font-size: 8pt; padding: 4pt 6pt; }
  .flight-table th, .flight-table td { font-size: 8pt; padding: 4pt 6pt; white-space: nowrap; }
  .ltr-table th, .ltr-table td { text-align: left; }
  .page-break { page-break-after: always; }
  .page-break-before { page-break-before: always; }
  .footer { text-align: center; color: #aaa; font-size: 7pt; margin-top: 10pt; border-top: 0.5pt solid #eee; padding-top: 5pt; }
  ${COLOR_ADJUST_RULE}
</style></head><body>
${headerHTML}
${body}
<div class="footer">${footerText || `${companyName}${tagline ? " — " + tagline : ""} · تقرير ${safeTitle}`}</div>
</body></html>`;
}

/* ═══ نمطُ المالية ═══
   كانت قشرةً موازيةً كاملة في `finance.print.ts` بـ`<!DOCTYPE>` و`@page`
   و`printInPage` خاصّةٍ بها. المُخرَج هو المُخرَج نفسه حرفياً. */
export function makeFinanceHTML(
  title: string, body: string, brand: PrintBranding
): string {
  const safeTitle = escapeCompanyHtml(title);
  const { logoUrl, companyName, tagline, primaryColor, accentColor } = safeBranding(brand);
  const { dateStr, timeStr } = issuedStamp();
  const logoHtml = logoOrInitial(logoUrl, companyName);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title>
<style>
  ${pageRule(PAGE_MARGIN_FINANCE)}
  * { box-sizing: border-box; }
  body { font-family:'Tajawal','Arial',sans-serif; direction:rtl; margin:0; padding:0; font-size:10pt; color:#1c1c1c; background:#fff; }
  .doc-header { display:flex; align-items:center; justify-content:space-between; padding-bottom:8pt; border-bottom:2pt solid ${primaryColor}; margin-bottom:6pt; }
  .logo-box { width:18mm; height:18mm; border-radius:3mm; overflow:hidden; display:flex; align-items:center; justify-content:center; background:${primaryColor}; color:#fff; font-size:14pt; font-weight:800; flex-shrink:0; }
  .logo-box img { width:100%; height:100%; object-fit:contain; background:#fff; }
  .company-name { font-size:13pt; font-weight:800; color:${primaryColor}; }
  .tagline { font-size:8pt; color:#888; margin-top:2pt; }
  .doc-title-bar { background:linear-gradient(135deg,${primaryColor},${accentColor}); color:#fff; text-align:center; padding:7pt; border-radius:5pt; font-size:13pt; font-weight:800; margin:8pt 0 10pt; }
  table { width:100%; border-collapse:collapse; margin-bottom:10pt; }
  th { background:${primaryColor}; color:#fff; padding:6pt 8pt; text-align:right; font-size:10pt; font-weight:700; }
  td { border:0.5pt solid #e0e0e0; padding:5pt 8pt; text-align:right; font-size:10pt; }
  tr:nth-child(even) td { background:#f9f7f4; }
  .footer { text-align:center; color:#bbb; font-size:7pt; margin-top:10pt; border-top:0.5pt solid #eee; padding-top:6pt; }
  ${COLOR_ADJUST_RULE_ALL}
</style></head><body>
<div class="doc-header">
  <div style="display:flex;align-items:center;gap:12px">
    <div class="logo-box">${logoHtml}</div>
    <div><div class="company-name">${companyName}</div>${tagline?`<div class="tagline">${tagline}</div>`:""}</div>
  </div>
  <div style="text-align:left;font-size:10px;color:#999;line-height:1.8">
    <div>تاريخ الإصدار: ${dateStr}</div><div>الساعة: ${timeStr}</div>
  </div>
</div>
<div class="doc-title-bar">${safeTitle}</div>
${body}
<div class="footer">${companyName}${tagline?" — "+tagline:""} · ${safeTitle}</div>
</body></html>`;
}

