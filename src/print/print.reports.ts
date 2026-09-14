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
import { chromeMetaHTML, pageStampHTML, type PrintChrome } from "./print.chrome";
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
export function busSection(bus: Bus, passengers: Passenger[], branding: PrintBranding): string {
  const m = busManifest(bus, passengers);
  return makeTwoLogoSectionHTML(m.title, m.subtitle,
    renderNamesTable(m.people, "اسم الحاج / الحاجة", branding.primaryColor ?? undefined), branding);
}

/* ⚠️ الباصُ يبقى على هيئته التشغيليّة البسيطة: لا ترويسةَ تُفرَض ولا
   ترقيمَ يُفرَض. والموسمُ **قدرةٌ** يمرّرها المنادي إن شاء، والافتراضُ
   بلا قشرةٍ إضافيّة — فمن لم يمرّر شيئاً خرجت ورقتُه كما كانت. */
export function busReportDocument(bus: Bus, passengers: Passenger[], branding: PrintBranding, chrome: PrintChrome = {}): string {
  return makeHTML(busManifest(bus, passengers).docTitle, busSection(bus, passengers, branding), branding,
    { noHeader: true, chrome });
}

export function busesReportDocument(buses: Bus[], passengers: Passenger[], branding: PrintBranding, chrome: PrintChrome = {}): string {
  return makeHTML(BUSES_DOC_TITLE,
    joinSections(buses.map(b => busSection(b, passengers, branding)), { pageNumbers: chrome.pageNumbers }),
    branding, { noHeader: true, chrome });
}

/* ═══ المخيّم ═══ */
export function campSection(camp: Camp, passengers: Passenger[], pageType: CampPageType, branding: PrintBranding): string {
  const m = campManifest(camp, passengers, pageType);
  return makeTwoLogoSectionHTML(m.title, m.subtitle,
    renderNamesTable(m.people, "اسم الحاج", branding.primaryColor ?? undefined), branding);
}

/* ⚠️ منى وعرفة: «لا تغيّر فيه». القدرةُ موجودةٌ معماريّاً — `chrome`
   وسيطٌ كأيّ تقرير — لكنّ المنادي لا يمرّر شيئاً، فالمظهرُ الافتراضيّ
   هو المعتمَدُ نفسه بالحرف. ولا تُضاف ترويسةٌ ولا موسمٌ ولا ترقيمٌ
   لمجرّد أنّ القشرةَ تدعمها. */
export function campReportDocument(camp: Camp, passengers: Passenger[], pageType: CampPageType, branding: PrintBranding, chrome: PrintChrome = {}): string {
  return makeHTML(campManifest(camp, passengers, pageType).docTitle,
    campSection(camp, passengers, pageType, branding), branding, { noHeader: true, chrome });
}

export function campsReportDocument(camps: Camp[], passengers: Passenger[], pageType: CampPageType, branding: PrintBranding, chrome: PrintChrome = {}): string {
  return makeHTML(campsDocTitle(pageType),
    joinSections(campsInOrder(camps).map(c => campSection(c, passengers, pageType, branding)), { pageNumbers: chrome.pageNumbers }),
    branding, { noHeader: true, chrome });
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
const FONT_BY_MAX_CAP: Record<number, number> = { 1: 22, 2: 22, 3: 21, 4: 17 };
const roomFontSize = (maxCapInPage: number): number =>
  FONT_BY_MAX_CAP[Math.min(4, Math.max(1, maxCapInPage))] || 17;

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

export function hotelRoomCard(
  room: Room, occupants: { short_ar?: string; name_ar: string }[], fontSize: number, showPattern: boolean,
): string {
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
              <td style="text-align:center;padding:${rowPad}px 4px;font-size:${numSize}px;font-weight:600;color:#333;width:18px;border-bottom:1px solid rgba(0,0,0,0.12);line-height:1.2">${i + 1}</td>
              <td class="auto-fit-name" data-max-size="${fontSize}" style="padding:${rowPad}px 7px;font-size:${fontSize}px;font-weight:600;color:#000;border-bottom:1px solid rgba(0,0,0,0.12);line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.short_ar || p.name_ar}</td>
            </tr>`
      : `<tr>
              <td style="padding:${rowPad}px 4px;border-bottom:1px solid rgba(0,0,0,0.06);width:18px">&nbsp;</td>
              <td style="padding:${rowPad}px 7px;border-bottom:1px solid rgba(0,0,0,0.06)">&nbsp;</td>
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

  const pages: Room[][] = [];
  for (let i = 0; i < rooms.length; i += PER_PAGE) pages.push(rooms.slice(i, i + PER_PAGE));

  const cairoFont = `@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');`;
  const metaHTML = chromeMetaHTML(chrome);

  const pagesHTML = `<style>
      ${cairoFont}
      * { font-family: 'Cairo', sans-serif !important; }
      ${showPattern ? "" : "html, body { background-image: none !important; background: #ffffff !important; }"}
      .hotel-page { display: grid; grid-template-columns: repeat(${COLS}, 1fr); grid-template-rows: repeat(${ROWS}, 1fr); gap: 6px; box-sizing: border-box; ${showPattern ? "" : "background: #ffffff;"} }
      .hotel-page table { margin: 0 !important; }
      .hotel-page td { border: none; white-space: normal !important; vertical-align: middle; }
      .hotel-page tr:nth-child(even) td { background: transparent !important; }
    </style>${metaHTML}` +
    pages.map((pageRooms, pi) => {
      /* أكبرُ سعةٍ معتمَدةٍ في الصفحة تحدّد الخطّ — لا أكبرُ إشغال */
      const maxCapInPage = Math.max(1, ...pageRooms.map(r => rowCountFor(r, occupantsOf(r.id).length)));
      const fontSize = roomFontSize(maxCapInPage);
      const padded: (Room | null)[] = [...pageRooms];
      while (padded.length < PER_PAGE) padded.push(null);
      const cells = padded.map(room =>
        room ? hotelRoomCard(room, occupantsOf(room.id), fontSize, showPattern)
             : `<div style="background:transparent"></div>`
      ).join("");
      const stamp = chrome.pageNumbers ? pageStampHTML(pi + 1, pages.length) : "";
      return `<div class="hotel-page" style="page-break-after:${pi < pages.length - 1 ? "always" : "avoid"}">
          ${cells}
        </div>${stamp}`;
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
            var available = cell.clientWidth - 14;
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

  return makeHTML(`تقرير الفندق${subtitle}`, pagesHTML + autoFitScript, branding, {
    landscape,
    patternOpacity: showPattern ? 0.04 : 0,
    chrome: { ...chrome, header: chrome.header ?? "compact" },
  });
}
