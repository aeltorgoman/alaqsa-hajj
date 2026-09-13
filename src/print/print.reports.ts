// ============================================================
// مستنداتُ التقارير التشغيليّة — مصدرٌ واحد للبيانات **وللهيئة**
// ============================================================
/* الدرسُ الذي أخرجته المعاينة: توحيدُ **مصدر البيانات** لا يكفي.
   فكشفُ الرحلة كان يُبنى في `ReportsPage` بعارضِ الباص والمخيّم
   (`makeTwoLogoSectionHTML` + `renderNamesTable`) — شعاران وعنوانٌ
   كبيرٌ وجدولُ أسماء — بينما `FlightsPage` تبنيه بعارضِ الرحلة
   (`makeFlightSectionHTML`): لوحةُ بيانات الرحلة ثم جدولٌ بالجنسيّة
   والجواز والهاتف والدرجة. فالورقتان تحملان البياناتِ نفسها في
   هيئتين مختلفتين.

   ⚠️ والمشترَكُ ليس هيئةً واحدةً لكل تقرير: للرحلة هيئتُها، وللباص
   والمخيّم هيئتُهما. المشترَكُ أن **المستندَ كلَّه** يُبنى هنا مرّةً
   واحدة — بياناتُه وترتيبُه وعنوانُه وعارضُه وقشرتُه — فيستحيل أن
   يفترق مدخلان. وهيئةُ `FlightsPage` هي المرجع، ولا تُغيَّر. */
import type { Passenger, Bus, Camp, Flight } from "../types";
import type { PrintBranding } from "./print.brand";
import { makeHTML } from "./print.shell";
import { makeFlightSectionHTML, makeTwoLogoSectionHTML, renderNamesTable, joinSections } from "./print.blocks";
import { busManifest, campManifest, flightManifest, flightsInOrder, campsInOrder,
         BUSES_DOC_TITLE, campsDocTitle, FLIGHTS_DOC_TITLE, type CampPageType } from "./print.manifests";

/* ═══ الرحلة — العارضُ الخاصّ بها ═══ */
/** قسمُ رحلةٍ واحدة: لوحةُ بياناتها ثم جدولُ ركّابها. */
export function flightSection(flight: Flight, passengers: Passenger[], branding: PrintBranding): string {
  return makeFlightSectionHTML(flight, flightManifest(flight, passengers).people as never, branding);
}

/** مستندُ رحلةٍ واحدة — بترويسة التقرير الكاملة كما في صفحة الطيران. */
export function flightReportDocument(flight: Flight, passengers: Passenger[], branding: PrintBranding): string {
  return makeHTML(flightManifest(flight, passengers).docTitle, flightSection(flight, passengers, branding), branding);
}

/** مستندُ عدّة رحلات — قسمٌ لكلٍّ، وصفحةٌ لكلِّ قسم. */
export function flightsReportDocument(flights: Flight[], passengers: Passenger[], branding: PrintBranding): string {
  const ordered = flightsInOrder(flights);
  if (ordered.length === 1) return flightReportDocument(ordered[0], passengers, branding);
  const sections = ordered.map(f => flightSection(f, passengers, branding));
  return makeHTML(FLIGHTS_DOC_TITLE, joinSections(sections), branding, { noHeader: true });
}

/* ═══ الباص ═══ (الهيئةُ المقبولة في R1 — شعاران وجدولُ أسماء) */
export function busSection(bus: Bus, passengers: Passenger[], branding: PrintBranding): string {
  const m = busManifest(bus, passengers);
  return makeTwoLogoSectionHTML(m.title, m.subtitle,
    renderNamesTable(m.people, "اسم الحاج / الحاجة", branding.primaryColor ?? undefined), branding);
}

export function busReportDocument(bus: Bus, passengers: Passenger[], branding: PrintBranding): string {
  return makeHTML(busManifest(bus, passengers).docTitle, busSection(bus, passengers, branding), branding, { noHeader: true });
}

export function busesReportDocument(buses: Bus[], passengers: Passenger[], branding: PrintBranding): string {
  return makeHTML(BUSES_DOC_TITLE, joinSections(buses.map(b => busSection(b, passengers, branding))), branding, { noHeader: true });
}

/* ═══ المخيّم ═══ */
export function campSection(camp: Camp, passengers: Passenger[], pageType: CampPageType, branding: PrintBranding): string {
  const m = campManifest(camp, passengers, pageType);
  return makeTwoLogoSectionHTML(m.title, m.subtitle,
    renderNamesTable(m.people, "اسم الحاج", branding.primaryColor ?? undefined), branding);
}

export function campReportDocument(camp: Camp, passengers: Passenger[], pageType: CampPageType, branding: PrintBranding): string {
  return makeHTML(campManifest(camp, passengers, pageType).docTitle,
    campSection(camp, passengers, pageType, branding), branding, { noHeader: true });
}

export function campsReportDocument(camps: Camp[], passengers: Passenger[], pageType: CampPageType, branding: PrintBranding): string {
  return makeHTML(campsDocTitle(pageType),
    joinSections(campsInOrder(camps).map(c => campSection(c, passengers, pageType, branding))), branding, { noHeader: true });
}
