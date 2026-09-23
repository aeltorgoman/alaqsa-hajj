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
import type { Passenger, Bus, Camp, Flight, Room } from "../types";
import { roomCapacity } from "../utils/room";
import { chromeMetaHTML, pageStampHTML, seasonLabel, compactHeaderHTML,
         type PrintChrome, type PrintSeason } from "./print.chrome";
import type { PrintBranding } from "./print.brand";
import { safeBranding, escapeCompanyHtml } from "./print.brand";
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
export function flightReportDocument(flight: Flight, passengers: Passenger[], branding: PrintBranding, chrome: PrintChrome = {}): string {
  return makeHTML(flightManifest(flight, passengers).docTitle, flightSection(flight, passengers, branding), branding, { chrome });
}

/** مستندُ عدّة رحلات — قسمٌ لكلٍّ، وصفحةٌ لكلِّ قسم. */
/* ⚠️ المطبوعُ الجامع كان يسقط ترويستَه كلَّها (`noHeader`) فتخرج
   الورقةُ الأولى بلا شعارٍ ولا اسمِ حملة. والهويّةُ تعود هنا —
   والهيئةُ الداخليّةُ وترتيبُها ومواقيتُها كما أُقرَّت في R1، لا تُمسّ. */
export function flightsReportDocument(flights: Flight[], passengers: Passenger[], branding: PrintBranding, chrome: PrintChrome = {}): string {
  const ordered = flightsInOrder(flights);
  if (ordered.length === 1) return flightReportDocument(ordered[0], passengers, branding, chrome);
  const sections = ordered.map(f => flightSection(f, passengers, branding));
  return makeHTML(FLIGHTS_DOC_TITLE, joinSections(sections, { pageNumbers: chrome.pageNumbers }), branding, { chrome });
}

/* ═══ الباص ═══ (الهيئةُ المقبولة في R1 — شعاران وجدولُ أسماء) */
/* الموسمُ يدخل سطرَ العنوان الثانويّ، لا حاشيةً على حافّة الورقة. */
export function busSection(bus: Bus, passengers: Passenger[], branding: PrintBranding, season?: PrintSeason): string {
  const m = busManifest(bus, passengers);
  return makeTwoLogoSectionHTML(m.title, m.subtitle,
    renderNamesTable(m.people, "اسم الحاج / الحاجة", branding.primaryColor ?? undefined), branding,
    [seasonLabel(season)]);
}

/* ⚠️ الباصُ يبقى على هيئته التشغيليّة البسيطة: لا ترويسةَ تُفرَض ولا
   ترقيمَ يُفرَض. والموسمُ **قدرةٌ** يمرّرها المنادي إن شاء، والافتراضُ
   بلا قشرةٍ إضافيّة — فمن لم يمرّر شيئاً خرجت ورقتُه كما كانت. */
/* والموسمُ لا يُمرَّر إلى القشرة أيضاً، وإلا ظهر مرّتين: هنا في
   العنوان، وهناك حاشيةً. فهو من نصيب القسم وحده. */
export function busReportDocument(bus: Bus, passengers: Passenger[], branding: PrintBranding, chrome: PrintChrome = {}): string {
  const { season, ...rest } = chrome;
  return makeHTML(busManifest(bus, passengers).docTitle, busSection(bus, passengers, branding, season), branding,
    { noHeader: true, chrome: rest });
}

export function busesReportDocument(buses: Bus[], passengers: Passenger[], branding: PrintBranding, chrome: PrintChrome = {}): string {
  const { season, ...rest } = chrome;
  return makeHTML(BUSES_DOC_TITLE,
    joinSections(buses.map(b => busSection(b, passengers, branding, season)), { pageNumbers: chrome.pageNumbers }),
    branding, { noHeader: true, chrome: rest });
}

/* ═══ المخيّم ═══ */
/* المخيّم: «مخيم منى أ» ثم «موسم حج ١٤٤٧هـ • رجال» — الجنسُ باقٍ
   ينضمّ إلى الموسم في السطر نفسه، فلا يُفقَد ولا يُزاحم. */
export function campSection(camp: Camp, passengers: Passenger[], pageType: CampPageType, branding: PrintBranding, season?: PrintSeason): string {
  const m = campManifest(camp, passengers, pageType);
  return makeTwoLogoSectionHTML(m.title, m.subtitle,
    renderNamesTable(m.people, "اسم الحاج", branding.primaryColor ?? undefined), branding,
    [seasonLabel(season)]);
}

/* منى وعرفة: الجسمُ والأعمدةُ والترتيبُ كما هي بالحرف، ويُزاد
   **الموسمُ وحده** — بالمعاملة البارزة نفسها التي نالها الباص، فتُقرأ
   الكشوفُ التشغيليّة الثلاثة أخواتٍ لا غرباء. ولا ترويسةَ ولا ترقيمَ
   ولا سعةَ ولا حاشيةَ أخرى تُزاد. */
export function campReportDocument(camp: Camp, passengers: Passenger[], pageType: CampPageType, branding: PrintBranding, chrome: PrintChrome = {}): string {
  const { season, ...rest } = chrome;
  return makeHTML(campManifest(camp, passengers, pageType).docTitle,
    campSection(camp, passengers, pageType, branding, season), branding, { noHeader: true, chrome: rest });
}

export function campsReportDocument(camps: Camp[], passengers: Passenger[], pageType: CampPageType, branding: PrintBranding, chrome: PrintChrome = {}): string {
  const { season, ...rest } = chrome;
  return makeHTML(campsDocTitle(pageType),
    joinSections(campsInOrder(camps).map(c => campSection(c, passengers, pageType, branding, season)), { pageNumbers: chrome.pageNumbers }),
    branding, { noHeader: true, chrome: rest });
}

/* ═══ الفندق ═══
   كان مستندُ الفندق يُبنى داخل `ReportsPage` وحدها، فصفحةُ الفندق —
   وهي مالكةُ النوع والسعة — لا تطبع شيئاً. وصار يُبنى هنا، فتناديه
   الصفحتان معاً كما تفعل الباصاتُ والمخيّمات والرحلات. وبهذا تكتمل
   قاعدةُ R1 على التقارير التشغيليّة كلّها.

   ⚠️ والتصحيحُ الجوهريّ: النوعُ **مقروءٌ لا مُستنتَج**. كان المطبوع
   يسمّي الغرفةَ بعدد ساكنيها (`roomLabelByCount`) — فرباعيّةٌ فيها
   اثنان تُطبَع «ثنائية» وتأخذ لونَها، و«خاص» و«مجلس» يستحيل ظهورُهما
   أصلاً. والآن: `rooms.type` هو النوع، و`roomCapacity()` هي السعة،
   والسكّانُ هم المُسنَدون. ولا سعةَ تُختلَق حين تغيب: «سعة غير
   محدّدة» تُكتب صريحةً. */

/** ألوانُ أنواع الغرف في المطبوع — الستّةُ كلُّها، ومنها «خاص» و«مجلس». */
const PRINT_ROOM_COLORS: Record<string, string> = {
  "فردية":  "#b8762a",
  "ثنائية": "#1565a8",
  "ثلاثية": "#6B21A8",
  "رباعية": "#1f8a4c",
  "خاص":    "#8B3A6B",
  "مجلس":   "#7C3AED",
};
const ROOM_COLOR_FALLBACK = "#5C1830";

/* معايرةٌ مُختبَرة بمحاكاة طباعة A4 — تبقى كما هي، ومقياسُها الآن
   سعةُ الغرفة المعتمَدة لا عددُ ساكنيها. */
/* الأربعةُ الأولى كما هي لم تُمسّ. وزِيد ما فوقها: «خاص» تُدخَل سعتُها
   صراحةً وقد تبلغ ستّاً، فكانت تُقصَر إلى الأربعة فيُرسَم ستّةُ صفوفٍ
   بخطِّ الأربعة — فتفيض عن الكرت وعن الورقة. */
const FONT_BY_MAX_CAP: Record<number, number> = { 1: 22, 2: 22, 3: 21, 4: 17, 5: 15, 6: 13.5, 7: 12, 8: 11 };
const roomFontSize = (maxCapInPage: number): number =>
  FONT_BY_MAX_CAP[Math.min(8, Math.max(1, maxCapInPage))] || 11;

/* ═══ الورقةُ الفيزيائيّة وحدةٌ واحدةٌ لا ثلاث ═══
   ⚠️ الجذرُ الذي أخطأتُه مرّتين: كنتُ أعالج الارتفاعَ بالحساب، والعطبُ
   لم يكن في الحساب بل في **البنية**. فالقشرةُ تُخرج ثلاثَ كتلٍ مستقلّة
   — ترويسةٌ قبل الجسم، وأوراقُ الشبكة، وتذييلٌ بعد الجسم — وكلٌّ منها
   شريكٌ قائمٌ بذاته في تقسيم المتصفّح. فإن لم يسع الورقةَ (ترويسةٌ +
   شبكة) دُفعت الشبكةُ كلُّها إلى الثانية وبقيت الأولى ترويسةً وحدها؛
   وإن وسعتها بالضبط خرج التذييلُ إلى ورقةٍ ثالثة. وكلُّ حسابٍ
   بالمليمتر يبقى رهنَ كسرِ مليمتر وفرقِ خطٍّ بين جهازٍ وآخر.

   فالتصحيحُ بنيويّ: `@page` بهامشٍ صفر — أي أنّ الورقةَ كلَّها ملكُ
   المحتوى — ثم كلُّ صفحةٍ مقصودةٍ **عنصرٌ واحد** مقاسُه مقاسُ الورقة
   بالضبط (٢١٠×٢٩٧ أو ٢٩٧×٢١٠) بـ`box-sizing: border-box`، يحمل داخله
   ترويستَه وعنوانَه وحواشيه وشبكتَه وترقيمَه وتذييلَه. فلا كتلةَ خارجَ
   ورقةٍ أبداً، ولا حسابَ ارتفاعٍ يُخطئ: الصندوقُ **هو** الورقة،
   و`overflow: hidden` يمنع أيَّ ابنٍ من أن يطوّله.
   والفصلُ `break-after: page` **بين** الأوراق فقط، لا بعد آخرِها. */
const SHEET_MM = {
  portrait:  { w: 210, h: 297 },
  landscape: { w: 297, h: 210 },
} as const;
/** حشوُ الورقة الداخليّ — بديلُ هامش `@page` الذي صار صفراً. */
const SHEET_PAD = "12mm 10mm";

/** وسمُ الغرفة: «رباعية — ٢/٤»، و«خاص — ٢/٦»، وبلا سعةٍ «مجلس — ٢ (سعة غير محدّدة)». */
export function roomTypeBadge(room: Room, occupancy: number): string {
  const type = (room.type || "").trim() || "—";
  const cap = roomCapacity(room);
  if (cap == null || cap === 0) return `${type} — ${occupancy} (سعة غير محدّدة)`;
  return `${type} — ${occupancy}/${cap}`;
}

/** عددُ الصفوف في كرت الغرفة — السعةُ المعتمَدة، فتظهر الأَسِرّة الشاغرة. */
const rowCountFor = (room: Room, occupancy: number): number => {
  const cap = roomCapacity(room);
  if (cap == null || cap === 0) return Math.max(occupancy, 1);
  return Math.max(cap, occupancy, 1);
};

/* الوضعُ العرضيّ يمنح الكرتَ عرضاً أكبر (نحو ٥٤مم مقابل ٤٦مم طولاً)،
   فيُعطى الاسمُ ذلك الفضلَ صراحةً: حشوٌ أضيق وعمودُ ترقيمٍ أنحف —
   فيبقى الاسمُ الطويل في سطرٍ واحدٍ ما أمكن. والمعايرةُ نفسها لا
   تُمسّ: جدولُ أحجام الخطّ وعددُ الكروت في الورقة كما هما. */
type CardMetrics = { idxWidth: number; namePad: number };
const CARD_METRICS: Record<"portrait" | "landscape", CardMetrics> = {
  portrait:  { idxWidth: 18, namePad: 7 },
  landscape: { idxWidth: 16, namePad: 5 },
};

export function hotelRoomCard(
  room: Room, occupants: { short_ar?: string; name_ar: string }[], fontSize: number, showPattern: boolean,
  orientation: "portrait" | "landscape" = "portrait",
): string {
  const { idxWidth, namePad } = CARD_METRICS[orientation];
  const type = (room.type || "").trim();
  const clr = PRINT_ROOM_COLORS[type] || ROOM_COLOR_FALLBACK;
  const rowPad = Math.round(fontSize * 0.28 * 10) / 10;
  const numSize = fontSize - 1;
  const headerFs = Math.min(15, fontSize + 2);
  const count = rowCountFor(room, occupants.length);
  const rows = Array.from({ length: count }, (_, i) => {
    const p = occupants[i];
    return p
      ? `<tr>
              <td style="text-align:center;padding:${rowPad}px 4px;font-size:${numSize}px;font-weight:600;color:#333;width:${idxWidth}px;border-bottom:1px solid rgba(0,0,0,0.12);line-height:1.2">${i + 1}</td>
              <td class="auto-fit-name" data-max-size="${fontSize}" data-pad="${namePad * 2}" style="padding:${rowPad}px ${namePad}px;font-size:${fontSize}px;font-weight:600;color:#000;border-bottom:1px solid rgba(0,0,0,0.12);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.short_ar || p.name_ar}</td>
            </tr>`
      : `<tr>
              <td style="padding:${rowPad}px 4px;border-bottom:1px solid rgba(0,0,0,0.06);width:${idxWidth}px">&nbsp;</td>
              <td style="padding:${rowPad}px ${namePad}px;border-bottom:1px solid rgba(0,0,0,0.06)">&nbsp;</td>
            </tr>`;
  }).join("");
  const cardBg = showPattern ? "rgba(255,255,255,0.4)" : "#ffffff";
  return `<div style="break-inside:avoid;border:1.5px solid ${clr};border-radius:5px;overflow:hidden;display:flex;flex-direction:column;height:100%;background:${cardBg}">
        <div style="background:${clr};color:#ffffff;padding:5px 7px;flex-shrink:0;text-align:center;font-size:${headerFs}px;font-weight:800;line-height:1.3">
          غرفة ${room.number}${room.floor ? ` — الدور ${room.floor}` : ""}
          <div style="font-size:${Math.max(9, headerFs - 4)}px;font-weight:700;opacity:.92;margin-top:1px">${roomTypeBadge(room, occupants.length)}</div>
        </div>
        <table style="margin:0;width:100%;table-layout:fixed;border-collapse:collapse;flex:1;font-family:'Cairo',sans-serif;background:transparent">
          ${rows}
        </table>
      </div>`;
}

export type HotelReportOptions = {
  landscape?: boolean;
  showPattern?: boolean;
  subtitle?: string;
  chrome?: PrintChrome;
};

/** مستندُ الفندق كاملاً — المصدرُ الوحيد لصفحةِ الفندق وصفحةِ التقارير. */
export function hotelReportDocument(
  rooms: Room[],
  passengers: Passenger[],
  branding: PrintBranding,
  options: HotelReportOptions = {},
): string {
  const { landscape = false, showPattern = true, subtitle = "", chrome = {} } = options;
  const COLS = landscape ? 5 : 4;
  const ROWS = landscape ? 3 : 4;
  const PER_PAGE = COLS * ROWS;
  const occupantsOf = (roomId: number) => passengers.filter(p => p.room_id === roomId);

  /* ═══ الدورُ حدُّ مجموعةٍ لا حدُّ صفحة ═══
     الدورُ وحدةٌ تشغيليّة: موظّفُ الفندق يحمل ورقةَ الدور ويصعد بها.
     فلو مُلئ فراغُ آخرِ ورقةٍ من الدور الثاني عشر بغرفٍ من الثالث عشر،
     حملت الورقةُ الواحدةُ دورَين — وهذا ما لا يُقرأ ولا يُوزَّع.

     فالتقسيمُ يجري **داخل كلّ دورٍ على حدة** ثم تُوصَل المجموعات:
     ثمانيةٌ وثمانيةٌ صارت ورقتين لا ورقة، وعشرون وستّةٌ صارت ثلاثاً
     (١٦ + ٤ ثم ٦). والفراغُ في آخرِ ورقةِ كلّ دورٍ مقصود.

     ⚠️ ولا يُعاد ترتيبُ شيء: الأدوارُ بترتيب أوّلِ ظهورها في المدخل،
     والغرفُ داخل الدور بترتيبها المعتمَد كما وصلت. فمن طبع دوراً
     واحداً لم يتغيّر مطبوعُه بحال. */
  const floorKeyOf = (r: Room) => (r.floor ? String(r.floor) : "");
  const byFloor = new Map<string, Room[]>();
  for (const r of rooms) {
    const k = floorKeyOf(r);
    const bucket = byFloor.get(k);
    if (bucket) bucket.push(r); else byFloor.set(k, [r]);
  }
  const pages: Room[][] = [];
  for (const floorRooms of byFloor.values()) {
    for (let i = 0; i < floorRooms.length; i += PER_PAGE) {
      pages.push(floorRooms.slice(i, i + PER_PAGE));
    }
  }

  const cairoFont = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');`;

  const { w, h } = SHEET_MM[landscape ? "landscape" : "portrait"];
  /* ترويسةُ الهويّة وحواشيها تتكرّران على كلّ ورقةٍ — فالورقةُ الثانية
     تُقرأ وحدها، ولأنّهما داخلَ الورقة لا خارجَها فلا تُقسَّمان عنها. */
  const headerHTML = compactHeaderHTML(branding, `تقرير الفندق${subtitle}`);
  const metaHTML = chromeMetaHTML(chrome);
  const { companyName, tagline, footerText } = safeBranding(branding);
  const footerLine = footerText || `${companyName}${tagline ? " — " + tagline : ""} · تقرير الفندق${subtitle}`;

  const pagesHTML = `<style>
      ${cairoFont}
      * { font-family: 'Cairo', sans-serif !important; }
      ${showPattern ? "" : "html, body { background-image: none !important; background: #ffffff !important; }"}
      /* الصندوقُ هو الورقة: مقاسُها بالضبط، وحشوُها بدل هامش @page،
         وoverflow:hidden يمنع أيَّ ابنٍ من أن يطوّلها. ولا هامشَ
         خارجيّ البتّة — الهامشُ يزيد الطولَ فيولّد ورقة. */
      .hotel-print-page {
        box-sizing: border-box; width: ${w}mm; height: ${h}mm;
        margin: 0; padding: ${SHEET_PAD}; border: 0; overflow: hidden;
        display: flex; flex-direction: column;
        break-inside: avoid; page-break-inside: avoid;
        ${showPattern ? "" : "background: #ffffff;"}
      }
      /* الفصلُ بين الأوراق فقط — ولا شيءَ بعد آخرها */
      .hotel-print-page + .hotel-print-page { break-before: page; page-break-before: always; }
      .hotel-print-page > * { flex-shrink: 0; }
      /* الشبكةُ وحدها تتمدّد لتملأ ما بقي */
      .hotel-print-page > .hotel-page { flex: 1 1 auto; min-height: 0; }
      .hotel-page { display: grid; grid-template-columns: repeat(${COLS}, 1fr); grid-template-rows: repeat(${ROWS}, 1fr); gap: 6px; box-sizing: border-box; overflow: hidden; }
      .hotel-page table { margin: 0 !important; }
      .hotel-page td { border: none; white-space: normal !important; vertical-align: middle; }
      .hotel-page tr:nth-child(even) td { background: transparent !important; }
      .hotel-print-page .doc-header { margin-bottom: 2px; }
      .hotel-print-page .page-stamp { margin-top: 3pt; }
      .hotel-foot { text-align: center; color: #aaa; font-size: 7pt; margin-top: 2pt;
                    border-top: 0.5pt solid #eee; padding-top: 3pt; }
    </style>` +
    pages.map((pageRooms, pi) => {
      /* أكبرُ سعةٍ معتمَدةٍ في الصفحة تحدّد الخطّ — لا أكبرُ إشغال */
      const maxCapInPage = Math.max(1, ...pageRooms.map(r => rowCountFor(r, occupantsOf(r.id).length)));
      const fontSize = roomFontSize(maxCapInPage);
      const padded: (Room | null)[] = [...pageRooms];
      while (padded.length < PER_PAGE) padded.push(null);
      const cells = padded.map(room =>
        room ? hotelRoomCard(room, occupantsOf(room.id), fontSize, showPattern, landscape ? "landscape" : "portrait")
             : `<div style="background:transparent"></div>`
      ).join("");
      const stamp = chrome.pageNumbers ? pageStampHTML(pi + 1, pages.length) : "";
      /* الدورُ متاحٌ على الورقة بياناً لا زينة: سمةٌ تُقرأ آلياً ولا
         تضيف حرفاً مرئيّاً إلى تقريرٍ قُبل شكلُه. */
      const pageFloor = pageRooms.length ? floorKeyOf(pageRooms[0]) : "";
      /* ورقةٌ واحدةٌ كاملة: هويّةٌ وعنوانٌ وحواشٍ وشبكةٌ وترقيمٌ وتذييل */
      return `<div class="hotel-print-page" data-floor="${escapeCompanyHtml(pageFloor)}">${headerHTML}${metaHTML}` +
             `<div class="hotel-page">${cells}</div>${stamp}` +
             `<div class="hotel-foot">${footerLine}</div></div>`;
    }).join("");

  /* ضبطُ حجم كلّ اسمٍ على حدة — منقولٌ بحرفه، ومعايرتُه مُختبَرة */
  const autoFitScript = `<script>
      (function() {
        function fitNames() {
          var cells = document.querySelectorAll('.auto-fit-name');
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');
          cells.forEach(function(cell) {
            var maxSize = parseFloat(cell.getAttribute('data-max-size')) || 17;
            var minSize = 8;
            var available = cell.clientWidth - (parseFloat(cell.getAttribute('data-pad')) || 14);
            var text = cell.textContent;
            var size = maxSize;
            while (size > minSize) {
              ctx.font = '600 ' + size + 'px Cairo, sans-serif';
              if (ctx.measureText(text).width <= available) break;
              size -= 0.5;
            }
            cell.style.fontSize = size + 'px';
          });
          document.documentElement.setAttribute('data-fit-done', '1');
        }
        function runWhenFontReady() {
          if (document.fonts && document.fonts.load) {
            Promise.all([
              document.fonts.load('600 17px Cairo'),
              document.fonts.ready
            ]).then(fitNames).catch(fitNames);
          } else {
            window.addEventListener('load', fitNames);
          }
        }
        runWhenFontReady();
      })();
    </script>`;

  /* ⚠️ القشرةُ هنا غلافٌ لا تُضيف كتلةً: لا ترويسةَ قبل الجسم ولا
     تذييلَ بعده ولا هامشَ `@page` — فالأوراقُ الصريحةُ وحدها في الجسم.
     وهذا شرطُ ألّا يقسّم المتصفّحُ ترويسةً عن شبكتها أبداً. */
  return makeHTML(`تقرير الفندق${subtitle}`, pagesHTML + autoFitScript, branding, {
    landscape,
    patternOpacity: showPattern ? 0.04 : 0,
    pageMargin: "0",
    footer: false,
    chrome: { header: "none" },
  });
}
