// ============================================================
// هويّةُ الطباعة — التطبيعُ والتهريبُ في موضعٍ واحد
// ============================================================
/* كلُّ ما يدخل صفحةَ طباعةٍ من إعداد الشركة يمرّ من هنا: اللون والأصل
   والنصّ. وكانت المالية تكرّره في `safePrintBrand` الخاصّة بها، والقشرةُ
   العامّة تنادي دوالَّ السلامة الثلاث مبعثرةً — فصار نداءً واحداً. */
import { escapeCompanyHtml, normalizeCompanyAssetUrl, normalizeCompanyColor } from "../company/safety";

export { escapeCompanyHtml, normalizeCompanyAssetUrl, normalizeCompanyColor };
/** تهريبُ HTML — الاسمُ القصير الذي تستعمله منتجاتُ المالية. */
export const esc = escapeCompanyHtml;

/* هويّةُ الطباعة كما تحتاجها القشرة — مجموعةٌ فرعيّةٌ من
   `ReportBranding`، فتقبلها كما هي وتقبل هويّةَ المالية كذلك. */
export type PrintBranding = {
  logoUrl?: string | null;
  headerUrl?: string | null;
  companyName?: string | null;
  tagline?: string | null;
  footerText?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
};

export type SafeBranding = {
  companyName: string; tagline: string; footerText: string;
  primaryColor: string; accentColor: string;
  logoUrl: string; headerUrl: string;
};

/** تطبيعُ الهويّة مرّةً واحدة. */
export function safeBranding(b: PrintBranding): SafeBranding {
  return {
    companyName:  escapeCompanyHtml(b.companyName),
    tagline:      escapeCompanyHtml(b.tagline),
    footerText:   escapeCompanyHtml(b.footerText),
    primaryColor: normalizeCompanyColor(b.primaryColor, "#1D9E75"),
    accentColor:  normalizeCompanyColor(b.accentColor, "#085041"),
    logoUrl:      normalizeCompanyAssetUrl(b.logoUrl) || "",
    headerUrl:    normalizeCompanyAssetUrl(b.headerUrl) || "",
  };
}

/** شعارٌ أو حرفٌ أوّل — النمطُ المتكرّر في كل ترويسة. */
export function logoOrInitial(logoUrl: string, companyName: string): string {
  return logoUrl ? `<img src="${logoUrl}" alt="logo" />` : `<span>${(companyName || "ح").trim().charAt(0)}</span>`;
}

/** تاريخُ الإصدار وساعتُه بالصيغة المعتمَدة في كل المطبوعات. */
export function issuedStamp(): { dateStr: string; timeStr: string } {
  const now = new Date();
  return {
    dateStr: now.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" }),
    timeStr: now.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" }),
  };
}
