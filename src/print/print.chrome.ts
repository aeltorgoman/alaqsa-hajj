// ============================================================
// قشرةُ المطبوع — ما يحيط بالجسم، لا الجسمُ نفسه
// ============================================================
/* R1 وحّد **القشرة والمصدر**، وترك لكلّ تقريرٍ جسمَه. وR2 يزيد على
   ذلك أن ما يحيط بالجسم صار **قدرةً معلَنة** لا نصّاً مبعثراً: أيّ
   ترويسةٍ تُختار، وهل يُذكَر الموسم، وهل تُختَم ساعةُ الإصدار، وهل
   تُرقَّم الصفحات، وهل يُكتَب نطاقُ الفرز.

   ⚠️ والقاعدةُ التي تحكم هذا الملفّ كلَّه: **القدرةُ ليست فرضاً.**
   كلُّ حقلٍ هنا اختياريّ، وكلُّ افتراضٍ هو سلوكُ ما قبل R2 حرفياً.
   فمن لم يطلب شيئاً خرجت ورقتُه كما كانت بالحرف — ولذلك وُضع
   `header` وحده بافتراضٍ غيرِ فارغ، لأنّه السلوكُ القائم أصلاً.
   ولا تُضاف خيارةٌ إلى تقريرٍ لأنّ أخاه أخذها: منى وعرفة والمستنداتُ
   والباصُ تبقى على مظهرها المعتمَد ما لم يُطلَب خلافُه صراحةً. */
import type { PrintBranding } from "./print.brand";
import { escapeCompanyHtml, safeBranding, logoOrInitial, issuedStamp } from "./print.brand";

/** نمطُ الترويسة — كاملةٌ، أو مضغوطةٌ تحفظ الهويّة وتوفّر الورق، أو لا شيء. */
export type HeaderMode = "full" | "compact" | "none";

/** الموسم كما تحتاجه الطباعة — `closed_at` وحدها تفصل المؤرشَف عن الجاري. */
export type PrintSeason = { name: string; closed_at?: string | null } | null | undefined;

export type PrintChrome = {
  /** الافتراض `"full"` — وهو سلوكُ `makeHTML` قبل R2. */
  header?: HeaderMode;
  /** الموسم — يُذكَر إن أُعطي، ولا يُختلَق. */
  season?: PrintSeason;
  /** ختمُ تاريخ الإصدار وساعته — **اختياريّ**، ولا يُفرَض على تقرير. */
  issuedAt?: boolean;
  /** وصفٌ مُوجَز للفرز أو النطاق — حيث يضيف معنًى فقط. */
  scope?: string | null;
  /** عدُّ النتائج — «٢٢ حاجّاً» ونحوه. */
  resultCount?: { label: string; value: number } | null;
  /** ترقيمُ الصفحات — لا يُدعَم إلا لمستندٍ مقسَّمٍ ببنائه (انظر أدناه). */
  pageNumbers?: boolean;
};

/* ═══ الموسم ═══ */
/** تسميةُ الموسم المعتمَدة — ومنها وحدها يُعرَف المؤرشَف من الجاري.
 *
 *  «موسم حج ١٤٤٧هـ» للجاري، و«… — موسم مؤرشف» للمقفَل. ولا صيغةَ
 *  ثانية في النظام: من احتاج اسمَ موسمٍ على ورقةٍ نادى هذه الدالّة. */
export function seasonLabel(season: PrintSeason): string {
  if (!season || !season.name) return "";
  const base = `موسم حج ${season.name}`;
  return season.closed_at ? `${base} — موسم مؤرشف` : base;
}

/* ═══ الترويسة ═══ */
/** ترويسةُ المطبوع بحسب نمطها — والنمطُ `"full"` يُبنى في القشرة
 *  نفسها لأنّه يحتاج `headerUrl` ونقشتَها، فلا يُكرَّر هنا. */
export function compactHeaderHTML(b: PrintBranding, title: string): string {
  const { companyName, tagline, logoUrl } = safeBranding(b);
  const logoHtml = logoOrInitial(logoUrl, companyName);
  return `<div class="doc-header doc-header-compact">
  <div class="brand">
    <div class="logo-box">${logoHtml}</div>
    <div>
      <div class="company-name">${companyName}</div>
      ${tagline ? `<div class="tagline">${tagline}</div>` : ""}
    </div>
  </div>
</div>
  <div class="doc-title-bar">${escapeCompanyHtml(title)}</div>`;
}

/* ═══ سطرُ البيانات المرافقة ═══ */
/** الموسمُ والنطاقُ والعدُّ وختمُ الإصدار — كلٌّ يظهر إن طُلب وحده.
 *  ويُعاد نصّاً فارغاً إن لم يُطلب شيء، فلا يترك أثراً في الورقة. */
export function chromeMetaHTML(chrome: PrintChrome = {}): string {
  const parts: string[] = [];
  const season = seasonLabel(chrome.season);
  if (season) {
    const archived = !!(chrome.season && chrome.season.closed_at);
    parts.push(`<span class="meta-season${archived ? " meta-archived" : ""}">${escapeCompanyHtml(season)}</span>`);
  }
  if (chrome.resultCount) {
    parts.push(`<span>${escapeCompanyHtml(chrome.resultCount.label)}: <strong>${chrome.resultCount.value}</strong></span>`);
  }
  if (chrome.scope) parts.push(`<span>${escapeCompanyHtml(chrome.scope)}</span>`);
  if (chrome.issuedAt) {
    const { dateStr, timeStr } = issuedStamp();
    parts.push(`<span>تاريخ الإصدار: ${dateStr} — ${timeStr}</span>`);
  }
  if (parts.length === 0) return "";
  return `<div class="doc-meta">${parts.join(`<span class="meta-sep">·</span>`)}</div>`;
}

/* ═══ ترقيمُ الصفحات ═══ */
/* ⚠️ حدٌّ تقنيّ يُكتب صريحاً لئلّا يُوعَد بما لا يُنجَز: المتصفّحات
   المبنيّة على Chromium لا تنفّذ `counter(page)` في `content` ولا
   صناديقَ هوامش `@page`. فلا سبيل إلى ترقيمٍ صحيحٍ لمستندٍ متدفّقٍ
   إلا بقياسٍ في JavaScript — وذاك هشٌّ ويكذب عند أوّل اختلافِ خطّ.

   فالترقيمُ هنا مقصورٌ على المستند **المقسَّم ببنائه**: الذي يُبنى
   أصلاً مصفوفةَ صفحاتٍ أو أقسامٍ يعرف الباني عددَها (الفندق،
   المستندات، الباصات والمخيّمات والرحلات عبر `joinSections`، وصفحاتُ
   المالية). هناك الرقمُ محسوبٌ لا مُقاس، فهو صادقٌ دائماً.
   وما كان متدفّقاً (كشف الحجاج، كشف الطيران) لا تُعرَض عليه القدرة. */
export function pageStampHTML(index: number, total: number): string {
  return `<div class="page-stamp">صفحة ${index} من ${total}</div>`;
}

/** أنماطُ ما تضيفه هذه الوحدة — تُحقَن في القشرة مرّةً واحدة. */
export const CHROME_CSS = `
  .doc-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4pt; justify-content: center;
              font-size: 7.5pt; color: #777; margin: 0 0 6pt; }
  .doc-meta .meta-sep { color: #ccc; }
  .doc-meta .meta-season { font-weight: 700; color: #555; }
  .doc-meta .meta-archived { color: #8a6a10; }
  .page-stamp { text-align: center; font-size: 7pt; color: #aaa; margin-top: 4pt; }
  .doc-header-compact .logo-box { width: 14mm; height: 14mm; font-size: 11pt; }
  .doc-header-compact .company-name { font-size: 10pt; }
  .doc-header-compact .tagline { font-size: 6.5pt; }
  .doc-header-compact { padding-bottom: 4px; margin-bottom: 2px; }
  .doc-header-compact + .doc-title-bar { padding: 3pt 0; margin: 4pt 0 6pt; font-size: 11pt; }`;
