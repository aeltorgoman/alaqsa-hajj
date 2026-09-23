// ============================================================
// الحدُّ المشترك للطباعة — كلُّ مطبوعٍ يدخل من هنا
// ============================================================
/* بعد R1 لا قشرةَ ثانية ولا `printInPage` ثانية ولا تهريبَ ثانٍ ولا
   تهيئةَ كشفٍ ثانية. وما بقي خاصّاً بتقريره (كروتُ الفندق ومطبوعاتُ
   الشنط وصورُ المستندات وإيصالُ الدفعة) يبقى جسماً خاصّاً داخل قشرةٍ
   مشتركة، لا قشرةً موازية. */
export type { PrintBranding, SafeBranding } from "./print.brand";
export { esc, escapeCompanyHtml, normalizeCompanyAssetUrl, normalizeCompanyColor,
         safeBranding, logoOrInitial, issuedStamp } from "./print.brand";
export type { PageSize } from "./print.theme";
export { pageRule, PAGE_MARGIN_REPORT, PAGE_MARGIN_FINANCE, FONT_LINK,
         COLOR_ADJUST_RULE, COLOR_ADJUST_RULE_ALL, patternSVG, patternDataURL } from "./print.theme";
export { makeHTML, makeFinanceHTML } from "./print.shell";
export type { PrintChrome, HeaderMode, PrintSeason } from "./print.chrome";
export type { PrintOptionKey, PrintOptionsState, PrintOptionsSpec,
              PrintReportKey, PrintOptionInputs } from "./print.options";
export { PRINT_OPTION_LABEL, PRINT_SPECS, initialPrintOptions, chromeFromOptions } from "./print.options";
export { seasonLabel, compactHeaderHTML, chromeMetaHTML, pageStampHTML, CHROME_CSS } from "./print.chrome";
export type { NameItem } from "./print.blocks";
export { sectionLogoHtml, renderNamesTable, makeTwoLogoSectionHTML, joinSections,
         makeFlightSectionHTML } from "./print.blocks";
export type { PrintOptions } from "./print.output";
export { printInPage, downloadPDF } from "./print.output";
export type { StickerConfig, StickerPassenger, StickerMeta, StickerTypes } from "./print.stickers";
export { buildStickerPageHTML, buildHandTagPageHTML, buildLongTagPageHTML, buildStickersHTML } from "./print.stickers";
export type { Manifest, CampPageType } from "./print.manifests";
export { busTitle, busRiders, busManifest,
         BUSES_DOC_TITLE, campsDocTitle, FLIGHTS_DOC_TITLE,
         campIdKeyOf, campOrderKeyOf, campTitle, campSubtitle, campDwellers, campManifest,
         flightLegOf, flightPassengers, flightManifest,
         campsInOrder, flightsInOrder } from "./print.manifests";
export { flightSection, flightReportDocument, flightsReportDocument,
         busSection, busReportDocument, busesReportDocument,
         campSection, campReportDocument, campsReportDocument,
         hotelReportDocument, hotelRoomCard, roomTypeBadge } from "./print.reports";
export type { HotelReportOptions } from "./print.reports";
export type { DocKind } from "./print.docs";
export { docFileKind, docImageBody, docFailedBody } from "./print.docs";
export type { PdfRenderOptions } from "./print.pdf";
/* ⚠️ pdf.js تُحمَّل عند الحاجة لا مع كلّ صفحة: المفسّرُ وعاملُه ثقيلان
   (‏+٣٤٤ك على الحزمة الرئيسة إن استُوردا مباشرةً)، ولا يلزمان إلا حين
   يُطبَع مستندُ PDF فعلاً. فالاستيرادُ ديناميكيّ، والحزمةُ الرئيسة
   تبقى كما كانت. */
export async function loadPdfPageRenderer() {
  const mod = await import("./print.pdf");
  return mod.renderPdfPagesToImages;
}
