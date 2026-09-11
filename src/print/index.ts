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
export type { NameItem } from "./print.blocks";
export { sectionLogoHtml, renderNamesTable, makeTwoLogoSectionHTML, joinSections,
         makeFlightSectionHTML } from "./print.blocks";
export { printInPage, downloadPDF } from "./print.output";
export type { StickerConfig, StickerPassenger, StickerMeta, StickerTypes } from "./print.stickers";
export { buildStickerPageHTML, buildHandTagPageHTML, buildLongTagPageHTML, buildStickersHTML } from "./print.stickers";
export type { Manifest, CampPageType } from "./print.manifests";
export { busTitle, busRiders, busManifest,
         campIdKeyOf, campOrderKeyOf, campTitle, campSubtitle, campDwellers, campManifest,
         flightLegOf, flightPassengers, flightManifest,
         campsInOrder, flightsInOrder } from "./print.manifests";
